/**
 * Regression test for issue #7:
 *   "DM invoice may be different from website invoice (double payment possible)."
 *
 * The OLD architecture sent TWO invoices for a single order — a Kind 16 Type 2
 * payment request (shown on the website) AND a separate NIP-04 (kind 4) DM
 * invoice (`formatInvoiceDM`). Those two BOLT11 strings could diverge, letting a
 * buyer pay both and lose funds (double payment).
 *
 * The current `handleOrder` fixes this by generating exactly ONE invoice and
 * threading that single BOLT11 into ONE gift-wrapped Kind 16 Type 2 payment
 * request — with no separate NIP-04 DM. This test locks that invariant in so it
 * cannot silently regress.
 *
 * Hermetic: the Lightning provider (`generateInvoice`) is injected as a spy and
 * the relay/publish layer is a fake `nostrClient`, so no network is touched.
 *
 * Runs on Node's built-in test runner (no extra deps): `node --test`.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// `lib/config.js` calls `requireEnv(...)` at import time and `index.js` imports
// it, so these must be set BEFORE importing index.js. The merchant key is never
// decoded here (main() is guarded and does not run on import), so any non-empty
// values suffice to satisfy the config loader.
process.env.MERCHANT_NSEC ||= 'nsec-test-placeholder';
process.env.LIGHTNING_ADDRESS ||= 'robotechy@example.com';

const { handleOrder } = await import('../index.js');

// A recognisable BOLT11 the injected provider returns. The test asserts THIS
// exact string is the one embedded in the payment-request event (the invoice the
// website displays) — i.e. there is only one invoice, end to end.
const FAKE_BOLT11 = 'lnbc50u1pregress0nlysingleinvoiceeverpay1tothiswebsiteinvoiceandnodmcopy';

/** A 32-byte hex pubkey (buyer identity for the order rumor). */
function randomPubkey() {
  return randomBytes(32).toString('hex');
}

/**
 * Build a Kind 16 Type 1 order rumor — the unsigned inner event that
 * `unwrapGiftWrap` hands to `handleOrder`. A fresh `orderId` per call avoids the
 * persistent dedup store skipping the order as already-processed.
 */
