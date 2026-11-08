import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { lnurlpUrl, probeLightningAddress, startHealthMonitor } from '../lib/lightningHealth.js';
import { writePaymentsStatus } from '../lib/paymentsStatus.js';

const quietLogger = { log() {}, warn() {} };

/** A fetch stub whose response can be switched between probes. */
function fakeFetch(initial) {
  let next = initial;
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    if (next instanceof Error) throw next;
    return {
      status: next.status,
      json: async () => {
        if (next.body === undefined) throw new SyntaxError('Unexpected token <');
        return next.body;
      },
    };
  };
  fn.calls = calls;
  fn.set = (value) => {
    next = value;
  };
  return fn;
}

const OK = { status: 200, body: { tag: 'payRequest', callback: 'https://ln.example/cb' } };

test('lnurlpUrl builds the LUD-16 discovery URL and rejects malformed addresses', () => {
  assert.equal(lnurlpUrl('shop@ln.example.com'), 'https://ln.example.com/.well-known/lnurlp/shop');
  assert.equal(
    lnurlpUrl('  shop@ln.example.com '),
    'https://ln.example.com/.well-known/lnurlp/shop'
  );
  for (const bad of [
    '',
    undefined,
    null,
    'shop',
    '@ln.example.com',
    'shop@',
    'a@b@c',
    'x@ex/ample',
  ]) {
    assert.equal(lnurlpUrl(bad), null, String(bad));
  }
});

test('probe: healthy only for HTTP 200 + JSON with a callback', async () => {
  assert.deepEqual(await probeLightningAddress('a@b.example', { fetchImpl: fakeFetch(OK) }), {
    healthy: true,
  });
  const cases = [
    { status: 502, body: { callback: 'x' } },
    { status: 200, body: { status: 'ERROR', reason: 'down' } },
    { status: 200 }, // HTML error page
    new TypeError('fetch failed'),
  ];
  for (const c of cases) {
    const r = await probeLightningAddress('a@b.example', { fetchImpl: fakeFetch(c) });
    assert.equal(r.healthy, false);
    assert.ok(r.reason);
  }
});

test('probe: empty or unset address is unhealthy without any network call', async () => {
  const fetchImpl = fakeFetch(OK);
  for (const addr of ['', undefined]) {
    const r = await probeLightningAddress(addr, { fetchImpl });
    assert.deepEqual(r, { healthy: false, reason: 'no Lightning Address configured' });
  }
  assert.equal(fetchImpl.calls.length, 0);
});

test('monitor: reports the first result, then only state changes', async () => {
  const fetchImpl = fakeFetch(new TypeError('fetch failed'));
  const changes = [];
  const monitor = startHealthMonitor('shop@ln.example', {
    intervalMs: 60_000,
    fetchImpl,
    logger: quietLogger,
    onChange: (s) => changes.push(s),
  });
  assert.equal(monitor.status().checkedAt, null);
  await monitor.ready;
  assert.equal(monitor.isHealthy(), false);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].healthy, false);
  const firstSince = monitor.status().since;

  await monitor.checkNow(); // still down: no new change
  assert.equal(changes.length, 1);
  assert.equal(monitor.status().since, firstSince);

  fetchImpl.set(OK);
  assert.equal(await monitor.checkNow(), true);
  assert.equal(changes.length, 2);
  assert.equal(changes[1].healthy, true);
  assert.ok(monitor.status().checkedAt);
  monitor.stop();
});

test('monitor: an empty address starts cleanly in unavailable mode', async () => {
  const changes = [];
  const monitor = startHealthMonitor('', { logger: quietLogger, onChange: (s) => changes.push(s) });
  await monitor.ready;
  assert.equal(monitor.isHealthy(), false);
  assert.equal(changes.length, 1);
  monitor.stop();
});

test('writePaymentsStatus writes the storefront JSON atomically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'payments-status-'));
  const file = join(dir, 'payments-status.json');
  const checkedAt = '2026-11-08T12:00:00.000Z';
  assert.equal(writePaymentsStatus({ healthy: false, checkedAt }, file), true);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf-8')), {
    lightning: 'unavailable',
    checkedAt,
  });
  assert.equal(writePaymentsStatus({ healthy: true, checkedAt }, file), true);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf-8')), { lightning: 'ok', checkedAt });
  assert.equal(existsSync(`${file}.tmp`), false);
  // A missing directory is logged, never thrown.
  assert.equal(
    writePaymentsStatus({ healthy: true, checkedAt }, join(dir, 'nope', 'x.json')),
    false
  );
});
