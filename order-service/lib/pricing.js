/**
 * Server-side order pricing. The buyer's `amount` tag is untrusted: this module
 * recomputes the order total from the shop's OWN signed catalog (kind-30402
 * listings and kind-30406 shipping options) and decides whether the order may
 * be invoiced. The service then invoices the figure computed here, never the
 * buyer's.
 *
 * The arithmetic mirrors the website checkout so honest orders agree with it:
 *   - listing price          src/lib/productUtils.ts      parseProductEvent (currency defaults to USD)
 *   - cart subtotal          src/hooks/useCart.ts         totalPrice (parseFloat(price) * quantity)
 *   - shipping refs + extra  src/lib/shippingSelection.ts collectCartShippingRefs / shippingCostFor
 *   - which options apply    src/hooks/useCheckoutShippingOptions.ts (referenced, else all
 *                            merchant options, else ShippingForm's legacy zones)
 *   - fiat -> sats           src/hooks/useExchangeRate.ts convertToSats
 *   - order total            src/hooks/useGammaCheckout.ts submitOrder (items + shipping, each
 *                            converted in its own currency)
 *
 * Deliberate differences, all fail-closed: listings and shipping options must
 * be authored by the merchant and carry a valid signature; a mixed-currency
 * cart is priced per currency (the website adds raw amounts as if they shared
 * the first item's currency); negative prices are refused; the chosen shipping
 * option must cover the ship-to country (src/lib/shippingSelection.ts
 * shipsToCountry), and when that country can't be determined only
 * unrestricted options are accepted.
 *
 * Everything here is pure (no network, no clock): the catalog and the exchange
 * rates are passed in, so every branch is unit-testable.
 */

import { isSignedEvent } from './eventArchive.js';
import { MAX_ORDER_SATS } from './orderParser.js';

export const PRODUCT_KIND = 30402;
export const SHIPPING_OPTION_KIND = 30406;
export const SATS_PER_BTC = 100_000_000;

/** Per-line quantity cap. The website has no cart cap; nothing sells in these volumes. */
export const MAX_QUANTITY = 999;

/** Item lines per order (bounds the catalog relay query). */
export const MAX_ORDER_LINES = 100;

/**
 * Allowed relative difference between the buyer's amount and ours for the part
 * of the total that was converted from fiat. The buyer's browser and this
 * service average BTC prices from the same three exchanges, but at different
 * moments (the checkout caches its rates from page load), so they never agree
 * to the sat. Sat/BTC-priced parts must match exactly. Whatever the buyer
 * stated, the invoice is always for OUR total.
 */
export const FIAT_RATE_TOLERANCE = 0.05;

/**
 * The website's legacy shipping zones (src/components/checkout/ShippingForm.tsx
 * DEFAULT_SHIPPING_OPTIONS), offered only when the merchant publishes NO
 * shipping options at all. They aren't events, so the order carries no
 * `shipping` tag and we can't tell which one was picked: an order is accepted
 * when its amount matches one of them.
 */
const LEGACY_EU_COUNTRIES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IS',
  'IT',
  'LI',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
  'ES',
  'CH',
];

export const LEGACY_SHIPPING_ZONES = [
  { title: 'UK', amount: 0, currency: 'GBP', countries: ['GB'] },
  { title: 'Europe', amount: 15, currency: 'GBP', countries: LEGACY_EU_COUNTRIES },
  { title: 'Worldwide', amount: 25, currency: 'GBP', countries: [] },
];

let englishCountryNames = null;

/** English region name -> alpha-2 code, built once from ICU (as Intl.DisplayNames in the browser). */
function countryCodeForName(name) {
  if (!englishCountryNames) {
    englishCountryNames = new Map();
    const names = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
    for (let a = 65; a <= 90; a += 1) {
      for (let b = 65; b <= 90; b += 1) {
        const code = String.fromCharCode(a, b);
        // Skip deprecated aliases (UK -> GB, BU -> MM, ...) that share a name.
        if (Intl.getCanonicalLocales(`und-${code}`)[0] !== `und-${code}`) continue;
        const label = names.of(code);
        if (label) englishCountryNames.set(label.toLowerCase(), code);
      }
    }
  }
  return englishCountryNames.get(name.trim().toLowerCase());
}

