import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { isReplyToNote, sortRepliesChronologically } from '@/lib/noteReplies';

/**
 * Fetch the kind-1 replies (NIP-10) that reference a given story note, authored
 * by anyone, for threaded display under the post. Mirrors the Nostrify +
 * TanStack Query pattern used by {@link useStoryNotes}; results are filtered to
 * events that actually carry an `e` tag for the note and sorted oldest-first.
 */
export function useNoteReplies(noteId: string | undefined, limit = 100) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['note-replies', noteId, limit],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);

      const filter: NostrFilter = {
        kinds: [1],
        '#e': [noteId!],
        limit,
      };

      const events = await nostr.query([filter], { signal });

      return sortRepliesChronologically(events.filter((event) => isReplyToNote(event, noteId!)));
    },
    enabled: !!noteId,
  });
}
