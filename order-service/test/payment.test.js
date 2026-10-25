/**
 * Verified payment: "paid" only when sha256(preimage) matches OUR invoice's
 * payment hash for that order and, when the provider gave a LUD-21 verify URL,
 * it reports settled. Plus the order flow: server-side amount, invoice record,
 * cancellations.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MERCHANT_NSEC ||= 'nsec-test-placeholder';
process.env.LIGHTNING_ADDRESS ||= 'robotechy@example.com';

const { handleOrder, handlePaymentReceipt } = await import('../index.js');
const { checkLud21, decodeInvoice, preimageMatches, verifyPayment } =
  await import('../lib/payment.js');
const {
  fakeNostrClient,
  memoryStore,
  orderRumor,
  preimagePair,
  RATES,
  ref,
  shopCatalog,
  tagValue,
} = await import('./helpers/shop.js');

const BOLT11 = 'lnbc812500n1ptestinvoice';
const noSleep = async () => {};

/** fetch stub answering a LUD-21 verify URL with the given bodies, in turn. */
function verifyFetch(...bodies) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const body = bodies[Math.min(calls.length - 1, bodies.length - 1)];
    if (body instanceof Error) throw body;
    return { ok: true, json: async () => body };
  };
  fn.calls = calls;
  return fn;
}

function receiptRumor({ orderId, buyerPubkey, preimage, invoice = BOLT11 }) {
  return {
    kind: 17,
    pubkey: buyerPubkey,
    content: '',
    tags: [
      ['order', orderId],
      ['payment', 'lightning', invoice, preimage],
      ['amount', '81250'],
    ],
    created_at: 1,
  };
}

/** A store holding the invoice we issued for one order. */
function issued({ verifyUrl } = {}) {
  const { preimage, paymentHash } = preimagePair();
  const store = memoryStore();
  const orderId = 'a'.repeat(32);
  const buyerPubkey = 'b'.repeat(64);
  store.addInvoice(orderId, {
    invoice: BOLT11,
    paymentHash,
    amountSats: 81_250,
    buyerPubkey,
    ...(verifyUrl ? { verifyUrl } : {}),
  });
  return { store, orderId, buyerPubkey, preimage, paymentHash };
}

// ---------------------------------------------------------------- lib/payment

test('preimageMatches: only the real preimage of the payment hash', () => {
  const { preimage, paymentHash } = preimagePair();
  assert.equal(preimageMatches(preimage, paymentHash), true);
  assert.equal(preimageMatches(preimage.toUpperCase(), paymentHash), true);
  assert.equal(preimageMatches(preimagePair().preimage, paymentHash), false);
  assert.equal(
    preimageMatches(paymentHash, paymentHash),
    false,
    'the hash is not its own preimage'
  );
  assert.equal(preimageMatches('', paymentHash), false);
  assert.equal(preimageMatches(undefined, paymentHash), false);
});

test('decodeInvoice reads the payment hash and amount from a real BOLT11', () => {
  // BOLT11 spec test vector ("1 cup coffee", 2500u).
  const invoice =
    'lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgpfna3rh';
  const { paymentHash, amountMsat } = decodeInvoice(invoice);
  assert.equal(paymentHash, '0001020304050607080900010203040506070809000102030405060708090102');
  assert.equal(amountMsat, 250_000_000);
  assert.throws(() => decodeInvoice('not-an-invoice'));
});

test('verifyPayment: a valid preimage (no verify URL) confirms', async () => {
  const { store, orderId, preimage } = issued();
  const result = await verifyPayment(store.getInvoice(orderId), { invoice: BOLT11, preimage });
  assert.deepEqual(result, { status: 'confirmed', method: 'preimage' });
});

test('verifyPayment: a wrong preimage is invalid, without asking the provider', async () => {
  const fetch = verifyFetch({ settled: true });
  const { store, orderId } = issued({ verifyUrl: 'https://ln.example/verify/x' });
  const result = await verifyPayment(
    store.getInvoice(orderId),
    { invoice: BOLT11, preimage: preimagePair().preimage },
    { fetch, sleep: noSleep }
  );
  assert.equal(result.status, 'invalid');
  assert.equal(fetch.calls.length, 0);
});

