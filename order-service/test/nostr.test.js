/**
 * Tests for the order-service NIP-59 unwrap authentication and the polling
 * cursor monotonicity. Uses Node's built-in test runner (no extra deps):
 *   node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSecretKey, getPublicKey, finalizeEvent, nip44 } from 'nostr-tools';
import { NostrClient } from '../lib/nostr.js';

const now = () => Math.floor(Date.now() / 1000);

function encryptTo(senderSk, recipientPk, plaintext) {
  return nip44.encrypt(plaintext, nip44.getConversationKey(senderSk, recipientPk));
}

/**
 * Build a NIP-59 gift wrap (kind 1059) addressed to `merchantPk`.
 * @param {object} opts
 * @param {Uint8Array} opts.senderSk - signs the seal (the authenticated sender)
 * @param {string} opts.merchantPk - recipient
 * @param {string} [opts.rumorPubkey] - pubkey written into the inner rumor
 *   (defaults to the sender's pubkey; set differently to forge/spoof)
 * @param {boolean} [opts.tamperSealPubkey] - reassign the seal's `pubkey` to a
 *   different (forged) key after signing. Authentication then fails at step-2
 *   decrypt — the conversation key derived from the forged pubkey doesn't match,
 *   so nip44 decrypt throws — rather than via seal-signature verification.
 */
function buildGiftWrap({ senderSk, merchantPk, rumorPubkey, tamperSealPubkey = false }) {
  const senderPk = getPublicKey(senderSk);
  const rumor = {
    kind: 16,
    pubkey: rumorPubkey ?? senderPk,
    content: 'test order',
    tags: [['p', merchantPk]],
    created_at: now(),
  };

  const sealTemplate = {
    kind: 13,
    content: encryptTo(senderSk, merchantPk, JSON.stringify(rumor)),
    tags: [],
    created_at: now(),
  };
  let seal = finalizeEvent(sealTemplate, senderSk);

  if (tamperSealPubkey) {
    // Reassign the seal's pubkey to a forged key. The seal is no longer
    // signature-verified, so this is caught at step-2 decrypt: the conversation
    // key derived from the forged pubkey doesn't match, so nip44 decrypt fails.
    const victimPk = getPublicKey(generateSecretKey());
    seal = { ...seal, pubkey: victimPk };
  }

  const ephemeralSk = generateSecretKey();
  const wrapTemplate = {
    kind: 1059,
    content: encryptTo(ephemeralSk, merchantPk, JSON.stringify(seal)),
    tags: [['p', merchantPk]],
    created_at: now(),
  };
  return finalizeEvent(wrapTemplate, ephemeralSk);
}

test('unwrapGiftWrap returns the rumor for a valid, authenticated gift wrap', () => {
  const merchantSk = generateSecretKey();
  const merchantPk = getPublicKey(merchantSk);
  const senderSk = generateSecretKey();
  const senderPk = getPublicKey(senderSk);

  const client = new NostrClient(merchantSk, []);
  const wrap = buildGiftWrap({ senderSk, merchantPk });

  const rumor = client.unwrapGiftWrap(wrap);
  assert.ok(rumor, 'expected a rumor');
  assert.equal(rumor.kind, 16);
  assert.equal(rumor.pubkey, senderPk, 'rumor pubkey is the authenticated sender');
  client.pool.close([]);
});

test('unwrapGiftWrap rejects a rumor whose pubkey != seal pubkey (spoofing)', () => {
  const merchantSk = generateSecretKey();
  const merchantPk = getPublicKey(merchantSk);
  const attackerSk = generateSecretKey();
  const victimPk = getPublicKey(generateSecretKey());

  const client = new NostrClient(merchantSk, []);
  // Attacker signs the seal but forges the inner rumor's pubkey to the victim.
  const wrap = buildGiftWrap({ senderSk: attackerSk, merchantPk, rumorPubkey: victimPk });

  const rumor = client.unwrapGiftWrap(wrap);
  assert.equal(rumor, null, 'spoofed rumor must be rejected');
  client.pool.close([]);
});

test('unwrapGiftWrap rejects a seal whose pubkey was reassigned (step-2 decrypt fails)', () => {
  const merchantSk = generateSecretKey();
  const merchantPk = getPublicKey(merchantSk);
  const senderSk = generateSecretKey();

  const client = new NostrClient(merchantSk, []);
  const wrap = buildGiftWrap({ senderSk, merchantPk, tamperSealPubkey: true });

  const rumor = client.unwrapGiftWrap(wrap);
  assert.equal(rumor, null, 'seal with a reassigned (forged) pubkey must be rejected');
  client.pool.close([]);
});

test('subscribe keeps the since cursor monotonic (never moves backwards)', async () => {
  const merchantSk = generateSecretKey();
  const client = new NostrClient(merchantSk, []);

  const sinceCalls = [];
  // Fake pool: always returns an event with an OLD created_at (mimicking a
  // NIP-59 randomized past timestamp) and records the `since` it was queried with.
  client.pool = {
    querySync: async (_relays, filter) => {
      sinceCalls.push(filter.since);
      return [{ id: `e${sinceCalls.length}`, created_at: 500 }];
    },
    close: () => {},
  };
  client.relays = ['wss://example'];

  const startSince = 100000;
  const lookback = 100;
  const unsub = client.subscribe({ since: startSince }, () => {}, 10, lookback);

  // Let a few poll cycles run.
  await new Promise((r) => setTimeout(r, 60));
  unsub();

  assert.ok(sinceCalls.length >= 2, 'expected multiple polls');
  for (const since of sinceCalls) {
    assert.ok(since >= startSince, `since cursor moved backwards: ${since} < ${startSince}`);
  }
});
