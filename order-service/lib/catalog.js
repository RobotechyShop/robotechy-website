/**
 * Fetch the slice of the shop's catalog an order needs — the ordered kind-30402
 * listings and every kind-30406 shipping option — and reduce it to the
 * signature-verified, merchant-authored set (lib/pricing.js buildVerifiedCatalog).
 */

import { buildVerifiedCatalog, PRODUCT_KIND, SHIPPING_OPTION_KIND } from './pricing.js';

const CATALOG_QUERY_WAIT_MS = 8000;

/**
 * @param {{ querySync: Function }} pool - a nostr-tools SimplePool (it also
 *   verifies signatures on receipt; buildVerifiedCatalog re-checks regardless)
 * @param {string[]} relays
 * @param {{ items: Array<{ ref: string }> }} order
 * @param {string} merchantPubkey
 * @returns {Promise<ReturnType<typeof buildVerifiedCatalog>>}
 * @throws when no relay returned anything at all — a relay outage must leave
 *   the order retryable, not get it cancelled as "unknown item"
 */
export async function loadCatalog(pool, relays, order, merchantPubkey) {
  const dTags = [
    ...new Set(
      order.items
        .map((item) => (typeof item.ref === 'string' ? item.ref.split(':') : []))
        .filter(
          (parts) =>
            parts.length >= 3 && parts[0] === String(PRODUCT_KIND) && parts[1] === merchantPubkey
        )
        .map((parts) => parts.slice(2).join(':'))
    ),
  ];
  // Nothing this merchant sells: pricing rejects the order, no fetch needed.
  if (dTags.length === 0) return buildVerifiedCatalog([], merchantPubkey);

  const opts = { maxWait: CATALOG_QUERY_WAIT_MS };
  const [listings, shippingOptions] = await Promise.all([
    pool.querySync(relays, { kinds: [PRODUCT_KIND], authors: [merchantPubkey], '#d': dTags }, opts),
    pool.querySync(
      relays,
      { kinds: [SHIPPING_OPTION_KIND], authors: [merchantPubkey], limit: 100 },
      opts
    ),
  ]);
  const events = [...listings, ...shippingOptions];
  if (events.length === 0) {
    throw new Error('Catalog unavailable: no relay returned any listings or shipping options');
  }
  // Shipping options arrived but none of the ordered listings did: treat it as a
  // relay failure (retried) rather than "not in the catalogue" (cancelled).
  if (listings.length === 0) {
    throw new Error('Catalog unavailable: no relay returned the ordered listings');
  }
  return buildVerifiedCatalog(events, merchantPubkey);
}
