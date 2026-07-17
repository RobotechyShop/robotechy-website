/**
 * Tests for the unhandled-rejection classifier. Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIgnorableRelayError } from '../lib/relayErrors.js';

test('ignores the "connection timed out" rejection that previously crashed the service', () => {
  assert.equal(isIgnorableRelayError(new Error('connection timed out')), true);
  assert.equal(isIgnorableRelayError('connection timed out'), true);
});

test('ignores the ws handshake rejection ("Unexpected server response: 403") that crashed the service in production', () => {
  // A relay refusing the WebSocket upgrade rejects an internal nostr-tools
  // connection promise nobody awaits — it must be classified as relay noise.
  assert.equal(isIgnorableRelayError(new Error('Unexpected server response: 403')), true);
  assert.equal(isIgnorableRelayError(new Error('Unexpected server response: 502')), true);
});

test('ignores the relay publish timeout ("publish timed out") that crashed the service in production', () => {
  // nostr-tools raises this on an internal promise when a slow relay never
  // ACKs a published event — relay noise, not a genuine bug (2026-07-02).
  assert.equal(isIgnorableRelayError(new Error('publish timed out')), true);
  // But generic/HTTP timeouts must STAY fatal (LNURL fetch timeouts are real).
  assert.equal(isIgnorableRelayError(new Error('Request Timeout')), false);
  assert.equal(isIgnorableRelayError(new Error('fetch timeout')), false);
});

test('ignores the relay "error: internal error" notice that crashed the service (2026-07-17)', () => {
  // A failing relay's OK/CLOSED reason, raised by nostr-tools on an internal
  // promise nobody awaits — relay noise, must not kill order processing.
  assert.equal(isIgnorableRelayError(new Error('error: internal error')), true);
  // But an unprefixed "internal error" (e.g. an LNURL/Lightning HTTP failure)
  // must STAY fatal — the needle is deliberately prefix-specific.
  assert.equal(isIgnorableRelayError(new Error('Internal error')), false);
  assert.equal(isIgnorableRelayError(new Error('LNURL: 500 internal error')), false);
});

test('ignores known transient relay/network errors (case-insensitive)', () => {
  for (const m of [
    'restricted: Pay on https://nostr.land for access.',
    'blocked: kind 1059 is not allowed',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'socket hang up',
    'WebSocket connection failed',
    'rate-limited: noting too much',
    'Connection timed out', // mixed case, relay/socket context
  ]) {
    assert.equal(isIgnorableRelayError(new Error(m)), true, `should ignore: ${m}`);
  }
});

test('does NOT swallow a genuine programming error (stays fatal)', () => {
  assert.equal(
    isIgnorableRelayError(new TypeError("Cannot read properties of undefined (reading 'tags')")),
    false
  );
  assert.equal(isIgnorableRelayError(new Error('orderId is required')), false);
});

test('handles null/undefined/empty reasons without throwing (not ignorable)', () => {
  assert.equal(isIgnorableRelayError(null), false);
  assert.equal(isIgnorableRelayError(undefined), false);
  assert.equal(isIgnorableRelayError(''), false);
  assert.equal(isIgnorableRelayError({}), false);
});

test('coerces a non-string message without throwing', () => {
  assert.doesNotThrow(() => isIgnorableRelayError({ message: 123 }));
  assert.equal(isIgnorableRelayError({ message: 123 }), false);
  assert.equal(isIgnorableRelayError({ message: 'ETIMEDOUT' }), true);
});

test('does not swallow unrelated failures (bare "connection" / generic HTTP timeout)', () => {
  assert.equal(isIgnorableRelayError(new Error('Lightning node connection failed')), false);
  // A generic HTTP-ish timeout (e.g. a Lightning/LNURL fetch) is a real error,
  // not a relay/socket timeout — it must stay fatal.
  assert.equal(isIgnorableRelayError(new Error('Request Timeout')), false);
  assert.equal(isIgnorableRelayError(new Error('fetch timeout')), false);
});
