/**
 * Regression test for issue #7:
 *   "DM invoice may be different from website invoice (double payment possible)."
 *
 * The OLD architecture sent TWO independently-generated invoices for one order —
 * a Kind 16 Type 2 payment request (shown on the website) AND a separate NIP-04
 * (kind 4) DM invoice (`formatInvoiceDM`). Those two BOLT11 strings could diverge,
 * letting a buyer pay both and lose funds (double payment).
 *
 * The current `handleOrder` fixes this by generating exactly ONE invoice and
 * delivering that single BOLT11 two ways, both gift-wrapped to the buyer:
 *   - a Kind 16 Type 2 payment-request card (rich marketplace clients / website)
 *   - a NIP-17 kind-14 chat note carrying the SAME BOLT11 (a fallback so generic
 *     DM clients that can't render the kind-16 card still show the invoice)
 * Both copies embed the IDENTICAL invoice and the same ['order', id] tag, so they
 * can never diverge — and one BOLT11 settles only once, so the second copy cannot
 * enable double payment. No NIP-04 (kind 4) DM is used. This test locks that
 * invariant in so it cannot silently regress.
 *
 * Hermetic: the Lightning provider (`generateInvoice`) is injected as a spy, the
 * relay/publish layer is a fake `nostrClient`, and the dedup store is an in-memory
 * stub — so no network is touched and the on-disk `.processed.json` is never read
 * or written.
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
 * `unwrapGiftWrap` hands to `handleOrder`. A fresh `orderId` per call keeps
 * independent orders from colliding in the (injected) dedup store.
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

/** The gift-wrapped rumors of a given kind that were sent. */
function giftWrapsOfKind(client, kind) {
  return client.giftWraps.filter((g) => g.rumor.kind === kind);
}

/**
 * In-memory dedup store with the same shape as ProcessedStore (the bits
 * handleOrder uses). Injected so the test never touches the on-disk
 * `.processed.json`, keeping each run fully hermetic and isolated.
 */
function buildInMemoryStore() {
  const orders = new Set();
  const receipts = new Set();
  return {
    hasOrder: (id) => orders.has(id),
    addOrder: (id) => orders.add(id),
    hasReceipt: (id) => receipts.has(id),
    addReceipt: (id) => receipts.add(id),
  };
}

let nostrClient;
let generateInvoiceSpy;
let store;

beforeEach(() => {
  nostrClient = buildFakeNostrClient();
  generateInvoiceSpy = buildGenerateInvoiceSpy();
  store = buildInMemoryStore();
});

test('generateInvoice is called exactly once for a single order', async () => {
  const order = buildOrderRumor();
  await handleOrder(order, nostrClient, { generateInvoice: generateInvoiceSpy, store });

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

test('the kind-16 card and the kind-14 note both carry the IDENTICAL invoice generateInvoice returned', async () => {
  const order = buildOrderRumor();
  await handleOrder(order, nostrClient, { generateInvoice: generateInvoiceSpy, store });

  // The kind-16 Type 2 payment-request card.
  const cards = giftWrapsOfKind(nostrClient, 16);
  assert.equal(cards.length, 1, 'exactly one kind-16 payment-request card sent');
  const card = cards[0].rumor;
  assert.equal(tagValue(card, 'type'), '2', 'Kind 16 Type 2 = payment request');
  const paymentTag = paymentTagOf(card);
  assert.ok(paymentTag, 'payment-request card has a payment tag');
  assert.equal(paymentTag[1], 'lightning', 'payment method is lightning');
  assert.equal(
    paymentTag[2],
    FAKE_BOLT11,
    'the card invoice is the one and only invoice generateInvoice returned'
  );

  // The kind-14 chat-note fallback.
  const notes = giftWrapsOfKind(nostrClient, 14);
  assert.equal(notes.length, 1, 'exactly one kind-14 invoice note sent');
  const note = notes[0].rumor;
  // The crux of #7: the kind-14 note embeds the EXACT same BOLT11 as the card —
  // one invoice, two surfaces, so they can never diverge.
  assert.ok(
    note.content.includes(FAKE_BOLT11),
    'the kind-14 note content carries the same BOLT11 as the card'
  );
  assert.equal(
    paymentTag[2],
    FAKE_BOLT11,
    'card and note reference one and the same invoice (no second generateInvoice call)'
  );
});

test('the kind-14 note carries the SAME ["order", id] tag as the kind-16 card (correlatable/dedupable)', async () => {
  const order = buildOrderRumor();
  await handleOrder(order, nostrClient, { generateInvoice: generateInvoiceSpy, store });

  const card = giftWrapsOfKind(nostrClient, 16)[0].rumor;
  const note = giftWrapsOfKind(nostrClient, 14)[0].rumor;

  const orderId = tagValue(order, 'order');
  assert.equal(tagValue(card, 'order'), orderId, 'card carries the order id');
  assert.equal(tagValue(note, 'order'), orderId, 'note carries the SAME order id');
  // A client renders the card and suppresses the note by matching this tag.
  assert.equal(
    tagValue(note, 'order'),
    tagValue(card, 'order'),
    'card and note share an identical order tag so clients can dedupe at render time'
  );
});

test('exactly two gift wraps (one kind-16, one kind-14) go to the buyer, and NO kind-4 NIP-04 DM is used', async () => {
  const buyerPubkey = randomPubkey();
  const order = buildOrderRumor({ buyerPubkey });
  await handleOrder(order, nostrClient, { generateInvoice: generateInvoiceSpy, store });

  assert.equal(
    nostrClient.giftWraps.length,
    2,
    'exactly two gift wraps sent for the initial request'
  );
  assert.equal(giftWrapsOfKind(nostrClient, 16).length, 1, 'one kind-16 card');
  assert.equal(giftWrapsOfKind(nostrClient, 14).length, 1, 'one kind-14 note');
  for (const { recipientPubkey } of nostrClient.giftWraps) {
    assert.equal(recipientPubkey, buyerPubkey, 'both gift wraps go to the buyer');
  }

  // The old failure mode — a separate NIP-04 (kind 4) invoice DM — must be gone.
  assert.equal(nostrClient.dms.length, 0, 'no NIP-04 (kind 4) DM is sent');
});

test('a duplicate order is skipped — no second invoice and no further gift wraps', async () => {
  const order = buildOrderRumor();
  await handleOrder(order, nostrClient, { generateInvoice: generateInvoiceSpy, store });
  // Replay the exact same order (same order id) — the persistent dedup store
  // must short-circuit it, so no further invoice is generated and nothing resent.
  await handleOrder(order, nostrClient, { generateInvoice: generateInvoiceSpy, store });

  assert.equal(
    generateInvoiceSpy.calls.length,
    1,
    'a replayed order must not generate a second invoice'
  );
  assert.equal(
    nostrClient.giftWraps.length,
    2,
    'a replayed order must not send any further gift wraps (still just the original card + note)'
  );
});