test('verifyPayment: a receipt for a different invoice is invalid', async () => {
  const { store, orderId, preimage } = issued();
  const result = await verifyPayment(store.getInvoice(orderId), {
    invoice: 'lnbc1other',
    preimage,
  });
  assert.equal(result.status, 'invalid');
});

test('verifyPayment: LUD-21 settled:true confirms (after a lagging false)', async () => {
  const fetch = verifyFetch({ settled: false }, { settled: true });
  const { store, orderId, preimage } = issued({ verifyUrl: 'https://ln.example/verify/x' });
  const result = await verifyPayment(
    store.getInvoice(orderId),
    { invoice: BOLT11, preimage },
    { fetch, sleep: noSleep }
  );
  assert.deepEqual(result, { status: 'confirmed', method: 'preimage+lud21' });
  assert.equal(fetch.calls[0], 'https://ln.example/verify/x');
});

test('verifyPayment: LUD-21 settled:false is NOT confirmed even with a valid preimage', async () => {
  const fetch = verifyFetch({ settled: false });
  const { store, orderId, preimage } = issued({ verifyUrl: 'https://ln.example/verify/x' });
  const result = await verifyPayment(
    store.getInvoice(orderId),
    { invoice: BOLT11, preimage },
    { fetch, sleep: noSleep, attempts: 3 }
  );
  assert.equal(result.status, 'unsettled');
  assert.equal(fetch.calls.length, 3, 'retried before giving up');
});

test('verifyPayment: an unreachable verify endpoint is NOT confirmed', async () => {
  const fetch = verifyFetch(new Error('ECONNREFUSED'));
  const { store, orderId, preimage } = issued({ verifyUrl: 'https://ln.example/verify/x' });
  const result = await verifyPayment(
    store.getInvoice(orderId),
    { invoice: BOLT11, preimage },
    { fetch, sleep: noSleep, attempts: 2 }
  );
  assert.equal(result.status, 'unsettled');
  assert.match(result.reason, /could not be reached/);
});

test('checkLud21 treats ERROR bodies and non-boolean settled as no answer', async () => {
  assert.equal(await checkLud21('https://x', { fetch: verifyFetch({ status: 'ERROR' }) }), null);
  assert.equal(await checkLud21('https://x', { fetch: verifyFetch({ settled: 'yes' }) }), null);
  assert.equal(await checkLud21('https://x', { fetch: verifyFetch({ settled: true }) }), true);
});

// ------------------------------------------------------- handlePaymentReceipt

const confirmations = (client) =>
  client.giftWraps.filter(
    (g) => g.rumor.kind === 16 && tagValue(g.rumor, 'status') === 'confirmed'
  );

test('receipt with a valid preimage: confirmed status + readable thank-you, marked paid', async () => {
  const { store, orderId, buyerPubkey, preimage } = issued();
  const client = fakeNostrClient();
  await handlePaymentReceipt(receiptRumor({ orderId, buyerPubkey, preimage }), client, { store });

  assert.equal(confirmations(client).length, 1);
  assert.match(confirmations(client)[0].rumor.content, /has been paid/);
  assert.equal(client.giftWraps.filter((g) => g.rumor.kind === 14).length, 1);
  assert.ok(store.getInvoice(orderId).paidAt, 'order marked paid');

  // A second receipt for the paid order is a no-op.
  await handlePaymentReceipt(
    receiptRumor({ orderId, buyerPubkey, preimage: preimagePair().preimage }),
    client,
    { store }
  );
  assert.equal(confirmations(client).length, 1);
});

test('receipt with a wrong preimage: no confirmation and no reply', async () => {
  const { store, orderId, buyerPubkey } = issued();
  const client = fakeNostrClient();
  await handlePaymentReceipt(
    receiptRumor({ orderId, buyerPubkey, preimage: preimagePair().preimage }),
    client,
    { store }
  );
  assert.equal(client.giftWraps.length, 0);
  assert.equal(store.getInvoice(orderId).paidAt, undefined);
});

