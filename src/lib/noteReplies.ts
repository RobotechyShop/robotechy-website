import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Build NIP-10 tags for a kind-1 reply to a top-level story post.
 *
 * The story post is itself a root (top-level) note, so the reply marks it as the
 * `root` and tags its author with a `p` tag, per NIP-10's marked-tag scheme:
 *   - `['e', <note id>, '', 'root']`
 *   - `['p', <note author>]`
 */
export function buildReplyTags(parent: NostrEvent): string[][] {
  return [
    ['e', parent.id, '', 'root'],
    ['p', parent.pubkey],
  ];
}

/**
 * True when a kind-1 event references the given note id through an `e` tag,
 * i.e. it is a reply to (or in the thread of) that note.
 */
export function isReplyToNote(event: NostrEvent, noteId: string): boolean {
  return event.tags.some((tag) => tag[0] === 'e' && tag[1] === noteId);
}

/** Sort replies oldest-first, the natural reading order for a threaded display. */
export function sortRepliesChronologically(events: NostrEvent[]): NostrEvent[] {
  return [...events].sort((a, b) => a.created_at - b.created_at);
}