/**
 * The order's ship-to country (alpha-2), or null when it can't be determined.
 *
 * The checkout sends it as a `country` tag; the `address` tag also ends with
 * the country's display name (gammaOrderUtils.ts formatAddress), localised to
 * the buyer's browser. When that name is recognisably ANOTHER country than the
 * tag, the order is inconsistent and gets null. Without a tag (older clients)
 * an English country name in the address is used.
 */
export function destinationCountry(order) {
  const lastSegment = (order.address ?? '').split(',').at(-1) ?? '';
  const fromAddress = lastSegment ? countryCodeForName(lastSegment) : undefined;
  if (order.countryCode) {
    return fromAddress && fromAddress !== order.countryCode ? null : order.countryCode;
  }
  return fromAddress ?? null;
}

/**
 * shippingSelection.ts shipsToCountry: no `country` tag means worldwide.
 * Codes are compared as alpha-2; anything else never matches (fail closed).
 * An unknown destination only matches unrestricted options.
 */
export function shipsToCountry(countries, countryCode) {
  if (countries.length === 0) return true;
  if (!countryCode) return false;
  return countries.some((c) => typeof c === 'string' && c.trim().toUpperCase() === countryCode);
}

/** All values of an option event's `country` tags (one multi-value tag or several). */
function optionCountries(event) {
  return event.tags
    .filter((t) => t[0] === 'country')
    .flatMap(([, ...codes]) => codes)
    .filter(Boolean);
}

function firstTagValue(event, name) {
  const tag = event.tags.find((t) => t[0] === name);
  return typeof tag?.[1] === 'string' ? tag[1] : undefined;
}

export { isSignedEvent };

/**
 * Reduce relay events to the merchant's VERIFIED catalog: only kind
 * 30402/30406 events authored by `merchantPubkey` whose signature verifies,
 * newest per (kind, d-tag) — both kinds are addressable.
 *
 * @param {object[]} events
 * @param {string} merchantPubkey
 * @returns {{ listings: Map<string, object>, shippingOptions: Map<string, object> }}
 *   keyed by coordinate "<kind>:<pubkey>:<d>"
 */
export function buildVerifiedCatalog(events, merchantPubkey) {
  const newest = new Map();
  for (const event of events) {
    if (event?.kind !== PRODUCT_KIND && event?.kind !== SHIPPING_OPTION_KIND) continue;
    if (event.pubkey !== merchantPubkey) continue;
    if (!Array.isArray(event.tags)) continue;
    const d = firstTagValue(event, 'd');
    if (!d) continue;
    const coord = `${event.kind}:${event.pubkey}:${d}`;
    const existing = newest.get(coord);
    if (existing && existing.created_at >= event.created_at) continue;
    // Signature last, after the cheap filters, so relay junk costs nothing.
    if (!isSignedEvent(event)) continue;
    newest.set(coord, event);
  }
  const listings = new Map();
  const shippingOptions = new Map();
  for (const [coord, event] of newest) {
    (event.kind === PRODUCT_KIND ? listings : shippingOptions).set(coord, event);
  }
  return { listings, shippingOptions };
}

/** parseFloat that yields 0 for junk, exactly as the website reads amounts. */
function floatOrZero(raw) {
  const value = raw ? parseFloat(raw) : 0;
  return Number.isFinite(value) ? value : 0;
}

/**
 * productUtils.ts parseProductEvent: needs d, title and a price tag; amount
 * defaults to '0', currency to USD. Returns null when the website wouldn't
 * list the product or the price is negative.
 */
export function parseListingPrice(event) {
  const priceTag = event.tags.find((t) => t[0] === 'price');
  if (!firstTagValue(event, 'd') || !firstTagValue(event, 'title') || !priceTag) return null;
  const amount = floatOrZero(priceTag[1] || '0');
  if (amount < 0) return null;
  return { amount, currency: priceTag[2] || 'USD' };
}

/** productUtils.ts parseShippingOptionEvent price: needs d, title, price; currency defaults to USD. */
export function parseShippingOptionPrice(event) {
  const priceTag = event.tags.find((t) => t[0] === 'price');
  if (!firstTagValue(event, 'd') || !firstTagValue(event, 'title') || !priceTag) return null;
  return { amount: priceTag[1] || '0', currency: priceTag[2] || 'USD' };
}

/**
 * shippingSelection.ts collectCartShippingRefs: the distinct `shipping_option`
 * refs across the ordered listings; the LARGEST extra cost wins per ref.
 * @returns {Map<string, string | undefined>} ref -> extra cost
 */