test('receipt for an unknown order: no confirmation', async () => {
  const { store, buyerPubkey, preimage } = issued();
  const client = fakeNostrClient();
  await handlePaymentReceipt(
    receiptRumor({ orderId: 'f'.repeat(32), buyerPubkey, preimage }),
    client,
    { store }
  );
  assert.equal(client.giftWraps.length, 0);
});

test('receipt from someone other than the buyer: no confirmation', async () => {
  const { store, orderId, preimage } = issued();
  const client = fakeNostrClient();
  await handlePaymentReceipt(
    receiptRumor({ orderId, buyerPubkey: 'c'.repeat(64), preimage }),
    client,
    { store }
  );
  assert.equal(client.giftWraps.length, 0);
});

test('receipt with LUD-21 settled: confirmed', async () => {
  const { store, orderId, buyerPubkey, preimage } = issued({ verifyUrl: 'https://ln.example/v' });
  const client = fakeNostrClient();
  await handlePaymentReceipt(receiptRumor({ orderId, buyerPubkey, preimage }), client, {
    store,
    verify: { fetch: verifyFetch({ settled: true }), sleep: noSleep },
  });
  assert.equal(confirmations(client).length, 1);
});

test('receipt with LUD-21 unsettled: neutral note only, not paid, re-checkable', async () => {
  const { store, orderId, buyerPubkey, preimage } = issued({ verifyUrl: 'https://ln.example/v' });
  const client = fakeNostrClient();
  const rumor = receiptRumor({ orderId, buyerPubkey, preimage });
  await handlePaymentReceipt(rumor, client, {
    store,
    verify: { fetch: verifyFetch({ settled: false }), sleep: noSleep },
  });
  assert.equal(confirmations(client).length, 0);
  assert.equal(client.giftWraps.length, 1);
  assert.match(client.giftWraps[0].rumor.content, /couldn't confirm/);
  assert.doesNotMatch(client.giftWraps[0].rumor.content, /has been paid/);
  assert.equal(store.getInvoice(orderId).paidAt, undefined);

  // Not persisted as handled: the same receipt is checked again later.
  await handlePaymentReceipt(rumor, client, {
    store,
    verify: { fetch: verifyFetch({ settled: true }), sleep: noSleep },
  });
  assert.equal(confirmations(client).length, 1);
});

// ---------------------------------------------------------------- handleOrder

/** handleOrder deps around the shop fixture catalog. */
function orderDeps(overrides = {}) {
  const calls = [];
  const { paymentHash } = preimagePair();
  return {
    calls,
    deps: {
      store: memoryStore(),
      loadCatalog: async () => shopCatalog(),
      getRates: async () => RATES,
      generateInvoice: async (...args) => {
        calls.push(args);
        return { invoice: BOLT11, verify: 'https://ln.example/verify/abc' };
      },
      decodeInvoice: () => ({ paymentHash, amountMsat: calls.at(-1)[1] * 1000 }),
      sleep: noSleep,
      ...overrides,
    },
  };
}

const statusOf = (client) =>
  client.giftWraps.filter((g) => g.rumor.kind === 16 && tagValue(g.rumor, 'type') === '3');

test('handleOrder invoices the SERVER total and records the invoice with its verify URL', async () => {
  const client = fakeNostrClient();
  const { deps, calls } = orderDeps();
  // Buyer states slightly less (rate drift) - accepted, but invoiced at our price.
  const rumor = orderRumor({ amount: 80_000 });
  await handleOrder(rumor, client, deps);

  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 81_250, 'invoice amount is the server-computed total');
  const card = client.giftWraps.find((g) => g.rumor.kind === 16).rumor;
  assert.equal(tagValue(card, 'amount'), '81250');
  const record = deps.store.getInvoice(tagValue(rumor, 'order'));
  assert.equal(record.amountSats, 81_250);
  assert.equal(record.invoice, BOLT11);
  assert.equal(record.verifyUrl, 'https://ln.example/verify/abc');
  assert.equal(record.buyerPubkey, rumor.pubkey);
});

