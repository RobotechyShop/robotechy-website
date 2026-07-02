/**
 * Tests for the persistent dedup store (ProcessedStore). Verifies that processed
 * order/receipt IDs survive a "restart" (a fresh store reading the same file) and
 * that stale entries outside the lookback window are pruned.
 *
 *   node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProcessedStore } from '../lib/processedStore.js';

function tmpFile() {
  const dir = mkdtempSync(join(tmpdir(), 'processed-store-'));
  return { path: join(dir, '.processed.json'), dir };
}

test('creates a missing parent directory on first save (fresh data/ dir or empty volume)', () => {
  const { dir } = tmpFile();
  try {
    // Point the store at a path whose parent directory does not exist yet —
    // exactly the state of a fresh checkout or a just-created Docker volume.
    const nested = join(dir, 'data', '.processed.json');
    const store = new ProcessedStore(nested, 0);
    store.addOrder('order-1'); // must not warn/fail — save() mkdirs the parent
    const reloaded = new ProcessedStore(nested, 0);
    assert.equal(reloaded.hasOrder('order-1'), true, 'store should persist into the created dir');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('processed IDs survive a restart (persisted to disk)', () => {
  const { path, dir } = tmpFile();
  try {
    const store = new ProcessedStore(path, 0);
    assert.equal(store.hasOrder('order-1'), false);
    store.addOrder('order-1');
    store.addReceipt('receipt-1');

    // Simulate a restart: a brand-new store reading the same file.
    const reloaded = new ProcessedStore(path, 0);
    assert.equal(reloaded.hasOrder('order-1'), true, 'order should persist across restart');
    assert.equal(reloaded.hasReceipt('receipt-1'), true, 'receipt should persist across restart');
    assert.equal(reloaded.hasOrder('order-unknown'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an already-processed order is not re-processed after restart', () => {
  const { path, dir } = tmpFile();
  try {
    new ProcessedStore(path, 0).addOrder('dup-order');
    const reloaded = new ProcessedStore(path, 0);
    // Mirrors handleOrder's guard: skip when already present.
    assert.equal(reloaded.hasOrder('dup-order'), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('entries older than the lookback window are pruned on load', () => {
  const { path, dir } = tmpFile();
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const maxAge = 2 * 24 * 60 * 60; // 2 days
    writeFileSync(
      path,
      JSON.stringify({
        orders: {
          'old-order': nowSec - maxAge - 60, // older than window -> pruned
          'fresh-order': nowSec - 60, // within window -> kept
        },
        receipts: {},
      })
    );

    const store = new ProcessedStore(path, maxAge);
    assert.equal(store.hasOrder('old-order'), false, 'stale entry should be pruned');
    assert.equal(store.hasOrder('fresh-order'), true, 'recent entry should be kept');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
