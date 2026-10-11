import type { NostrEvent } from '@nostrify/nostrify';

import { useShopQuery } from '@/hooks/useShopQuery';
import { MERCHANT_PUBKEY } from '@/lib/merchant';
import { SHIPPING_OPTION_KIND } from '@/lib/productAdmin';

/**
 * Fetches ALL shipping-option events (kind 30406) authored by the merchant — the
 * owner's shipping methods/zones/costs, for the management UI. (Distinct from
 * `useShippingOptions`, which resolves the specific options a product references.)
 *
 * @param enabled - set false to skip the relay query entirely (e.g. the checkout
 *   only needs this as a fallback when the products reference no options).
 */
export function useMerchantShippingOptions(enabled = true) {
  return useShopQuery({
    enabled,
    queryKey: ['shipping-options', 'merchant', MERCHANT_PUBKEY],
    filters: [{ kinds: [SHIPPING_OPTION_KIND], authors: [MERCHANT_PUBKEY], limit: 100 }],
    derive: (events) => {
      // Kind 30406 is addressable: relays may return several versions sharing a
      // `d` tag. Keep only the newest per `d` so the management UI shows one row
      // per shipping option (and edits target the current version).
      const newestByD = new Map<string, NostrEvent>();
      for (const event of events) {
        const d = event.tags.find(([name]) => name === 'd')?.[1];
        if (!d) continue;
        const existing = newestByD.get(d);
        if (!existing || event.created_at > existing.created_at) {
          newestByD.set(d, event);
        }
      }
      return Array.from(newestByD.values()).sort((a, b) => b.created_at - a.created_at);
    },
  });
}