test('handleOrder cancels a mismatched order with a readable reason and no invoice', async () => {
  const client = fakeNostrClient();
  const { deps, calls } = orderDeps();
  await handleOrder(orderRumor({ amount: 1 }), client, deps);

  assert.equal(calls.length, 0, 'no invoice generated');
  const [status] = statusOf(client);
  assert.equal(tagValue(status.rumor, 'status'), 'cancelled');
  assert.match(status.rumor.content, /does not match the current price/);
  assert.match(status.rumor.content, /not been charged/);
  assert.equal(client.giftWraps.filter((g) => g.rumor.kind === 14).length, 1);
});

test('handleOrder cancels an unknown item', async () => {
  const client = fakeNostrClient();
  const { deps, calls } = orderDeps();
  await handleOrder(orderRumor({ amount: 81_250, items: [[ref('nope'), '1']] }), client, deps);
  assert.equal(calls.length, 0);
  assert.equal(tagValue(statusOf(client)[0].rumor, 'status'), 'cancelled');
});

test('handleOrder retries a catalog outage, then cancels without invoicing', async () => {
  const client = fakeNostrClient();
  let loads = 0;
  const { deps, calls } = orderDeps({
    loadCatalog: async () => {
      loads += 1;
      throw new Error('relays down');
    },
    pricingAttempts: 3,
  });
  await handleOrder(orderRumor({ amount: 81_250 }), client, deps);
  assert.equal(loads, 3);
  assert.equal(calls.length, 0);
  assert.match(statusOf(client)[0].rumor.content, /couldn't check the current prices/);
});

test('handleOrder refuses an invoice for the wrong amount from the provider', async () => {
  const client = fakeNostrClient();
  const { deps } = orderDeps({
    decodeInvoice: () => ({ paymentHash: 'ab'.repeat(32), amountMsat: 1000 }),
  });
  const rumor = orderRumor({ amount: 81_250 });
  await handleOrder(rumor, client, deps);
  assert.equal(deps.store.getInvoice(tagValue(rumor, 'order')), undefined);
  assert.equal(client.giftWraps.filter((g) => tagValue(g.rumor, 'type') === '2').length, 0);
  assert.equal(tagValue(statusOf(client)[0].rumor, 'status'), 'cancelled');
});

test('handleOrder sends no invoice when the record cannot be persisted', async () => {
  const client = fakeNostrClient();
  const { deps } = orderDeps();
  deps.store.addInvoice = () => {
    throw new Error('disk full');
  };
  await handleOrder(orderRumor({ amount: 81_250 }), client, deps);
  assert.equal(client.giftWraps.filter((g) => tagValue(g.rumor, 'type') === '2').length, 0);
});

test('handleOrder never re-invoices an order id that already has an invoice record', async () => {
  const client = fakeNostrClient();
  const { deps, calls } = orderDeps();
  const rumor = orderRumor({ amount: 81_250 });
  await handleOrder(rumor, client, deps);
  const original = deps.store.getInvoice(tagValue(rumor, 'order'));
  // The dedup entry expired (2-day window) but the invoice record remains.
  deps.store.hasOrder = () => false;
  await handleOrder(rumor, client, deps);
  assert.equal(calls.length, 1, 'no second invoice');
  assert.equal(deps.store.getInvoice(tagValue(rumor, 'order')), original);
});

test('requestInvoice keeps an https LUD-21 verify URL and fails on an unusable one', async () => {
  const { requestInvoice } = await import('../lib/lightning.js');
  const realFetch = globalThis.fetch;
  const respond = (body) => {
    globalThis.fetch = async () => ({ ok: true, json: async () => body });
  };
  try {
    respond({ pr: 'lnbc1x', verify: 'https://ln.example/verify/1' });
    assert.equal(
      (await requestInvoice('https://ln.example/cb', 1000)).verify,
      'https://ln.example/verify/1'
    );
    respond({ pr: 'lnbc1x' });
    assert.equal((await requestInvoice('https://ln.example/cb', 1000)).verify, undefined);
    for (const verify of ['http://ln.example/verify/1', 'not a url', 42]) {
      respond({ pr: 'lnbc1x', verify });
      await assert.rejects(requestInvoice('https://ln.example/cb', 1000), /verify URL/);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});
