/**
 * Nightly monitoring payload: how many listings the relays are serving right
 * now, how that compares with last night and with the archive, and any new
 * kind-5 deletions by the shop key. POSTed to N8N_WEBHOOK_URL if set.
 *
 * Suggested n8n rule (see README "Backups & restore"):
 *   alert if  listingDropPct > 20
 *         or  liveVsArchivedPct < 80
 *         or  newDeletions.length > 0
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite, dTagOf, EventArchive, eventKey, isNewer } from './eventArchive.js';

export const STATE_FILE = 'monitor-state.json';

/** Hidden / sold-out Gamma visibilities are not "live listings". */
function isSellable(event) {
  if (event.kind !== 30402) return true;
  const visibility = event.tags.find((t) => t[0] === 'visibility')?.[1];
  return !visibility || visibility === 'on-sale' || visibility === 'pre-order';
}

/**
 * Count distinct, non-deleted, sellable listings in a set of events.
 *
 * A product migrated between listing kinds (Eden: NIP-15 30018 -> Gamma 30402)
 * shares its identifier across both; it counts once, and the kind listed
 * FIRST in `listingKinds` wins — the storefront's "Gamma version wins" rule.
 *
 * @param {object[]} events     events to count (e.g. what relays returned tonight)
 * @param {number[]} listingKinds
 * @param {object[]} deletions  kind-5 events from the shop key
 */
export function countListings(events, listingKinds, deletions = []) {
  const newest = new Map();
  for (const event of events) {
    if (!listingKinds.includes(event.kind)) continue;
    const key = eventKey(event);
    if (isNewer(event, newest.get(key))) newest.set(key, event);
  }
  const byProduct = new Map();
  for (const event of newest.values()) {
    if (deletions.some((d) => EventArchive.targets(d, event))) continue;
    const id = `${event.pubkey}:${dTagOf(event)}`;
    const current = byProduct.get(id);
    if (!current || listingKinds.indexOf(event.kind) < listingKinds.indexOf(current.kind)) {
      byProduct.set(id, event);
    }
  }
  return [...byProduct.values()].filter(isSellable).length;
}

function pct(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

/**
 * @param {object} opts
 * @param {string} opts.shopName
 * @param {import('./eventArchive.js').EventArchive} opts.archive
 * @param {object[]} opts.liveEvents  events the relays returned in tonight's sync
 * @param {number[]} opts.listingKinds
 * @param {{liveListings?: number, seenDeletionIds?: string[]}} opts.state  last night's state
 * @param {string[]} opts.relaysReached
 * @returns {{status: object, nextState: object}}
 */
export function buildStatus({ shopName, archive, liveEvents, listingKinds, state = {}, relaysReached = [], now = new Date() }) {
  const deletions = archive.deletions();
  const liveListings = countListings(liveEvents, listingKinds, deletions);
  const archivedListings = countListings(archive.all(), listingKinds, deletions);
  const previousListings = Number.isInteger(state.liveListings) ? state.liveListings : null;

  const seen = new Set(state.seenDeletionIds ?? []);
  const newDeletions = deletions
    .filter((d) => !seen.has(d.id))
    .map((d) => ({
      id: d.id,
      created_at: d.created_at,
      targets: d.tags.filter(([n]) => n === 'e' || n === 'a').map(([n, v]) => `${n}:${v}`),
      archivedTargets: archive.targetsOf(d).map((e) => ({
        kind: e.kind,
        id: e.id,
        title: e.tags.find((t) => t[0] === 'title' || t[0] === 'name')?.[1] ?? null,
      })),
    }));

  const listingDropPct =
    previousListings && liveListings < previousListings
      ? pct(previousListings - liveListings, previousListings)
      : 0;

  const status = {
    shop: shopName,
    merchantPubkey: archive.merchantPubkey,
    timestamp: now.toISOString(),
    liveListings,
    previousListings,
    listingDropPct,
    archivedListings,
    liveVsArchivedPct: pct(liveListings, archivedListings),
    archivedEvents: archive.byId.size,
    relaysReached,
    newDeletions,
  };

  const nextState = {
    liveListings,
    seenDeletionIds: deletions.map((d) => d.id),
    updatedAt: status.timestamp,
  };
  return { status, nextState };
}

export async function loadState(backupDir) {
  try {
    return JSON.parse(await readFile(join(backupDir, STATE_FILE), 'utf8'));
  } catch {
    return {};
  }
}

export async function saveState(backupDir, state) {
  await atomicWrite(join(backupDir, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
}

/** POST the status JSON; never throws (monitoring must not break backups). */
export async function postStatus(url, status, { fetchImpl = fetch, timeoutMs = 10000, logger = console } = {}) {
  if (!url) return false;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(status),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) logger.warn(`[Monitor] Webhook responded ${res.status}`);
    return res.ok;
  } catch (error) {
    logger.warn(`[Monitor] Webhook POST failed: ${error.message}`);
    return false;
  }
}
