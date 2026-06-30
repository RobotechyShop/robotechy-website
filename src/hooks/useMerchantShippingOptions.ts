import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { MERCHANT_PUBKEY } from '@/hooks/useProducts';
import { SHIPPING_OPTION_KIND } from '@/lib/productAdmin';

/**
 * Fetches ALL shipping-option events (kind 30406) authored by the merchant — the
 * owner's shipping methods/zones/costs, for the management UI. (Distinct from
 * `useShippingOptions`, which resolves the specific options a product references.)
 */
export function useMerchantShippingOptions() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['shipping-options', 'merchant', MERCHANT_PUBKEY],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);
      const events = await nostr.query(
        [{ kinds: [SHIPPING_OPTION_KIND], authors: [MERCHANT_PUBKEY], limit: 100 }],
        { signal }
      );
      return events
        .filter((event) => event.tags.some(([name]) => name === 'd'))
        .sort((a, b) => b.created_at - a.created_at);
    },
  });
}
