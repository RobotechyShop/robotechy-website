import { NKinds, type NostrEvent, type NostrFilter } from '@nostrify/nostrify';

/**
 * NIP-22 comment kind. Product comments on NIP-99 / Gamma Markets listings are
 * plain kind-1111 comments rooted on the addressable kind-30402 product event
 * (coordinate `30402:<merchantPubkey>:<dTag>`).
 */
export const COMMENT_KIND = 1111;

/** Read the first value of a tag, or `undefined` when the tag is absent. */
export function getTagValue(event: NostrEvent, tagName: string): string | undefined {
  return event.tags.find(([name]) => name === tagName)?.[1];
}

/** The `d`-tag identifier of an event, or `''` when it has none. */
export function dTagOf(event: NostrEvent): string {
  return getTagValue(event, 'd') ?? '';
}

/**
 * The addressable/replaceable coordinate (`<kind>:<pubkey>:<d>`) for an event.
 * Replaceable (non-parameterised) events have an empty `d`, matching NIP-01.
 */
export function addressableCoord(event: NostrEvent): string {
  return `${event.kind}:${event.pubkey}:${dTagOf(event)}`;
}

/**
 * A stable cache/identity key for a comment thread's root.
 *
 * Addressable and replaceable events are rooted on their coordinate
 * (`<kind>:<pubkey>:<d>`), which survives listing edits even though the event
 * `id` changes; regular events use their `id`; URL roots use their string. Use
 * this for the React-Query key, query invalidation and the React remount `key`
 * so all three agree and a harmless product refetch doesn't fragment the cache
 * or wipe in-progress input.
 */
export function commentRootRef(root: NostrEvent | URL): string {
  if (root instanceof URL) {
    return root.toString();
  } else if (NKinds.addressable(root.kind)) {
    return addressableCoord(root);
  } else if (NKinds.replaceable(root.kind)) {
    return `${root.kind}:${root.pubkey}:`;
  } else {
    return root.id;
  }
}

/**
 * Build the relay filter that finds every kind-1111 comment referencing `root`,
 * at any depth. Uppercase scope tags (`#A`/`#I`/`#E`) point at the thread root
 * per NIP-22, so this returns the whole conversation, not just top-level items.
 */
export function commentFilterForRoot(root: NostrEvent | URL, limit?: number): NostrFilter {
  const filter: NostrFilter = { kinds: [COMMENT_KIND] };

  if (root instanceof URL) {
    filter['#I'] = [root.toString()];
  } else if (NKinds.addressable(root.kind)) {
    filter['#A'] = [addressableCoord(root)];
  } else if (NKinds.replaceable(root.kind)) {
    filter['#A'] = [`${root.kind}:${root.pubkey}:`];
  } else {
    filter['#E'] = [root.id];
  }

  if (typeof limit === 'number') {
    filter.limit = limit;
  }

  return filter;
}

/**
 * True when `comment` is a top-level comment on `root` (its lowercase parent
 * tag — `a`/`i`/`e` per NIP-22 — points directly at the root rather than at
 * another comment).
 */
export function isTopLevelComment(comment: NostrEvent, root: NostrEvent | URL): boolean {
  if (root instanceof URL) {
    return getTagValue(comment, 'i') === root.toString();
  } else if (NKinds.addressable(root.kind)) {
    return getTagValue(comment, 'a') === addressableCoord(root);
  } else if (NKinds.replaceable(root.kind)) {
    return getTagValue(comment, 'a') === `${root.kind}:${root.pubkey}:`;
  } else {
    return getTagValue(comment, 'e') === root.id;
  }
}

/**
 * Build the NIP-22 tag set for a new kind-1111 comment.
 *
 * Uppercase tags (`A`/`I`/`E` + `K`/`P`) always describe the thread root.
 * Lowercase tags (`a`/`i`/`e` + `k`/`p`) describe the immediate parent — the
 * comment being replied to, or the root itself for a top-level comment.
 */
export function buildCommentTags(root: NostrEvent | URL, reply?: NostrEvent | URL): string[][] {
  const tags: string[][] = [];

  // Root scope (uppercase).
  if (root instanceof URL) {
    tags.push(['I', root.toString()], ['K', root.hostname]);
  } else if (NKinds.addressable(root.kind)) {
    tags.push(['A', addressableCoord(root)], ['K', root.kind.toString()], ['P', root.pubkey]);
  } else if (NKinds.replaceable(root.kind)) {
    tags.push(
      ['A', `${root.kind}:${root.pubkey}:`],
      ['K', root.kind.toString()],
      ['P', root.pubkey]
    );
  } else {
    tags.push(['E', root.id], ['K', root.kind.toString()], ['P', root.pubkey]);
  }

  // Immediate parent (lowercase): the reply target, or the root when top-level.
  const parent = reply ?? root;
  if (parent instanceof URL) {
    tags.push(['i', parent.toString()], ['k', parent.hostname]);
  } else if (NKinds.addressable(parent.kind)) {
    tags.push(['a', addressableCoord(parent)], ['k', parent.kind.toString()], ['p', parent.pubkey]);
  } else if (NKinds.replaceable(parent.kind)) {
    tags.push(
      ['a', `${parent.kind}:${parent.pubkey}:`],
      ['k', parent.kind.toString()],
      ['p', parent.pubkey]
    );
  } else {
    tags.push(['e', parent.id], ['k', parent.kind.toString()], ['p', parent.pubkey]);
  }

  return tags;
}
