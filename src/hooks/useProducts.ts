import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useShopQuery } from '@/hooks/useShopQuery';
import { MERCHANT_PUBKEY } from '@/lib/merchant';

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
  const { collectionId, category, limit = 100 } = filter;

  const productFilter: NostrFilter = {
    kinds: [30402], // NIP-99 product events (Gamma Markets spec)
    authors: [MERCHANT_PUBKEY],
    limit,
  };
  if (category) {
    productFilter['#t'] = [category];
  }

  return useShopQuery({
    queryKey: ['products', MERCHANT_PUBKEY, collectionId, category, limit],
    filters: [productFilter],
    derive: (events) =>
      events
        .filter(validateProduct)
        // Only show on-sale products by default
        .filter((event) => {
          const visibility = event.tags.find(([name]) => name === 'visibility')?.[1];
          return !visibility || visibility === 'on-sale';
        })
        // Newest first
        .sort((a, b) => b.created_at - a.created_at),
  });
}

export function useProduct(identifier: string) {
  return useShopQuery({
    queryKey: ['product', MERCHANT_PUBKEY, identifier],
    filters: [{ kinds: [30402], authors: [MERCHANT_PUBKEY], '#d': [identifier] }],
    // The most recent valid product
    derive: (events) =>
      events.filter(validateProduct).sort((a, b) => b.created_at - a.created_at)[0] || null,
    enabled: !!identifier,
  });
}

export function useCollections() {
  return useShopQuery({
    queryKey: ['collections', MERCHANT_PUBKEY],
    filters: [{ kinds: [30405], authors: [MERCHANT_PUBKEY] }], // Product collections
    derive: (events) =>
      events
        .filter((event) => {
          const d = event.tags.find(([name]) => name === 'd')?.[1];
          const title = event.tags.find(([name]) => name === 'title')?.[1];
          return d && title;
        })
        .sort((a, b) => b.created_at - a.created_at),
  });
}

// Re-exported for existing importers; the source of truth is @/lib/merchant.
export { MERCHANT_PUBKEY };
