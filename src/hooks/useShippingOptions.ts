import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { parseShippingOptionEvent, type ShippingOptionData } from '@/lib/productUtils';

interface UseShippingOptionsParams {
  shippingOptionRefs: string[]; // Format: "30406:<pubkey>:<d-tag>" or with extra cost
}

/**
 * Fetches Kind 30406 shipping option events referenced by a product.
 * Products reference shipping options via shipping_option tags in format:
 * ["shipping_option", "30406:<pubkey>:<d-tag>", "<extra-cost>"]
 */
export function useShippingOptions({ shippingOptionRefs }: UseShippingOptionsParams) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['shipping-options', shippingOptionRefs],
    queryFn: async (c) => {
      if (shippingOptionRefs.length === 0) {
        return [];
      }

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);

      // Parse the naddr references to extract pubkeys and d-tags
      const parsedRefs = shippingOptionRefs
        .map((ref) => {
          // Format: "30406:<pubkey>:<d-tag>" with optional extra cost in tag[2]
          const parts = ref.split(':');
          if (parts.length >= 3 && parts[0] === '30406') {
            return {
              pubkey: parts[1],
              dTag: parts.slice(2).join(':'), // Handle d-tags with colons
              extraCost: undefined as string | undefined,
            };
          }
          return null;
        })
        .filter((ref): ref is NonNullable<typeof ref> => ref !== null);

      if (parsedRefs.length === 0) {
        return [];
      }

      // Query for shipping option events
      const filters = parsedRefs.map((ref) => ({
        kinds: [30406],
        authors: [ref.pubkey],
        '#d': [ref.dTag],
      }));

      const events = await nostr.query(filters, { signal });

      // Parse events into ShippingOptionData
      const shippingOptions: ShippingOptionData[] = [];
      for (const event of events) {
        // Find the matching ref to get any extra cost
        const matchingRef = parsedRefs.find(
          (ref) =>
            ref.pubkey === event.pubkey &&
            event.tags.find(([name, value]) => name === 'd' && value === ref.dTag)
        );

        const parsed = parseShippingOptionEvent(event, matchingRef?.extraCost);
        if (parsed) {
          shippingOptions.push(parsed);
        }
      }

      return shippingOptions;
    },
    enabled: shippingOptionRefs.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
