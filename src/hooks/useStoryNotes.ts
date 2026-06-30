import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { shopOwnerPubkey } from '@/lib/shopOwner';
import { isReply } from '@/lib/storyNotes';

/**
 * Fetch the shop owner's kind-1 notes for the story timeline.
 *
 * Replies (notes carrying an `e` tag) are dropped so the timeline shows only
 * top-level posts, and the result is sorted newest-first. Mirrors the
 * Nostrify + TanStack Query pattern used by {@link useProducts}.
 */
export function useStoryNotes(limit = 50) {
  const { nostr } = useNostr();
  const pubkey = shopOwnerPubkey();

  return useQuery<NostrEvent[]>({
    queryKey: ['story-notes', pubkey, limit],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);

      const filter: NostrFilter = {
        kinds: [1],
        authors: [pubkey],
        limit,
      };

      const events = await nostr.query([filter], { signal });

      return events.filter((event) => !isReply(event)).sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!pubkey,
  });
}