export function collectShippingRefs(listingEvents) {
  const byRef = new Map();
  for (const event of listingEvents) {
    for (const [name, ref, extraCost] of event.tags) {
      if (name !== 'shipping_option' || !ref) continue;
      const extra = extraCost || undefined;
      if (!byRef.has(ref) || floatOrZero(extra) > floatOrZero(byRef.get(ref))) {
        byRef.set(ref, extra);
      }
    }
  }
  return byRef;
}

/** Is a currency code priced in bitcoin units (exact, no exchange rate)? */
export function isBitcoinCurrency(currency) {
  const upper = currency.toUpperCase();
  return upper === 'SAT' || upper === 'SATS' || upper === 'BTC';
}

/** Which rate a fiat currency converts with (unknown codes price as USD, as on the website). */
function rateKeyFor(currency) {
  const upper = currency.toUpperCase();
  if (upper === 'GBP' || upper === '£') return 'satsPerGbp';
  if (upper === 'EUR' || upper === '€') return 'satsPerEur';
  return 'satsPerUsd';
}

/**
 * useExchangeRate.ts convertToSats, with the rates passed in. `rates` is
 * `{ satsPerGbp, satsPerUsd, satsPerEur }` (each Math.round(1e8 / btcPrice),
 * exactly as the hook derives them). Unlike the website there are no
 * hard-coded fallback rates: a missing rate throws, so the order is never
 * priced from a guess.
 */
export function convertToSats(amount, currency, rates) {
  const upper = currency.toUpperCase();
  if (upper === 'SAT' || upper === 'SATS') return Math.round(amount);
  if (upper === 'BTC') return Math.round(amount * SATS_PER_BTC);
  const rate = rates?.[rateKeyFor(upper)];
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`No exchange rate available to price ${upper}`);
  }
  return Math.round(amount * rate);
}

/** True when pricing this order (against this catalog) needs a fiat exchange rate. */
export function needsExchangeRates(order, catalog) {
  const currencies = [];
  for (const item of order.items) {
    const event = catalog.listings.get(item.ref);
    const price = event && parseListingPrice(event);
    if (price) currencies.push(price.currency);
  }
  for (const event of catalog.shippingOptions.values()) {
    const price = parseShippingOptionPrice(event);
    if (price) currencies.push(price.currency);
  }
  if (catalog.shippingOptions.size === 0) {
    currencies.push(...LEGACY_SHIPPING_ZONES.map((zone) => zone.currency));
  }
  return currencies.some((currency) => !isBitcoinCurrency(currency));
}

const reject = (reason) => ({ ok: false, reason });

/**
 * Recompute an order's total in sats from the verified catalog and decide
 * whether to accept it.
 *
 * Rejects (with a buyer-readable reason) when:
 *   - the order has no items or too many lines, or a quantity is missing,
 *     malformed or over MAX_QUANTITY
 *   - an item ref isn't "30402:<merchant>:<d>" (wrong author), isn't in the
 *     verified catalog (unknown, forged or deleted item) or has no valid price
 *   - the shipping ref isn't a verified merchant option the cart may use, or
 *     no shipping method was chosen although the merchant offers some
 *   - the total is outside 1..MAX_ORDER_SATS
 *   - the buyer's amount differs from ours (beyond the fiat tolerance)
 *
 * @param {{ amount: number, items: Array<{ref: string, quantity: number|null}>, shippingRef?: string }} order
 * @param {{ listings: Map<string, object>, shippingOptions: Map<string, object> }} catalog - from buildVerifiedCatalog
 * @param {{ merchantPubkey: string, merchantName?: string, rates?: { satsPerGbp: number, satsPerUsd: number, satsPerEur: number } }} opts
 * @returns {{ ok: true, totalSats: number, itemsSats: number, shippingSats: number }
 *   | { ok: false, reason: string }}
 */
