import { useNostr } from '@nostrify/react';
import { useQuery, type QueryKey, type UseQueryOptions } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import {
  applyDeletions,
  loadCatalogSnapshot,
  mergeEvents,
  selectSnapshotEvents,
} from '@/lib/catalogSnapshot';
import { MERCHANT_PUBKEY } from '@/lib/merchant';
import { SHOP_QUERY_TIMEOUT_MS, SHOP_RELAYS } from '@/lib/shopRelays';

interface ShopQueryOptions<T> {
  queryKey: QueryKey;
  filters: NostrFilter[];
  /** Turn the merged events into the hook's result (validate, sort, parse...). */
  derive: (events: NostrEvent[]) => T;
  enabled?: boolean;
  staleTime?: number;
  timeoutMs?: number;
}

const deletionsFilter: NostrFilter = { kinds: [5], authors: [MERCHANT_PUBKEY], limit: 200 };

/** The verified catalog snapshot, fetched once and shared by every shop query. */
export function useCatalogSnapshot() {
  return useQuery({
    queryKey: ['catalog-snapshot', MERCHANT_PUBKEY],
    queryFn: () => loadCatalogSnapshot(MERCHANT_PUBKEY),
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * Query shop data so the storefront renders as soon as ANY source answers:
 *
 *  - the signed catalog snapshot (verified client-side) is shown immediately
 *    as placeholder data while relays are queried;
 *  - relays are the shop's own (SHOP_RELAYS), queried directly; NPool returns
 *    shortly after the first relay's EOSE, so dead relays don't hold the page;
 *  - the final result is live data merged with the snapshot (newest version of
 *    each event wins, the shop's kind-5 deletions applied), so a relay outage
 *    degrades to the snapshot, not to blank.
 */
export function useShopQuery<T>({
  queryKey,
  filters,
  derive,
  enabled = true,
  staleTime,
  timeoutMs = SHOP_QUERY_TIMEOUT_MS,
}: ShopQueryOptions<T>) {
  const { nostr } = useNostr();
  const snapshot = useCatalogSnapshot();

  return useQuery<T, Error, T>({
    queryKey,
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(timeoutMs)]);
      const [results, snap] = await Promise.all([
        // The shop's deletions ride along so the merge below can't resurrect a
        // product the owner deleted after the snapshot was loaded.
        nostr.query([...filters, deletionsFilter], { signal, relays: [...SHOP_RELAYS] }),
        loadCatalogSnapshot(MERCHANT_PUBKEY),
      ]);
      const deletions = results.filter((e) => e.kind === 5);
      const live = results.filter((e) => e.kind !== 5);
      return derive(
        applyDeletions(mergeEvents(live, selectSnapshotEvents(snap, filters)), deletions)
      );
    },
    // Typed via a cast: TanStack's NonFunctionGuard<T> can't resolve for a generic T.
    placeholderData: (snapshot.data?.length
      ? () => derive(selectSnapshotEvents(snapshot.data, filters))
      : undefined) as UseQueryOptions<T, Error, T>['placeholderData'],
    enabled,
    staleTime,
  });
}
