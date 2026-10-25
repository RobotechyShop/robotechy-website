/**
 * Server-side pricing: the buyer's amount is only compared, never invoiced;
 * only the merchant's signature-verified catalog sets the price.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import {
  buildVerifiedCatalog,
  convertToSats,
  MAX_QUANTITY,
  needsExchangeRates,
  priceOrder,
} from '../lib/pricing.js';
import { parseOrderEvent, parseSatAmount, MAX_ORDER_SATS } from '../lib/orderParser.js';
import {
  listing,
  merchantPk,
  orderRumor,
  RATES,
  ref,
  shippingOption,
  shopCatalog,
  shopEvents,
  UK,
  WORLD,
} from './helpers/shop.js';

const opts = { merchantPubkey: merchantPk, rates: RATES };
const price = (rumorOpts, catalog = shopCatalog()) =>
  priceOrder(parseOrderEvent(orderRumor(rumorOpts)), catalog, opts);

// 60 GBP medallion + 5 GBP UK shipping at 1,250 sats/GBP.
const MEDALLION_UK = 75_000 + 6_250;

test('a matching order is accepted and priced from the catalog', () => {
  const result = price({ amount: MEDALLION_UK });
  assert.deepEqual(result, {
    ok: true,
    totalSats: MEDALLION_UK,
    itemsSats: 75_000,
    shippingSats: 6_250,
  });
});

test('quantity multiplies the listing price', () => {
  const result = price({ amount: 3 * 75_000 + 6_250, items: [[ref('medallion'), '3']] });
  assert.equal(result.ok, true);
  assert.equal(result.totalSats, 231_250);
});

test('fiat rate drift within tolerance is accepted, but the invoice uses OUR total', () => {
  const result = price({ amount: MEDALLION_UK - 2_000 });
  assert.equal(result.ok, true);
  assert.equal(result.totalSats, MEDALLION_UK, 'server total, not the buyer amount');
});

test('an amount mismatch beyond tolerance is rejected with a readable reason', () => {
  const result = price({ amount: 1 });
  assert.equal(result.ok, false);
  assert.match(result.reason, /does not match the current price/);
  assert.match(result.reason, /81,250 sats/);
});

test('sat-priced items must match exactly (no fiat tolerance)', () => {
  // 2,100 SATS sticker + 5 GBP UK shipping: tolerance covers only the shipping.
  const exact = 2_100 + 6_250;
  const items = [[ref('sats-sticker'), '1']];
  assert.equal(price({ amount: exact, items }).ok, true);
  assert.equal(price({ amount: exact - 1_000, items }).ok, false);
});

test('an unknown item is rejected', () => {
  const result = price({ amount: MEDALLION_UK, items: [[ref('does-not-exist'), '1']] });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no longer in the Robotechy catalogue/);
});

test('an item by another author is rejected', () => {
  const otherSk = generateSecretKey();
  const otherPk = getPublicKey(otherSk);
  const events = [...shopEvents(), listing('medallion', ['0.01', 'GBP'], { sk: otherSk })];
  const result = price(
    { amount: 13 + 6_250, items: [[ref('medallion', otherPk), '1']] },
    shopCatalog(events)
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /not sold by Robotechy/);
});

test('a forged listing (tampered price) is ignored: the signature does not verify', () => {
  const genuine = listing('cheap', ['50.00', 'GBP'], { shipping: [[UK]] });
  const tampered = {
    ...genuine,
    created_at: genuine.created_at + 100, // newer, so it would win if trusted
    tags: genuine.tags.map((t) => (t[0] === 'price' ? ['price', '0.01', 'GBP'] : t)),
  };
  const catalog = shopCatalog([...shopEvents(), tampered]);
  // Only the forgery exists for this d-tag -> the item is unknown.
  assert.equal(catalog.listings.has(ref('cheap')), false);
  const result = price({ amount: 13 + 6_250, items: [[ref('cheap'), '1']] }, catalog);
  assert.equal(result.ok, false);

  // With the genuine one present too, the genuine (signed) price is used.
  const both = shopCatalog([...shopEvents(), genuine, tampered]);
  const real = price({ amount: 62_500 + 6_250, items: [[ref('cheap'), '1']] }, both);
  assert.equal(real.ok, true);
  assert.equal(real.totalSats, 68_750);
});

test('an event signed by another key but claiming the merchant pubkey is ignored', () => {
  const imposter = finalizeEvent(
    {
      kind: 30402,
      created_at: 1_900_000_000,
      content: '',
      tags: [
        ['d', 'medallion'],
        ['title', 'Medallion'],
        ['price', '0.01', 'GBP'],
      ],
    },
    generateSecretKey()
  );
  const forged = { ...imposter, pubkey: merchantPk };
  const catalog = buildVerifiedCatalog([...shopEvents(), forged], merchantPk);
  assert.equal(price({ amount: MEDALLION_UK }, catalog).totalSats, MEDALLION_UK);
});

test('the newest signed version of a listing sets the price', () => {
  const events = [
    listing('gizmo', ['1.00', 'GBP'], { shipping: [[UK]], createdAt: 10 }),
    listing('gizmo', ['8.00', 'GBP'], { shipping: [[UK]], createdAt: 20 }),
    shippingOption('ship-uk', ['5.00', 'GBP']),
  ];
  const result = price(
    { amount: 10_000 + 6_250, items: [[ref('gizmo'), '1']] },
    shopCatalog(events)
  );
  assert.equal(result.totalSats, 16_250);
});

test('excessive, zero and malformed quantities are rejected', () => {
  for (const q of [String(MAX_QUANTITY + 1), '0', '2abc', '-1', '']) {
    const result = price({ amount: MEDALLION_UK, items: [[ref('medallion'), q]] });
    assert.equal(result.ok, false, `quantity ${JSON.stringify(q)} must be rejected`);
    assert.match(result.reason, /quantity/);
  }
});

test('shipping: the product extra cost is added to the option base price', () => {
  // 4.50 GBP badge + worldwide 15.00 + 2.00 extra = 21.50 GBP.
  const result = price({ amount: 5_625 + 21_250, items: [[ref('badge'), '1']], shipping: WORLD });
  assert.equal(result.ok, true);
  assert.equal(result.shippingSats, 21_250);
});

test('shipping: an option the ordered products do not offer is rejected', () => {
  const result = price({ amount: 8_350, items: [[ref('sats-sticker'), '1']], shipping: WORLD });
  assert.equal(result.ok, false);
  assert.match(result.reason, /shipping method is not available/);
});

test('shipping: no method chosen while the merchant offers some is rejected', () => {
  const result = price({ amount: 75_000, shipping: null });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no shipping method/);
});

test("shipping: with no published options the website's legacy zones apply", () => {
  const events = [listing('medallion', ['60.00', 'GBP'])];
  const catalog = shopCatalog(events);
  // Europe zone, 15 GBP.
  const europe = price({ amount: 75_000 + 18_750, shipping: null }, catalog);
  assert.equal(europe.ok, true);
  assert.equal(europe.totalSats, 93_750);
  // Not any legacy zone.
  assert.equal(price({ amount: 200_000, shipping: null }, catalog).ok, false);
});

test('a mixed-currency cart is priced per currency', () => {
  // 60 GBP + 2,100 SATS + 5 GBP shipping.
  const result = price({
    amount: 75_000 + 2_100 + 6_250,
    items: [
      [ref('medallion'), '1'],
      [ref('sats-sticker'), '1'],
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.totalSats, 83_350);
});

test('fiat prices need rates: none means a throw, never a guess', () => {
  const order = parseOrderEvent(orderRumor({ amount: MEDALLION_UK }));
  assert.equal(needsExchangeRates(order, shopCatalog()), true);
  assert.throws(() => priceOrder(order, shopCatalog(), { merchantPubkey: merchantPk }));
  assert.throws(() => convertToSats(1, 'GBP', { satsPerUsd: 1000 }));
  // Unknown fiat codes price as USD, as on the website.
  assert.equal(convertToSats(2, 'CAD', RATES), 2_000);
  assert.equal(convertToSats(0.001, 'BTC'), 100_000);
});

test('strict amount parsing: digits only, safe, positive, capped', () => {
  assert.equal(parseSatAmount('81250'), 81_250);
  for (const bad of [
    '100abc',
    '-5',
    '0',
    '1e5',
    '1.5',
    ' 10',
    '',
    String(MAX_ORDER_SATS + 1),
    '9'.repeat(30),
  ]) {
    assert.equal(parseSatAmount(bad), null, `${JSON.stringify(bad)} must be rejected`);
  }
  assert.equal(parseOrderEvent(orderRumor({ amount: '100abc' })), null);
  assert.equal(parseOrderEvent(orderRumor({ amount: '-1' })), null);
});
