/**
 * Tests for the on-disk event archive. Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ARCHIVE_KINDS } from '../lib/archiveConfig.js';
import { coordinateOf, EventArchive, safeSegment } from '../lib/eventArchive.js';
import { otherKey, product, recordingLogger, shopPubkey, signed, silentLogger, withTempDir } from './archiveFixtures.js';

const makeArchive = (dir, logger = silentLogger) =>
  new EventArchive({ dir, merchantPubkey: shopPubkey, kinds: ARCHIVE_KINDS, logger });

test('stores the original signed event at events/<kind>/<d-tag>/<created_at>.json', async () => {
  await withTempDir(async (dir) => {
    const archive = makeArchive(dir);
    const event = product('lamp', 'Desk Lamp', 1_700_000_100);
    const result = await archive.save(event);

    assert.equal(result.status, 'saved');
    assert.equal(result.path, join(dir, 'events', '30402', 'lamp', '1700000100.json'));
    assert.deepEqual(JSON.parse(await readFile(result.path, 'utf8')), JSON.parse(JSON.stringify(event)));
  });
});

test('replaceable kinds are grouped by pubkey, regular kinds by id', async () => {
  await withTempDir(async (dir) => {
    const archive = makeArchive(dir);
    const profile = signed({ kind: 0, content: '{"name":"shop"}' });
    const note = signed({ kind: 1, content: 'hello' });
    assert.equal((await archive.save(profile)).path, join(dir, 'events', '0', shopPubkey, `${profile.created_at}.json`));
    assert.equal((await archive.save(note)).path, join(dir, 'events', '1', note.id, `${note.created_at}.json`));
  });
});

test('keeps every version and never overwrites; duplicates are no-ops', async () => {
  await withTempDir(async (dir) => {
    const archive = makeArchive(dir);
    const v1 = product('lamp', 'Desk Lamp', 1_700_000_100);
    const v2 = product('lamp', 'Desk Lamp v2', 1_700_000_200);
    const sameSecond = product('lamp', 'Desk Lamp alt', 1_700_000_200);

    await archive.save(v1);
    await archive.save(v2);
    assert.equal((await archive.save(v2)).status, 'duplicate');
    const clash = await archive.save(sameSecond);
    assert.equal(clash.status, 'saved');
    assert.match(clash.path, /1700000200-[0-9a-f]{12}\.json$/);

    const files = await readdir(join(dir, 'events', '30402', 'lamp'));
    assert.equal(files.length, 3);
    assert.equal(archive.latest().get(coordinateOf(v1)).id, [v2, sameSecond].sort((a, b) => (a.id < b.id ? -1 : 1))[0].id);
  });
});

test('rejects events from other keys, bad signatures and unarchived kinds', async () => {
  await withTempDir(async (dir) => {
    const archive = makeArchive(dir);
    assert.equal((await archive.save(signed({ kind: 1 }, otherKey))).reason, 'foreign-pubkey');
    const forged = { ...product('lamp', 'Lamp', 1_700_000_100), content: 'tampered' };
    assert.equal((await archive.save(forged)).reason, 'bad-signature');
    assert.equal((await archive.save(signed({ kind: 7 }))).reason, 'kind-not-archived');
    assert.equal((await archive.save({ id: 'x' })).reason, 'malformed');
    assert.equal(archive.byId.size, 0);
  });
});

test('a kind-5 deletion is archived, the target copy is KEPT, and a warning is logged', async () => {
  await withTempDir(async (dir) => {
    const logger = recordingLogger();
    const archive = makeArchive(dir, logger);
    const lamp = product('lamp', 'Desk Lamp', 1_700_000_100);
    await archive.save(lamp);
    const deletion = signed({ kind: 5, created_at: 1_700_000_500, tags: [['a', coordinateOf(lamp)], ['e', lamp.id]] });

    assert.equal((await archive.save(deletion)).status, 'saved');
    assert.ok(archive.has(lamp.id), 'deleted product must stay archived');
    assert.ok(await readFile(archive.pathFor(lamp), 'utf8'));
    assert.equal(logger.lines.warn.length, 1);
    assert.match(logger.lines.warn[0], /WARNING: shop key published deletion/);
    assert.match(logger.lines.warn[0], /"Desk Lamp"/);
    assert.deepEqual(archive.deletedBy(lamp).map((d) => d.id), [deletion.id]);
  });
});

test('an a-tag deletion does not cover versions published after it', async () => {
  await withTempDir(async (dir) => {
    const archive = makeArchive(dir);
    const old = product('lamp', 'Desk Lamp', 1_700_000_100);
    const deletion = signed({ kind: 5, created_at: 1_700_000_200, tags: [['a', coordinateOf(old)]] });
    const relisted = product('lamp', 'Desk Lamp (relisted)', 1_700_000_300);
    for (const e of [old, deletion, relisted]) await archive.save(e);
    assert.equal(archive.deletedBy(old).length, 1);
    assert.equal(archive.deletedBy(relisted).length, 0);
  });
});

test('load() re-reads the archive from disk and latest.jsonl lists newest versions', async () => {
  await withTempDir(async (dir) => {
    const first = makeArchive(dir);
    await first.save(product('lamp', 'Lamp', 1_700_000_100));
    const newest = product('lamp', 'Lamp v2', 1_700_000_200);
    await first.save(newest);
    await first.save(signed({ kind: 1, content: 'note' }));

    const second = await makeArchive(dir).load();
    assert.equal(second.byId.size, 3);
    const path = await second.writeLatestJsonl();
    const lines = (await readFile(path, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines.length, 2);
    assert.ok(lines.some((e) => e.id === newest.id));
  });
});

test('safeSegment passes clean d-tags through and makes hostile ones safe and unique', () => {
  assert.equal(safeSegment('desk-lamp_01.v2'), 'desk-lamp_01.v2');
  const a = safeSegment('../../etc/passwd');
  const b = safeSegment('..__etc_passwd');
  assert.doesNotMatch(a, /\//);
  assert.notEqual(a, b);
  assert.notEqual(safeSegment('..'), '..');
  assert.match(safeSegment(''), /^empty~/);
});
