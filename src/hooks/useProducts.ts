import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

// Decode the merchant npub
const MERCHANT_NPUB = 'npub1yy0nyk6nj6tg4sx8nd7q5qcdw6pqd5e2cc0e8u2rmcgjhpvm63hsk67xe5';
const MERCHANT_PUBKEY = nip19.decode(MERCHANT_NPUB).data as string;

interface ProductFilter {
  collectionId?: string;
  category?: string;
  limit?: number;
}

function validateProduct(event: NostrEvent): boolean {
  // Check if it's a product kind (NIP-99 with Gamma Markets spec)
  if (event.kind !== 30402) return false;

  // Check for required tags
  const d = event.tags.find(([name]) => name === 'd')?.[1];
  const title = event.tags.find(([name]) => name === 'title')?.[1];
  const price = event.tags.find(([name]) => name === 'price');

  if (!d || !title || !price) {
    return false;
  }

  return true;
}

export function useProducts(filter: ProductFilter = {}) {
  const { nostr } = useNostr();
  const { collectionId, category, limit = 100 } = filter;

  return useQuery({
    queryKey: ['products', MERCHANT_PUBKEY, collectionId, category, limit],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);

      const filter: NostrFilter = {
        kinds: [30402], // NIP-99 product events (Gamma Markets spec)
        authors: [MERCHANT_PUBKEY],
        limit,
      };

      if (category) {
        filter['#t'] = [category];
      }

      const filters: NostrFilter[] = [filter];

      const events = await nostr.query(filters, { signal });

      // Filter valid products
      let validProducts = events.filter(validateProduct);

      // Filter by visibility (only show on-sale products by default)
      validProducts = validProducts.filter((event) => {
        const visibility = event.tags.find(([name]) => name === 'visibility')?.[1];
        return !visibility || visibility === 'on-sale';
      });

      // Sort by newest first
      return validProducts.sort((a, b) => b.created_at - a.created_at);
    },
  });
}

export function useProduct(identifier: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['product', MERCHANT_PUBKEY, identifier],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);

      const productFilter: NostrFilter = {
        kinds: [30402],
        authors: [MERCHANT_PUBKEY],
        '#d': [identifier],
      };

      const events = await nostr.query([productFilter], { signal });
      const validProducts = events.filter(validateProduct);

      // Return the most recent valid product
      return validProducts.sort((a, b) => b.created_at - a.created_at)[0] || null;
    },
    enabled: !!identifier,
  });
}

export function useCollections() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['collections', MERCHANT_PUBKEY],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);

      const events = await nostr.query(
        [
          {
            kinds: [30405], // Product collection events
            authors: [MERCHANT_PUBKEY],
          },
        ],
        { signal }
      );

      // Validate and parse collections
      const validCollections = events.filter((event) => {
        const d = event.tags.find(([name]) => name === 'd')?.[1];
        const title = event.tags.find(([name]) => name === 'title')?.[1];
        return d && title;
      });

      return validCollections.sort((a, b) => b.created_at - a.created_at);
    },
  });
}

export { MERCHANT_PUBKEY };
