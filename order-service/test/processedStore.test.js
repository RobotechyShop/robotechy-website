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

const HASH = 'ab'.repeat(32);
const record = (overrides = {}) => ({
  invoice: 'lnbc1test',
  paymentHash: HASH,
  amountSats: 81_250,
  buyerPubkey: 'b'.repeat(64),
  verifyUrl: 'https://ln.example/verify/1',
  ...overrides,
});

test('issued invoices (hash, amount, verify URL) survive a restart; paid flag too', () => {
  const { path, dir } = tmpFile();
  try {
    const store = new ProcessedStore(path, 60);
    store.addInvoice('order-1', record());
    store.markPaid('order-1');
    const reloaded = new ProcessedStore(path, 60);
    const saved = reloaded.getInvoice('order-1');
    assert.equal(saved.paymentHash, HASH);
    assert.equal(saved.amountSats, 81_250);
    assert.equal(saved.verifyUrl, 'https://ln.example/verify/1');
    assert.ok(saved.paidAt > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('malformed persisted invoice records are dropped, not trusted', () => {
  const { path, dir } = tmpFile();
  try {
    const now = Math.floor(Date.now() / 1000);
    writeFileSync(
      path,
      JSON.stringify({
        invoices: {
          good: { ...record(), createdAt: now },
          badHash: { ...record({ paymentHash: 'zz' }), createdAt: now },
          badAmount: { ...record({ amountSats: '81250' }), createdAt: now },
          noCreated: record(),
        },
      })
    );
    const store = new ProcessedStore(path, 60);
    assert.ok(store.getInvoice('good'));
    assert.equal(store.invoices.size, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('addInvoice throws (and keeps nothing) when the record cannot be persisted', () => {
  const { dir } = tmpFile();
  try {
    // The store path is a directory, so the rename fails.
    const store = new ProcessedStore(dir, 60);
    assert.throws(() => store.addInvoice('order-1', record()));
    assert.equal(store.getInvoice('order-1'), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('invoice records outlive the dedup window but are pruned after their own max age', () => {
  const { path, dir } = tmpFile();
  try {
    const store = new ProcessedStore(path, 60, 3600);
    store.invoices.set('old', { ...record(), createdAt: Math.floor(Date.now() / 1000) - 7200 });
    store.addInvoice('new', record());
    assert.equal(store.getInvoice('old'), undefined);
    assert.ok(store.getInvoice('new'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
