import type { NostrEvent } from '@nostrify/nostrify';
import type { ShippingOptionData } from '@/lib/productUtils';
import { toAlpha2 } from '@/lib/countries';

/**
 * Pure shipping-selection core for the country-first checkout (Gamma Markets
 * kind 30406). Deliberately UI-free so the same logic can be ported verbatim
 * to the Lightning Piggy website and mobile app.
 */

/**
 * Does a shipping option cover the given ship-to country?
 * Per the Gamma spec, `country` tags carry ISO 3166-1 alpha-2 codes; an option
 * with NO country restriction is treated as worldwide. Real events in the wild
 * (including this shop's own older options) carry alpha-3 codes ("GBR"), so
 * every code is normalised to alpha-2 before comparing.
 */
export function shipsToCountry(option: ShippingOptionData, countryCode: string): boolean {
  if (!option.countries || option.countries.length === 0) {
    return true; // no restriction -> worldwide
  }
  const code = toAlpha2(countryCode);
  if (!code) return false;
  return option.countries.some((c) => toAlpha2(c) === code);
}

/**
 * Filter options to those that ship to the selected country. An empty/missing
 * country keeps the full list (nothing chosen yet).
 */
export function filterShippingOptions(
  options: ShippingOptionData[],
  countryCode: string | undefined
): ShippingOptionData[] {
  if (!countryCode) return options;
  return options.filter((option) => shipsToCountry(option, countryCode));
}

/**
 * The cost of a shipping option: the 30406 base `price` plus the product's
 * per-option `extra-cost` (third element of the product's shipping_option tag).
 * Unparseable numbers count as 0 rather than poisoning the total with NaN.
 */
export function shippingCostFor(option: ShippingOptionData): {
  amount: number;
  currency: string;
} {
  const base = parseFloat(option.price.amount);
  const extra = option.extraCost ? parseFloat(option.extraCost) : 0;
  return {
    amount: (Number.isFinite(base) ? base : 0) + (Number.isFinite(extra) ? extra : 0),
    currency: option.price.currency,
  };
}

/** The order's `shipping` tag value per the Gamma spec: "30406:<pubkey>:<d-tag>". */
export function shippingOptionRef(option: ShippingOptionData): string {
  return `30406:${option.pubkey}:${option.id}`;
}

export interface ProductShippingRef {
  /** "30406:<pubkey>:<d-tag>" (collections' 30405 refs are not resolved here). */
  ref: string;
  /** Optional extra cost (in the product's currency) from the tag's 3rd element. */
  extraCost?: string;
}

/**
 * Read a product's `shipping_option` tags directly from its event, keeping the
 * optional extra-cost element that ProductData.shippingOptions drops.
 */
export function productShippingRefs(event: NostrEvent): ProductShippingRef[] {
  return event.tags
    .filter(([name, ref]) => name === 'shipping_option' && !!ref)
    .map(([, ref, extraCost]) => ({
      ref,
      extraCost: extraCost || undefined,
    }));
}

/**
 * Collect the distinct shipping refs across the cart's products. When several
 * products reference the same option with an extra cost, the LARGEST extra
 * cost wins — a conservative single-charge reading of the spec (the per-order
 * shipping method is chosen once, so extra costs are not stacked per product).
 */
export function collectCartShippingRefs(events: NostrEvent[]): ProductShippingRef[] {
  const byRef = new Map<string, ProductShippingRef>();
  for (const event of events) {
    for (const { ref, extraCost } of productShippingRefs(event)) {
      const existing = byRef.get(ref);
      if (!existing) {
        byRef.set(ref, { ref, extraCost });
        continue;
      }
      const a = existing.extraCost ? parseFloat(existing.extraCost) : 0;
      const b = extraCost ? parseFloat(extraCost) : 0;
      if ((Number.isFinite(b) ? b : 0) > (Number.isFinite(a) ? a : 0)) {
        byRef.set(ref, { ref, extraCost });
      }
    }
  }
  return Array.from(byRef.values());
}
