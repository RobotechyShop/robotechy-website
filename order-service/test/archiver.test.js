/**
 * Tests for the snapshot builder, tarball rotation, monitoring payload and the
 * archiver's sync loop — all against a fake pool (no relays are contacted).
 * Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ARCHIVE_KINDS, decodePubkey, loadArchiveConfig, DEFAULT_SHOP_RELAYS } from '../lib/archiveConfig.js';
import { buildStatus, countListings, postStatus } from '../lib/archiveMonitor.js';
import { Archiver, msUntilHourUtc, syncFilters } from '../lib/archiver.js';
import { tarballsToRotate, rotateTarballs } from '../lib/backupTarball.js';
import { buildSnapshot } from '../lib/catalogSnapshot.js';
import { coordinateOf, EventArchive } from '../lib/eventArchive.js';
import { otherKey, product, shopPubkey, signed, silentLogger, withTempDir } from './archiveFixtures.js';
import { nip19 } from 'nostr-tools';

const makeArchive = (dir) =>
  new EventArchive({ dir, merchantPubkey: shopPubkey, kinds: ARCHIVE_KINDS, logger: silentLogger });

test('config: requires MERCHANT_NPUB, accepts npub or hex, refuses an nsec, family relay first', () => {
  assert.throws(() => loadArchiveConfig({}), /MERCHANT_NPUB/);
  const npub = nip19.npubEncode(shopPubkey);
  assert.equal(decodePubkey(npub), shopPubkey);
  assert.equal(decodePubkey(shopPubkey.toUpperCase()), shopPubkey);
  assert.throws(() => decodePubkey(nip19.nsecEncode(otherKey)), /not an nsec/);

  const config = loadArchiveConfig({ MERCHANT_NPUB: npub, FALLBACK_RELAYS: 'wss://relay.ditto.pub/, wss://extra.example' });
  assert.equal(config.relays[0], 'wss://relay.weeksfamily.me');
  assert.deepEqual(config.relays, [...DEFAULT_SHOP_RELAYS, 'wss://extra.example']);
  assert.equal(config.retentionDays, 90);
});

test('snapshot: newest catalog versions + recent notes, deleted events left out', async () => {
  await withTempDir(async (dir) => {
    const archive = makeArchive(dir);
    const lampOld = product('lamp', 'Lamp', 100);
    const lamp = product('lamp', 'Lamp v2', 200);
    const mug = product('mug', 'Mug', 100);
    const profile = signed({ kind: 0, content: '{}' });
    const note = signed({ kind: 1, content: 'hello', created_at: 300 });
    const contacts = signed({ kind: 3 });
    const deletion = signed({ kind: 5, created_at: 400, tags: [['a', coordinateOf(mug)]] });
    for (const e of [lampOld, lamp, mug, profile, note, contacts, deletion]) await archive.save(e);

    const snapshot = buildSnapshot(archive, { now: 1_000_000 });
    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.pubkey, shopPubkey);
    assert.deepEqual(snapshot.events.map((e) => e.id).sort(), [lamp.id, profile.id, note.id].sort());
  });
});

test('tarball rotation only removes our dated tarballs older than the retention window', async () => {
  const now = new Date('2026-10-11T03:00:00Z');
  const names = ['events-2026-07-12.tar.gz', 'events-2026-07-14.tar.gz', 'events-2026-10-10.tar.gz', 'notes.txt'];
  assert.deepEqual(tarballsToRotate(names, now, 90), ['events-2026-07-12.tar.gz']);

  await withTempDir(async (dir) => {
    await mkdir(join(dir, 'tarballs'));
    for (const n of names) await writeFile(join(dir, 'tarballs', n), 'x');
    await rotateTarballs({ backupDir: dir, now, retentionDays: 90, logger: silentLogger });
    assert.deepEqual((await readdir(join(dir, 'tarballs'))).sort(), names.slice(1).sort());
  });
});

test('monitor: counts live sellable listings, drop %, and new deletions since last night', async () => {
  await withTempDir(async (dir) => {
    const archive = makeArchive(dir);
    const a = product('a', 'A', 100);
    const b = product('b', 'B', 100);
    const hidden = product('c', 'C', 100, [['visibility', 'hidden']]);
    const d = product('d', 'D', 100);
    const deletion = signed({ kind: 5, created_at: 200, tags: [['a', coordinateOf(d)]] });
    for (const e of [a, b, hidden, d, deletion]) await archive.save(e);

    assert.equal(countListings([a, b, hidden, d], [30402], [deletion]), 2);
    // A product listed under two listing kinds with the same identifier counts once.
    const legacyA = signed({ kind: 30018, tags: [['d', 'a']], content: '{}' });
    const legacyOnly = signed({ kind: 30018, tags: [['d', 'z']], content: '{}' });
    assert.equal(countListings([a, legacyA, legacyOnly], [30402, 30018]), 2);

    const { status, nextState } = buildStatus({
      shopName: 'test',
      archive,
      liveEvents: [a], // relays only served one listing tonight
      listingKinds: [30402],
      state: { liveListings: 2, seenDeletionIds: [] },
      relaysReached: ['wss://r1'],
      now: new Date('2026-10-11T03:00:00Z'),
    });
    assert.equal(status.liveListings, 1);
    assert.equal(status.archivedListings, 2);
    assert.equal(status.listingDropPct, 50);
    assert.equal(status.liveVsArchivedPct, 50);
    assert.equal(status.newDeletions.length, 1);
    assert.equal(status.newDeletions[0].archivedTargets[0].title, 'D');
    assert.deepEqual(nextState.seenDeletionIds, [deletion.id]);

    const again = buildStatus({ shopName: 'test', archive, liveEvents: [a, b], listingKinds: [30402], state: nextState });
    assert.equal(again.status.newDeletions.length, 0);
  });
});

test('postStatus POSTs JSON, is a no-op without a URL, and never throws', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200 };
  };
  assert.equal(await postStatus('', { a: 1 }, { fetchImpl }), false);
  assert.equal(await postStatus('https://n8n.example/hook', { a: 1 }, { fetchImpl }), true);
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { a: 1 });
  const failing = async () => {
    throw new Error('down');
  };
  assert.equal(await postStatus('https://n8n.example/hook', {}, { fetchImpl: failing, logger: silentLogger }), false);
});

test('scheduling helpers', () => {
  assert.equal(msUntilHourUtc(3, new Date('2026-10-11T02:00:00Z')), 60 * 60 * 1000);
  assert.equal(msUntilHourUtc(3, new Date('2026-10-11T03:00:00Z')), 24 * 60 * 60 * 1000);
  const filters = syncFilters('pk', ARCHIVE_KINDS);
  assert.equal(filters.length, 3);
  assert.ok(!filters[0].kinds.includes(1) && !filters[0].kinds.includes(5));
});

test('archiver sync: archives events from a fake pool, writes snapshot + state, POSTs status', async () => {
  await withTempDir(async (dir) => {
    const lamp = product('lamp', 'Lamp', 100);
    const note = signed({ kind: 1, content: 'hi', created_at: 150 });
    const foreign = signed({ kind: 30402, tags: [['d', 'x'], ['title', 'X'], ['price', '1']] }, otherKey);
    const queried = [];
    const pool = {
      async querySync(relays, filter) {
        queried.push(relays[0]);
        if (relays[0] === 'wss://dead.example') throw new Error('connection failed');
        return [lamp, note, foreign].filter((e) => filter.kinds.includes(e.kind));
      },
      subscribeMany() {
        return { close() {} };
      },
    };
    const posted = [];
    const publicPath = join(dir, 'dist', 'catalog-snapshot.json');
    const archiver = new Archiver({
      config: {
        shopName: 'test',
        merchantPubkey: shopPubkey,
        backupDir: dir,
        relays: ['wss://good.example', 'wss://dead.example'],
        snapshotPublicPath: publicPath,
        copyDir: '',
        webhookUrl: 'https://n8n.example/hook',
        retentionDays: 90,
        nightlyHourUtc: 3,
        kinds: ARCHIVE_KINDS,
      },
      archive: makeArchive(dir),
      pool,
      logger: silentLogger,
      fetchImpl: async (_url, init) => {
        posted.push(JSON.parse(init.body));
        return { ok: true, status: 200 };
      },
      tar: async () => join(dir, 'tarballs', 'fake.tar.gz'),
    });

    const result = await archiver.fullSync({ nightly: true, now: new Date('2026-10-11T03:00:00Z') });
    assert.deepEqual(result.relaysReached, ['wss://good.example']);
    assert.equal(result.saved, 2); // foreign event rejected
    assert.ok(queried.includes('wss://dead.example'));

    const snapshot = JSON.parse(await readFile(publicPath, 'utf8'));
    assert.deepEqual(snapshot.events.map((e) => e.id).sort(), [lamp.id, note.id].sort());
    assert.ok(await readFile(join(dir, 'catalog-snapshot.json'), 'utf8'));
    assert.ok(await readFile(join(dir, 'events', 'latest.jsonl'), 'utf8'));
    assert.equal(posted.length, 1);
    assert.equal(posted[0].liveListings, 1);
    const state = JSON.parse(await readFile(join(dir, 'monitor-state.json'), 'utf8'));
    assert.equal(state.liveListings, 1);
    archiver.stop();
  });
});
