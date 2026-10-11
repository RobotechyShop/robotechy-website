import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { matchFilters, verifyEvent } from 'nostr-tools';

/**
 * catalog-snapshot.json — signed shop events written by the container's
 * archiver (order-service/lib/catalogSnapshot.js) and served next to the site.
 *
 * It is loaded first / as a fallback so the storefront never renders blank
 * when relays are slow or down, and is replaced by live relay data as soon as
 * it arrives. Every event is signature-checked here against the shop pubkey,
 * so a tampered or stale file can never inject content — at worst it is
 * ignored.
 */

export const CATALOG_SNAPSHOT_URL = `${import.meta.env.BASE_URL ?? '/'}catalog-snapshot.json`;
const SNAPSHOT_FETCH_TIMEOUT_MS = 2500;

type Verify = (event: NostrEvent) => boolean;

function looksLikeEvent(value: unknown): value is NostrEvent {
  const e = value as Partial<NostrEvent> | null;
  return (
    !!e &&
    typeof e === 'object' &&
    typeof e.id === 'string' &&
    typeof e.pubkey === 'string' &&
    typeof e.sig === 'string' &&
    Number.isInteger(e.kind) &&
    Number.isInteger(e.created_at) &&
    Array.isArray(e.tags) &&
    typeof e.content === 'string'
  );
}

/**
 * Copy just the NIP-01 fields. nostr-tools caches verification results on a
 * Symbol property that survives object spread, so always verify a clean copy.
 */
function canonical(e: NostrEvent): NostrEvent {
  return {
    id: e.id,
    pubkey: e.pubkey,
    created_at: e.created_at,
    kind: e.kind,
    tags: e.tags,
    content: e.content,
    sig: e.sig,
  };
}

/**
 * Validate a parsed snapshot: keep only well-formed events authored by
 * `pubkey` whose signature verifies. Anything else is dropped.
 */
export function parseCatalogSnapshot(
  raw: unknown,
  pubkey: string,
  verify: Verify = verifyEvent
): NostrEvent[] {
  const events = (raw as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return [];
  const valid: NostrEvent[] = [];
  let dropped = 0;
  for (const candidate of events) {
    if (!looksLikeEvent(candidate) || candidate.pubkey !== pubkey) {
      dropped += 1;
      continue;
    }
    const event = canonical(candidate);
    if (verify(event)) valid.push(event);
    else dropped += 1;
  }
  if (dropped > 0) console.warn(`catalog-snapshot: ignored ${dropped} invalid event(s)`);
  return valid;
}

/** Fetch + verify the snapshot. Never throws: any failure means "no snapshot". */
export async function fetchCatalogSnapshot(
  pubkey: string,
  { fetchImpl = fetch, url = CATALOG_SNAPSHOT_URL }: { fetchImpl?: typeof fetch; url?: string } = {}
): Promise<NostrEvent[]> {
  try {
    const res = await fetchImpl(url, {
      cache: 'no-cache',
      signal: AbortSignal.timeout(SNAPSHOT_FETCH_TIMEOUT_MS),
    });
    // The SPA fallback answers unknown paths with index.html — not a snapshot.
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return [];
    return parseCatalogSnapshot(await res.json(), pubkey);
  } catch {
    return [];
  }
}

const cache = new Map<string, Promise<NostrEvent[]>>();

/** Fetch the snapshot once per page load (per pubkey). */
export function loadCatalogSnapshot(pubkey: string): Promise<NostrEvent[]> {
  let pending = cache.get(pubkey);
  if (!pending) {
    pending = fetchCatalogSnapshot(pubkey);
    cache.set(pubkey, pending);
  }
  return pending;
}

/** Test hook: forget the cached snapshot. */
export function resetCatalogSnapshotCache() {
  cache.clear();
}

function isReplaceable(kind: number) {
  return kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000);
}

/** One key per logical event: the coordinate for (addressable) replaceables, else the id. */
export function eventKey(e: NostrEvent): string {
  if (e.kind >= 30000 && e.kind < 40000) {
    return `${e.kind}:${e.pubkey}:${e.tags.find(([n]) => n === 'd')?.[1] ?? ''}`;
  }
  if (isReplaceable(e.kind)) return `${e.kind}:${e.pubkey}`;
  return e.id;
}

/** Merge event lists, keeping only the newest version of each logical event. */
export function mergeEvents(...lists: NostrEvent[][]): NostrEvent[] {
  const newest = new Map<string, NostrEvent>();
  for (const list of lists) {
    for (const e of list) {
      const key = eventKey(e);
      const current = newest.get(key);
      if (
        !current ||
        e.created_at > current.created_at ||
        (e.created_at === current.created_at && e.id < current.id)
      ) {
        newest.set(key, e);
      }
    }
  }
  return [...newest.values()];
}

/** Does kind-5 `deletion` delete `event` (NIP-09 `e` / `a` tags, same author)? */
export function isDeletedBy(event: NostrEvent, deletion: NostrEvent): boolean {
  if (deletion.kind !== 5 || event.kind === 5 || deletion.pubkey !== event.pubkey) return false;
  const coordinate = event.kind >= 30000 && event.kind < 40000 ? eventKey(event) : null;
  return deletion.tags.some(
    ([name, value]) =>
      (name === 'e' && value === event.id) ||
      (name === 'a' &&
        coordinate !== null &&
        value === coordinate &&
        event.created_at <= deletion.created_at)
  );
}

/**
 * Drop events deleted by any of `deletions`. Stops a cached snapshot from
 * resurrecting something the owner deleted after the page loaded.
 */
export function applyDeletions(events: NostrEvent[], deletions: NostrEvent[]): NostrEvent[] {
  if (deletions.length === 0) return events;
  return events.filter((e) => !deletions.some((d) => isDeletedBy(e, d)));
}

/** Snapshot events that a relay query with these filters would have returned. */
export function selectSnapshotEvents(snapshot: NostrEvent[], filters: NostrFilter[]): NostrEvent[] {
  return snapshot.filter((e) => matchFilters(filters, e));
}