export function priceOrder(order, catalog, { merchantPubkey, merchantName = 'Robotechy', rates }) {
  if (order.items.length === 0) return reject('the order has no items');
  if (order.items.length > MAX_ORDER_LINES) {
    return reject(`an order can have at most ${MAX_ORDER_LINES} different items`);
  }

  // Items: sum per currency, then convert each currency once. For a
  // single-currency cart (the website's assumption) this is exactly
  // convertToSats(totalPrice, currency).
  const perCurrency = new Map();
  const listingEvents = [];
  for (const item of order.items) {
    if (item.quantity === null || item.quantity < 1 || item.quantity > MAX_QUANTITY) {
      return reject(`each item quantity must be a whole number from 1 to ${MAX_QUANTITY}`);
    }
    const parts = typeof item.ref === 'string' ? item.ref.split(':') : [];
    if (parts.length < 3 || parts[0] !== String(PRODUCT_KIND)) {
      return reject('an item reference is malformed');
    }
    if (parts[1] !== merchantPubkey) return reject(`an item is not sold by ${merchantName}`);
    const event = catalog.listings.get(item.ref);
    if (!event) return reject(`an item is no longer in the ${merchantName} catalogue`);
    const price = parseListingPrice(event);
    if (!price) return reject('an item has no valid price');
    const key = price.currency.toUpperCase();
    perCurrency.set(key, (perCurrency.get(key) ?? 0) + price.amount * item.quantity);
    listingEvents.push(event);
  }

  let itemsSats = 0;
  let itemsFiatSats = 0;
  for (const [currency, amount] of perCurrency) {
    const sats = convertToSats(amount, currency, rates);
    itemsSats += sats;
    if (!isBitcoinCurrency(currency)) itemsFiatSats += sats;
  }

  // Shipping candidates, as the checkout offers them: the options the ordered
  // products reference, else every merchant option, else the legacy zones.
  const refs = collectShippingRefs(listingEvents);
  const usable = [...catalog.shippingOptions.keys()].filter((ref) =>
    parseShippingOptionPrice(catalog.shippingOptions.get(ref))
  );
  const referenced = usable.filter((ref) => refs.has(ref));
  const allowed = referenced.length > 0 ? referenced : usable;

  /** @type {Array<{ sats: number, fiatSats: number }>} */
  let shippingCandidates;
  const country = destinationCountry(order);
  if (order.shippingRef) {
    if (!allowed.includes(order.shippingRef)) {
      return reject('the chosen shipping method is not available for these items');
    }
    if (!shipsToCountry(optionCountries(catalog.shippingOptions.get(order.shippingRef)), country)) {
      return reject(
        country
          ? 'the chosen shipping method does not deliver to the ship-to country'
          : "we couldn't tell which country the order ships to"
      );
    }
    const price = parseShippingOptionPrice(catalog.shippingOptions.get(order.shippingRef));
    // shippingSelection.ts shippingCostFor: base + the product's extra cost.
    const cost = floatOrZero(price.amount) + floatOrZero(refs.get(order.shippingRef));
    if (cost < 0) return reject('the chosen shipping method has an invalid price');
    // useGammaCheckout: `shippingCost ? convertToSats(...) : 0`.
    const sats = cost ? convertToSats(cost, price.currency, rates) : 0;
    shippingCandidates = [{ sats, fiatSats: isBitcoinCurrency(price.currency) ? 0 : sats }];
  } else if (allowed.length > 0) {
    return reject('no shipping method was chosen');
  } else {
    shippingCandidates = LEGACY_SHIPPING_ZONES.filter((zone) =>
      shipsToCountry(zone.countries, country)
    ).map((zone) => {
      const sats = zone.amount ? convertToSats(zone.amount, zone.currency, rates) : 0;
      return { sats, fiatSats: isBitcoinCurrency(zone.currency) ? 0 : sats };
    });
  }

  // Pick the candidate closest to what the buyer stated (only the legacy
  // zones ever give more than one), then check it against the tolerance.
  let best = null;
  for (const candidate of shippingCandidates) {
    const totalSats = itemsSats + candidate.sats;
    const diff = Math.abs(order.amount - totalSats);
    if (!best || diff < best.diff) best = { ...candidate, totalSats, diff };
  }

  const { totalSats } = best;
  if (!Number.isSafeInteger(totalSats) || totalSats <= 0 || totalSats > MAX_ORDER_SATS) {
    return reject('the order total is outside the range we can invoice');
  }

  const tolerance = Math.ceil((itemsFiatSats + best.fiatSats) * FIAT_RATE_TOLERANCE);
  if (best.diff > tolerance) {
    return reject(
      `the order amount (${order.amount.toLocaleString('en-GB')} sats) does not match the current price (${totalSats.toLocaleString('en-GB')} sats)`
    );
  }

  return { ok: true, totalSats, itemsSats, shippingSats: best.sats };
}
