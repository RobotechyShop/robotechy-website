import { useNostr } from '@nostrify/react';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { MERCHANT_PUBKEY } from '@/hooks/useProducts';
import { COLLECTION_KIND, PRODUCT_KIND, SHIPPING_OPTION_KIND } from '@/lib/productAdmin';

/** The addressable catalog kinds a merchant owns: products, collections, shipping options. */
export const CATALOG_KINDS = [PRODUCT_KIND, COLLECTION_KIND, SHIPPING_OPTION_KIND];

export interface RepublishResult {
  /** How many catalog events were found on the current read relays. */
  found: number;
  /** How many were successfully re-broadcast to the write relays. */
  republished: number;
  /** Successful re-broadcasts broken down by event kind. */
  byKind: Record<number, number>;
}

/** The minimal slice of the Nostrify pool that {@link republishCatalog} needs. */
export interface RepublishNostr {
  query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]>;
  event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void>;
}

/**
 * Re-broadcast the merchant's existing catalog to the currently-configured write
 * relays. Gathers the merchant's addressable catalog events from the read relays
 * and re-emits each *already-signed* event (same id/`created_at`), so relays that
 * already hold a listing no-op and newly-added relays store it — no timestamp
 * churn and no re-signing prompt.
 *
 * Kept as a plain function (not just inline in the hook) so it can be unit-tested
 * without React. Events are gathered from the current read relays, so keep at
 * least one relay that actually has the catalog (e.g. `nos.lol`) in the read set.
 */
export async function republishCatalog(nostr: RepublishNostr): Promise<RepublishResult> {
  const events = await nostr.query(
    [{ kinds: CATALOG_KINDS, authors: [MERCHANT_PUBKEY], limit: 500 }],
    { signal: AbortSignal.timeout(8000) }
  );

  // allSettled so one relay/event failing doesn't abort the rest.
  const results = await Promise.allSettled(
    events.map((ev) => nostr.event(ev, { signal: AbortSignal.timeout(8000) }))
  );

  const byKind: Record<number, number> = {};
  let republished = 0;
  events.forEach((ev, i) => {
    if (results[i].status === 'fulfilled') {
      republished += 1;
      byKind[ev.kind] = (byKind[ev.kind] ?? 0) + 1;
    }
  });

  return { found: events.length, republished, byKind };
}

/**
 * React-Query mutation wrapper around {@link republishCatalog}. Used by the
 * owner's relay settings dialog; see that component for the surfaced result.
 */
export function useRepublishCatalog(): UseMutationResult<RepublishResult, Error, void> {
  const { nostr } = useNostr();
  return useMutation({
    mutationFn: () => republishCatalog(nostr),
  });
}
