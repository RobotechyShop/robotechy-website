import { describe, it, expect, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  applyDeletions,
  fetchCatalogSnapshot,
  mergeEvents,
  parseCatalogSnapshot,
  selectSnapshotEvents,
} from './catalogSnapshot';

// Throwaway keys generated per run — never a real shop key.
const shopKey = generateSecretKey();
const shopPubkey = getPublicKey(shopKey);
const otherKey = generateSecretKey();

function sign(template: Partial<NostrEvent>, key = shopKey): NostrEvent {
  return finalizeEvent(
    { kind: 1, tags: [], content: '', created_at: 1_700_000_000, ...template },
    key
  ) as NostrEvent;
}

function product(d: string, created_at: number): NostrEvent {
  return sign({
    kind: 30402,
    created_at,
    tags: [
      ['d', d],
      ['title', d],
      ['price', '1', 'SAT'],
    ],
  });
}

const json = (body: unknown, contentType = 'application/json') =>
  ({
    ok: true,
    headers: new Headers({ 'content-type': contentType }),
    json: async () => body,
  }) as Response;

describe('parseCatalogSnapshot', () => {
  it('keeps only events signed by the shop key', () => {
    const good = product('lamp', 100);
    const foreign = sign({ kind: 30402 }, otherKey);
    // Tampered copy of a verified event: nostr-tools' cached "verified" Symbol
    // is copied by the spread, so this only fails if we verify a clean copy.
    const tampered = { ...product('mug', 100), content: 'free!' };
    const result = parseCatalogSnapshot(
      { version: 1, events: [good, foreign, tampered, { id: 'junk' }] },
      shopPubkey
    );
    expect(result.map((e) => e.id)).toEqual([good.id]);
  });

  it('treats anything that is not a snapshot as empty', () => {
    expect(parseCatalogSnapshot(null, shopPubkey)).toEqual([]);
    expect(parseCatalogSnapshot({ events: 'nope' }, shopPubkey)).toEqual([]);
  });
});

describe('fetchCatalogSnapshot', () => {
  it('returns verified events from the JSON file', async () => {
    const lamp = product('lamp', 100);
    const fetchImpl = vi.fn(async () => json({ version: 1, events: [lamp] }));
    const events = await fetchCatalogSnapshot(shopPubkey, { fetchImpl, url: '/snap.json' });
    expect(events.map((e) => e.id)).toEqual([lamp.id]);
    expect(fetchImpl).toHaveBeenCalledWith('/snap.json', expect.anything());
  });

  it('never throws: network errors, 404s and the SPA HTML fallback all mean "no snapshot"', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('offline');
    });
    expect(await fetchCatalogSnapshot(shopPubkey, { fetchImpl: down })).toEqual([]);
    const html = vi.fn(async () => json('<html>', 'text/html'));
    expect(await fetchCatalogSnapshot(shopPubkey, { fetchImpl: html })).toEqual([]);
    const missing = vi.fn(async () => ({ ...json({}), ok: false }) as Response);
    expect(await fetchCatalogSnapshot(shopPubkey, { fetchImpl: missing })).toEqual([]);
  });
});

describe('merging live data with the snapshot', () => {
  it('keeps the newest version of each product, from whichever source has it', () => {
    const snapOld = product('lamp', 100);
    const liveNew = product('lamp', 200);
    const snapOnly = product('mug', 100);
    const merged = mergeEvents([liveNew], [snapOld, snapOnly]);
    expect(merged.map((e) => e.id).sort()).toEqual([liveNew.id, snapOnly.id].sort());
  });

  it('selects only snapshot events matching the query filters', () => {
    const lamp = product('lamp', 100);
    const note = sign({ kind: 1, content: 'hi' });
    expect(selectSnapshotEvents([lamp, note], [{ kinds: [30402], authors: [shopPubkey] }])).toEqual(
      [lamp]
    );
    expect(selectSnapshotEvents([lamp, note], [{ kinds: [30402], '#d': ['mug'] }])).toEqual([]);
  });

  it('applies kind-5 deletions so the snapshot cannot resurrect a deleted product', () => {
    const lamp = product('lamp', 100);
    const mug = product('mug', 100);
    const relisted = product('lamp', 300);
    const deletion = sign({
      kind: 5,
      created_at: 200,
      tags: [['a', `30402:${shopPubkey}:lamp`]],
    });
    expect(applyDeletions([lamp, mug], [deletion])).toEqual([mug]);
    // An a-tag deletion only covers versions up to its own timestamp.
    expect(applyDeletions([relisted], [deletion])).toEqual([relisted]);
    // Someone else's deletion is ignored.
    const foreign = sign({ kind: 5, tags: [['e', mug.id]] }, otherKey);
    expect(applyDeletions([mug], [foreign])).toEqual([mug]);
  });
});
