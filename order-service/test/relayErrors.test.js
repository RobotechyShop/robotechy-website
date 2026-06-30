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

test('ignores known transient relay/network errors (case-insensitive)', () => {
  for (const m of [
    'restricted: Pay on https://nostr.land for access.',
    'blocked: kind 1059 is not allowed',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'socket hang up',
    'WebSocket connection failed',
    'rate-limited: noting too much',
    'Request Timeout', // mixed case
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