function buildOrderRumor({ buyerPubkey = randomPubkey(), amount = 5000 } = {}) {
  const orderId = randomBytes(16).toString('hex');
  return {
    kind: 16,
    pubkey: buyerPubkey,
    content: 'Please send my robot parts',
    tags: [
      ['type', '1'], // ORDER_MESSAGE_TYPE.ORDER_CREATION
      ['order', orderId],
      ['amount', String(amount)],
      ['item', '30402:somepubkey:robo-arm', '1'],
      ['address', '123 Maker St'],
      ['email', 'buyer@example.com'],
    ],
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Build a fake NostrClient that records every gift wrap and DM instead of
 * touching the network. `sendDM` is present (so a regressed code path that calls
 * it would be caught) but must NOT be invoked by the order flow.
 */
function buildFakeNostrClient() {
  const giftWraps = [];
  const dms = [];
  return {
    giftWraps,
    dms,
    async sendGiftWrap(recipientPubkey, rumor) {
      giftWraps.push({ recipientPubkey, rumor });
    },
    async sendDM(recipientPubkey, content) {
      dms.push({ recipientPubkey, content });
    },
  };
}

/** A spy wrapping the Lightning provider: counts calls and records arguments. */
function buildGenerateInvoiceSpy(returnValue = FAKE_BOLT11) {
  const calls = [];
  const fn = async (...args) => {
    calls.push(args);
    return returnValue;
  };
  fn.calls = calls;
  return fn;
}

/** Pull the `['payment', 'lightning', <bolt11>]` tag out of an event. */
function paymentTagOf(rumor) {
  return rumor.tags.find((t) => t[0] === 'payment');
}

/** Pull the single-valued tag (e.g. 'type', 'order', 'amount') from an event. */
function tagValue(rumor, name) {
  return rumor.tags.find((t) => t[0] === name)?.[1];
}

let nostrClient;
let generateInvoiceSpy;

beforeEach(() => {
  nostrClient = buildFakeNostrClient();
  generateInvoiceSpy = buildGenerateInvoiceSpy();
});

test('generateInvoice is called exactly once for a single order', async () => {
  const order = buildOrderRumor();
  await handleOrder(order, nostrClient, { generateInvoice: generateInvoiceSpy });

  assert.equal(
    generateInvoiceSpy.calls.length,
    1,
    'exactly one invoice must be generated per order (no second invoice)'
  );
  // ...and it is generated for THIS order's amount and id.
  const [, amountArg, orderIdArg] = generateInvoiceSpy.calls[0];
  assert.equal(amountArg, 5000, 'invoice generated for the order amount');
  assert.equal(orderIdArg, tagValue(order, 'order'), 'invoice generated for this order id');
});

test('the website Kind 16 Type 2 payment request embeds the SAME invoice generateInvoice returned', async () => {
  const order = buildOrderRumor();
  await handleOrder(order, nostrClient, { generateInvoice: generateInvoiceSpy });

  assert.equal(nostrClient.giftWraps.length, 1, 'exactly one gift wrap sent');
  const { rumor } = nostrClient.giftWraps[0];

  assert.equal(rumor.kind, 16, 'payment request is a Kind 16 event');
  assert.equal(tagValue(rumor, 'type'), '2', 'Kind 16 Type 2 = payment request');

  const paymentTag = paymentTagOf(rumor);
  assert.ok(paymentTag, 'payment request event has a payment tag');
  assert.equal(paymentTag[1], 'lightning', 'payment method is lightning');
  // The crux of #7: the invoice in the event is the EXACT one generateInvoice
  // returned — the single source of truth, not a divergent second invoice.
  assert.equal(
    paymentTag[2],
    FAKE_BOLT11,
    'the event invoice is the one and only invoice generateInvoice returned'
  );
});

test('NO separate NIP-04 (kind 4) invoice DM is sent during the order flow', async () => {
  const order = buildOrderRumor();
  await handleOrder(order, nostrClient, { generateInvoice: generateInvoiceSpy });

  assert.equal(
    nostrClient.dms.length,
    0,
    'the old separate NIP-04 invoice DM (formatInvoiceDM) must not be sent'
  );
  // Defensive: even if a DM were sent, it must never carry the invoice.
  for (const dm of nostrClient.dms) {
    assert.ok(!String(dm.content).includes(FAKE_BOLT11), 'no DM may contain the BOLT11 invoice');
  }
});

test('exactly one gift-wrapped payment request is sent to the buyer', async () => {
  const buyerPubkey = randomPubkey();
  const order = buildOrderRumor({ buyerPubkey });
  await handleOrder(order, nostrClient, { generateInvoice: generateInvoiceSpy });

  assert.equal(nostrClient.giftWraps.length, 1, 'exactly one gift-wrapped message sent');
  const { recipientPubkey, rumor } = nostrClient.giftWraps[0];
  assert.equal(recipientPubkey, buyerPubkey, 'the payment request goes to the buyer');
  assert.equal(tagValue(rumor, 'type'), '2', 'and it is the Type 2 payment request');
});

test('a duplicate order is skipped — no second invoice for the same order id', async () => {
  const order = buildOrderRumor();
  await handleOrder(order, nostrClient, { generateInvoice: generateInvoiceSpy });
  // Replay the exact same order (same order id) — the persistent dedup store
  // must short-circuit it, so no further invoice is generated.
  await handleOrder(order, nostrClient, { generateInvoice: generateInvoiceSpy });

  assert.equal(
    generateInvoiceSpy.calls.length,
    1,
    'a replayed order must not generate a second invoice'
  );
  assert.equal(nostrClient.giftWraps.length, 1, 'and must not send a second payment request');
});
