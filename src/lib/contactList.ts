/**
 * Helpers for working with a NIP-02 kind-3 contact list (the "following" list).
 *
 * A contact list is a kind-3 event whose `tags` hold one `['p', pubkey, ...]`
 * entry per followed account. These helpers add a follow without clobbering any
 * existing follows (or the extra relay/petname columns on a `p` tag), and read
 * whether a given pubkey is already followed.
 */

/** True if `tags` already contains a `['p', pubkey]` entry for `pubkey`. */
export function isFollowing(tags: string[][], pubkey: string): boolean {
  return tags.some(([name, value]) => name === 'p' && value === pubkey);
}

/**
 * Return a new tags array that follows `pubkey`: the original tags (all `p`
 * follows and any other tags preserved verbatim, including relay/petname
 * columns) plus a `['p', pubkey]` entry if it is not already present.
 *
 * The input array is not mutated. If `pubkey` is already followed the original
 * tags are returned unchanged (a fresh copy).
 */
export function addFollow(tags: string[][], pubkey: string): string[][] {
  if (isFollowing(tags, pubkey)) {
    return tags.map((tag) => [...tag]);
  }
  return [...tags.map((tag) => [...tag]), ['p', pubkey]];
}
