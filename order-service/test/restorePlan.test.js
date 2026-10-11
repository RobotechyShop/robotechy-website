/**
 * Tests for restore planning (the dry-run path — no network). Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coordinateOf } from '../lib/eventArchive.js';
import { formatPlan, parseArgs, planRestore, selectEvents, toTemplate } from '../lib/restorePlan.js';
import { product, signed } from './archiveFixtures.js';

test('defaults: rebroadcast, dry run', () => {
  const opts = parseArgs([]);
  assert.equal(opts.mode, 'rebroadcast');
  assert.equal(opts.dryRun, true);
});

test('parses --mode/--d/--kind/--at/--relays and only --execute turns off dry run', () => {
  const opts = parseArgs(['--mode', 'republish', '--d', 'lamp', '--kind', '30402', '--at', '1700000150', '--relays', 'wss://a, wss://b']);
  assert.deepEqual(
    { mode: opts.mode, d: opts.d, kinds: opts.kinds, at: opts.at, relays: opts.relays, dryRun: opts.dryRun },
    { mode: 'republish', d: 'lamp', kinds: [30402], at: 1700000150, relays: ['wss://a', 'wss://b'], dryRun: true }
  );
  assert.equal(parseArgs(['--execute']).dryRun, false);
  assert.equal(parseArgs(['--execute', '--dry-run']).dryRun, true);
});

test('rejects bad input, including trying to restore deletions', () => {
  assert.throws(() => parseArgs(['--mode', 'nuke']), /rebroadcast or republish/);
  assert.throws(() => parseArgs(['--kind', '5']), /other than 5/);
  assert.throws(() => parseArgs(['--d']), /needs a value/);
  assert.throws(() => parseArgs(['--bogus']), /Unknown option/);
});

const v1 = product('lamp', 'Lamp', 1_700_000_100);
const v2 = product('lamp', 'Lamp v2', 1_700_000_200);
const mug = product('mug', 'Mug', 1_700_000_100);
const note = signed({ kind: 1, content: 'hi' });
const deletion = signed({ kind: 5, created_at: 1_700_000_300, tags: [['a', coordinateOf(mug)]] });
const all = [v1, v2, mug, note, deletion];

test('--d restores one product, newest version, and never selects kind 5 or notes by default', () => {
  assert.deepEqual(selectEvents(all, { d: 'lamp' }).map((e) => e.id), [v2.id]);
  const everything = selectEvents(all).map((e) => e.id);
  assert.ok(everything.includes(v2.id) && everything.includes(mug.id));
  assert.ok(!everything.includes(note.id) && !everything.includes(deletion.id));
  assert.deepEqual(selectEvents(all, { kinds: [1] }).map((e) => e.id), [note.id]);
});

test('--at picks the version that was live at that time', () => {
  assert.deepEqual(selectEvents(all, { d: 'lamp', at: 1_700_000_150 }).map((e) => e.id), [v1.id]);
});

test('dry-run plan warns about deleted and superseded events in rebroadcast mode', () => {
  const plan = planRestore([v1, mug], all, { mode: 'rebroadcast' });
  assert.match(plan[0].warnings.join(), /newer version/);
  assert.match(plan[1].warnings.join(), /deleted by/);
  assert.deepEqual(planRestore([v1, mug], all, { mode: 'republish' }).flatMap((p) => p.warnings), []);

  const text = formatPlan(plan, { mode: 'rebroadcast', dryRun: true, relays: ['wss://a'] });
  assert.match(text, /^\[DRY RUN\] rebroadcast of 2 event\(s\)/);
  assert.match(text, /Nothing sent/);
});

test('republish templates are unsigned copies with a fresh timestamp', () => {
  const template = toTemplate(mug, 1_800_000_000);
  assert.deepEqual(template, { kind: 30402, created_at: 1_800_000_000, tags: mug.tags, content: mug.content });
  assert.equal('sig' in template || 'id' in template || 'pubkey' in template, false);
});
