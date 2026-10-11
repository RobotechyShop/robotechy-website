/**
 * catalog-snapshot.json — the signed events the storefront needs to render
 * without any relay (shop profile, catalog, recent story notes).
 *
 * The site fetches it first / as a fallback, verifies every signature
 * client-side against the shop pubkey (src/lib/catalogSnapshot.ts), and shows
 * it until live relay data arrives. Because every event is still signed by the
 * shop key, a tampered snapshot can only ever drop events, never forge them.
 */

import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CATALOG_KINDS } from './archiveConfig.js';
import { atomicWrite, isNewer, eventKey } from './eventArchive.js';

export const SNAPSHOT_FILE = 'catalog-snapshot.json';
export const SNAPSHOT_VERSION = 1;
/** Kinds whose newest version goes into the snapshot. */
export const SNAPSHOT_REPLACEABLE_KINDS = [0, ...CATALOG_KINDS];
/** How many recent top-level notes to include for the story page. */
export const SNAPSHOT_NOTES_LIMIT = 100;

/**
 * Build the snapshot from an EventArchive. Deleted events (by a kind-5 from the
 * shop key) are left out of the snapshot — they stay in the archive.
 */
export function buildSnapshot(archive, { now = Date.now(), notesLimit = SNAPSHOT_NOTES_LIMIT } = {}) {
  const deletions = archive.deletions();
  const live = (e) => archive.deletedBy(e, deletions).length === 0;

  const newest = new Map();
  for (const event of archive.all()) {
    if (!SNAPSHOT_REPLACEABLE_KINDS.includes(event.kind)) continue;
    const key = eventKey(event);
    if (isNewer(event, newest.get(key))) newest.set(key, event);
  }
  const catalog = [...newest.values()].filter(live);

  const notes = archive
    .all()
    .filter((e) => e.kind === 1 && live(e))
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, notesLimit);

  const events = [...catalog, ...notes].sort(
    (a, b) => a.kind - b.kind || b.created_at - a.created_at
  );

  return {
    version: SNAPSHOT_VERSION,
    generated_at: Math.floor(now / 1000),
    pubkey: archive.merchantPubkey,
    events,
  };
}

/**
 * Write the snapshot into the backup dir and (if set) the path the static
 * server publishes. Each write is atomic.
 * @returns {Promise<string[]>} paths written
 */
export async function writeSnapshot(snapshot, { backupDir, publicPath }) {
  const json = `${JSON.stringify(snapshot)}\n`;
  const paths = [join(backupDir, SNAPSHOT_FILE)];
  if (publicPath) paths.push(publicPath);
  const written = [];
  for (const path of paths) {
    await mkdir(dirname(path), { recursive: true });
    await atomicWrite(path, json);
    written.push(path);
  }
  return written;
}
