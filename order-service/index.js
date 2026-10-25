/**
 * Robotechy Order Processing Service
 *
 * Listens for NIP-17 gift-wrapped (kind 1059) commerce messages and:
 * 1. Unwraps each gift wrap to its inner Gamma Markets rumor (kind 16/17)
 * 2. Prices each order itself from the shop's signed catalog (the buyer's
 *    `amount` is only compared, never invoiced) and cancels orders that don't
 *    match (lib/pricing.js)
 * 3. Generates a Lightning invoice via LNURL-pay for the server-computed total,
 *    records it, and sends a gift-wrapped Kind 16 Type 2 payment request
 * 4. On gift-wrapped Kind 17 payment receipts, verifies the payment against the
 *    recorded invoice (preimage, plus LUD-21 verify when available) before
 *    sending a gift-wrapped "paid" status update (Kind 16 Type 3)
 *
 * All commerce traffic is NIP-17 end-to-end: customer PII rides inside the
 * encrypted wrap, never in plaintext public events.
 */

// Handle unhandled rejections from nostr-tools (relay errors). A flaky relay must
// never crash order processing — see lib/relayErrors.js for the classification.
process.on('unhandledRejection', (reason) => {
  if (isIgnorableRelayError(reason)) {
    console.warn('[Nostr] Ignoring relay rejection:', reason?.message || reason);
    return;
  }
  console.error('[Fatal] Unhandled rejection:', reason);
  process.exit(1);
});

import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { config } from './lib/config.js';
import { isIgnorableRelayError } from './lib/relayErrors.js';
import { NostrClient, decodeNsec } from './lib/nostr.js';
import { ProcessedStore } from './lib/processedStore.js';
import { generateInvoice, validateLightningAddress } from './lib/lightning.js';
import { loadCatalog } from './lib/catalog.js';
import { getSatsRates } from './lib/exchangeRate.js';
import { needsExchangeRates, priceOrder } from './lib/pricing.js';
import { decodeInvoice, verifyPayment } from './lib/payment.js';
import {
  parseOrderEvent,
  parsePaymentReceipt,
  receiptDedupKey,
  createPaymentRequestEvent,
  createStatusUpdateEvent,
  ORDER_PROCESS_KIND,
  PAYMENT_RECEIPT_KIND,
  ORDER_MESSAGE_TYPE,
} from './lib/orderParser.js';

// NIP-59 gift wrap kind (transport for all NIP-17 commerce messages)
const GIFT_WRAP_KIND = 1059;

// Gift wraps use randomized past timestamps per NIP-59, so the subscription
// looks back 2 days to avoid missing any. The dedup store is pruned to the same
// window (anything older can no longer be re-fetched by the `since` filter).
const TWO_DAYS_IN_SECONDS = 2 * 24 * 60 * 60;

// Track processed orders/receipts to avoid duplicates. Persisted to disk so a
// restart doesn't re-process (and re-invoice) up to 2 days of historical gift
// wraps re-fetched by the lookback `since` filter.
const processedStore = new ProcessedStore(undefined, TWO_DAYS_IN_SECONDS);

// Receipts currently being verified (LUD-21 polling takes a few seconds), so a
// duplicate gift wrap can't race the first through to a second confirmation.
const inFlightReceipts = new Set();

// Pricing needs the catalog from relays (and maybe exchange rates); retry a
// transient outage this many times before telling the buyer.
const PRICING_ATTEMPTS = 3;
const PRICING_RETRY_MS = 5000;

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Format a human-readable note to ride inside the gift-wrapped payment request
 * rumor's `content` field (structured invoice data lives in the rumor tags).
 */
function formatInvoiceNote(orderId, amountSats) {
  const orderIdShort = orderId.slice(0, 8);
  return `⚡ Invoice for Order #${orderIdShort} - ${amountSats.toLocaleString()} sats. Pay the Lightning invoice to complete your order.`;
}

/**
 * Format the human-readable kind-14 chat note that carries the SAME BOLT11 as
 * the kind-16 payment-request card. Generic NIP-17 DM clients (0xchat, Amethyst's
 * DM view, etc.) only render kind-14 chat rumors — they can't draw a kind-16
 * marketplace order card — so without this the buyer never sees the invoice in
 * those clients. The raw BOLT11 is included on its own line so LN-aware clients
 * make it tappable. This is NOT a second invoice: it embeds the one invoice
 * `generateInvoice` returned, so it cannot diverge from the website invoice
 * (#7) — a single BOLT11 settles once, any second pay attempt simply fails.
 */
function formatInvoiceChatNote(orderId, amountSats, invoice) {
  const orderIdShort = orderId.slice(0, 8);
  return `⚡ Invoice for order #${orderIdShort} — ${amountSats.toLocaleString()} sats:\n${invoice}`;
}

/**
 * Format a human-readable thank-you note to ride inside the gift-wrapped status
 * update rumor's `content` field.
 */
function formatThankYouNote(orderId) {
  const orderIdShort = orderId.slice(0, 8);
  return `✅ Thank you for your order! Order #${orderIdShort} has been paid. We'll process it shortly and send shipping updates via Nostr.`;
}

/**
 * Buyer-readable note for an order the service won't invoice.
 */
function formatCancelNote(orderId, reason) {
  const orderIdShort = orderId.slice(0, 8);
  return `❌ We couldn't accept order #${orderIdShort}: ${reason}. You have not been charged. Please refresh the shop and place the order again.`;
}

/**
 * Neutral note when a receipt's preimage checked out but the Lightning provider
 * hasn't confirmed settlement. Never claims the order is paid.
 */
function formatUnconfirmedNote(orderId) {
  const orderIdShort = orderId.slice(0, 8);
  return `⏳ We received your payment receipt for order #${orderIdShort}, but couldn't confirm the payment with our Lightning provider yet. We'll check and follow up here.`;
}

/**
 * Tell the buyer an order was refused: a gift-wrapped Kind 16 Type 3
 * 'cancelled' status (the website's checkout shows its text) plus a readable
 * kind-14 copy for generic NIP-17 clients. No invoice exists for it.
 */
async function cancelOrder(order, reason, nostrClient) {
  console.warn(`[Order] ✗ Cancelling order ${order.orderId.slice(0, 8)}: ${reason}`);
  const note = formatCancelNote(order.orderId, reason);
  const statusRumor = createStatusUpdateEvent(order.orderId, order.buyerPubkey, 'cancelled', note);
  try {
    await nostrClient.sendGiftWrap(order.buyerPubkey, statusRumor);
  } catch (error) {
    console.error(
      `[Order] Failed to send cancellation for ${order.orderId.slice(0, 8)}:`,
      error.message
    );
  }
  try {
    await nostrClient.sendGiftWrap(order.buyerPubkey, {
      kind: 14,
      content: note,
      tags: [
        ['p', order.buyerPubkey],
        ['order', order.orderId],
      ],
    });
  } catch (error) {
    console.warn(`[Order] Failed to send kind-14 cancellation note (non-fatal):`, error.message);
  }
}

/** Default catalog loader: the order's listings + all shipping options, verified. */
function defaultLoadCatalog(order, nostrClient, merchantPubkey) {
  const relays = [...new Set([...(nostrClient.relays || []), ...config.fallbackRelays])];
  return loadCatalog(nostrClient.pool, relays, order, merchantPubkey);
}

/**
 * Price an order from the verified catalog, retrying transient failures
 * (relay or exchange-rate outage). Returns priceOrder's verdict, or null when
 * the price couldn't be determined at all.
 */
async function priceWithRetry(
  order,
  nostrClient,
  { loadOrderCatalog, getRates, merchantPubkey, sleep, attempts }
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const catalog = await loadOrderCatalog(order, nostrClient, merchantPubkey);
      const rates = needsExchangeRates(order, catalog) ? await getRates() : undefined;
      return priceOrder(order, catalog, { merchantPubkey, rates });
    } catch (error) {
      console.warn(
        `[Order] Pricing attempt ${attempt}/${attempts} for ${order.orderId.slice(0, 8)} failed:`,
        error.message
      );
      if (attempt < attempts) await sleep(PRICING_RETRY_MS * attempt);
    }
  }
  return null;
}

/**
 * Handle incoming order (Kind 16 Type 1)
 *
 * The order is priced HERE, from the shop's own signed catalog (see
 * lib/pricing.js): unknown or forged items, items by another author, bad or
 * excessive quantities and amounts that don't match the recomputed total are
 * cancelled with a readable reason instead of invoiced. Accepted orders are
 * invoiced for the SERVER-computed total; the buyer's `amount` tag is only
 * compared, never used. The issued invoice (payment hash, amount, LUD-21
 * verify URL) is persisted before it is sent, so a later receipt can be
 * checked against it.
 *
 * Generates exactly ONE Lightning invoice for the order and delivers that single
 * BOLT11 two ways, both gift-wrapped to the buyer: a Kind 16 Type 2 payment
 * request (the marketplace order card) AND a NIP-17 kind-14 chat note (a fallback
 * for generic DM clients that can't render the kind-16 card). Both carry the
 * IDENTICAL invoice and the same ['order', id] tag, so they can never diverge —
 * the invariant that fixes #7 (DM invoice diverging from the website invoice).
 * One BOLT11 settles once, so the kind-14 copy cannot enable double payment. No
 * separate NIP-04 DM is used. The regression test in test/single-invoice.test.js
 * locks this in.
 *
 * `generateInvoice` and `store` are injected (defaulting to the real LNURL
 * implementation and the module-level persisted dedup store) so the order flow
 * can be exercised hermetically in tests — no network and no disk writes — while
 * production keeps using the on-disk store. The test can then assert
 * `generateInvoice` is called exactly once with the returned BOLT11 ending up in
 * the payment-request event.
 *
 * @param {Omit<import('nostr-tools').Event, 'id'|'sig'>} event - inner order rumor
 * @param {NostrClient} nostrClient
 * @param {{
 *   generateInvoice?: typeof generateInvoice,
 *   store?: ProcessedStore,
 *   loadCatalog?: (order: object, nostrClient: NostrClient, merchantPubkey: string) => Promise<{ listings: Map<string, object>, shippingOptions: Map<string, object> }>,
 *   getRates?: typeof getSatsRates,
 *   decodeInvoice?: typeof decodeInvoice,
 *   merchantPubkey?: string,
 *   sleep?: (ms: number) => Promise<void>,
 *   pricingAttempts?: number,
 * }} [deps]
 */
export async function handleOrder(
  event,
  nostrClient,
  {
    generateInvoice: genInvoice = generateInvoice,
    store = processedStore,
    loadCatalog: loadOrderCatalog = defaultLoadCatalog,
    getRates = getSatsRates,
    decodeInvoice: decode = decodeInvoice,
    merchantPubkey = nostrClient.pubkey,
    sleep = defaultSleep,
    pricingAttempts = PRICING_ATTEMPTS,
  } = {}
) {
  const order = parseOrderEvent(event);
  if (!order) {
    return;
  }

  // Skip if already processed (persisted across restarts to avoid re-invoicing)
  if (store.hasOrder(order.orderId)) {
    console.log(`[Order] Skipping duplicate order ${order.orderId.slice(0, 8)}`);
    return;
  }
  store.addOrder(order.orderId);

  console.log(`[Order] New order received!`);
  console.log(`  Order ID: ${order.orderId.slice(0, 8)}`);
  console.log(`  Buyer: ${order.buyerPubkey.slice(0, 8)}...`);
  console.log(`  Amount (buyer-stated): ${order.amount} sats`);
  console.log(`  Items: ${order.items.length}`);
  if (order.address) console.log(`  Address: ${order.address}`);
  if (order.email) console.log(`  Email: ${order.email}`);
  if (order.message) console.log(`  Message: ${order.message}`);

  // Price the order from the verified catalog; never trust the buyer's amount.
  const priced = await priceWithRetry(order, nostrClient, {
    loadOrderCatalog,
    getRates,
    merchantPubkey,
    sleep,
    attempts: pricingAttempts,
  });
  if (!priced) {
    await cancelOrder(order, "we couldn't check the current prices just now", nostrClient);
    return;
  }
  if (!priced.ok) {
    await cancelOrder(order, priced.reason, nostrClient);
    return;
  }
  const amount = priced.totalSats;
  console.log(
    `[Order] Priced at ${amount} sats (items ${priced.itemsSats} + shipping ${priced.shippingSats}); buyer stated ${order.amount}`
  );

  let invoice;
  try {
    // Generate the Lightning invoice for the SERVER-computed amount.
    console.log(`[Order] Generating invoice for ${amount} sats...`);
    const generated = await genInvoice(config.lightningAddress, amount, order.orderId);
    invoice = generated.invoice;

    // Bind the invoice to the order: its payment hash is what a receipt's
    // preimage must hash to. Refuse an invoice for a different amount (a
    // misbehaving provider).
    const { paymentHash, amountMsat } = decode(invoice);
    if (amountMsat !== amount * 1000) {
      throw new Error(
        `LNURL provider returned an invoice for ${amountMsat} msats, expected ${amount * 1000}`
      );
    }
    // Must be durable BEFORE the buyer can pay it, or their receipt could never
    // be verified. Throws if it can't be persisted, so nothing is sent.
    store.addInvoice(order.orderId, {
      invoice,
      paymentHash,
      amountSats: amount,
      buyerPubkey: order.buyerPubkey,
      verifyUrl: generated.verify,
    });
  } catch (error) {
    console.error(`[Order] ✗ Could not invoice order ${order.orderId.slice(0, 8)}:`, error.message);
    await cancelOrder(order, "we couldn't create a Lightning invoice just now", nostrClient);
    return;
  }

  try {
    // Build the Kind 16 Type 2 payment request rumor and gift-wrap it to the buyer.
    // The structured invoice data lives in the rumor tags; we fold a human-readable
    // note into the content. No plaintext event and no NIP-04 DM are published -
    // the whole payment request rides inside the encrypted NIP-17 gift wrap.
    const paymentRequestRumor = createPaymentRequestEvent(
      order.orderId,
      order.buyerPubkey,
      amount,
      invoice
    );
    paymentRequestRumor.content = formatInvoiceNote(order.orderId, amount);

    console.log(`[Order] Sending gift-wrapped payment request to buyer...`);
    await nostrClient.sendGiftWrap(order.buyerPubkey, paymentRequestRumor);

    // ALSO deliver the SAME invoice as a gift-wrapped NIP-17 kind-14 chat note.
    // Generic NIP-17 clients (0xchat, Amethyst DM view) can't render the kind-16
    // order card, so they'd never show the invoice; the kind-14 fallback makes the
    // raw BOLT11 visible (and tappable) there. Crucially it reuses `invoice` — the
    // one and only invoice generated above — and carries the SAME ['order', id]
    // tag as the kind-16 event so rich clients can correlate/dedupe the two. This
    // is safe re #7: one BOLT11 settles once; a second pay attempt simply fails.
    const invoiceChatRumor = {
      kind: 14,
      content: formatInvoiceChatNote(order.orderId, amount, invoice),
      tags: [
        ['p', order.buyerPubkey],
        ['order', order.orderId],
      ],
    };

    console.log(`[Order] Sending gift-wrapped kind-14 invoice note to buyer...`);
    await nostrClient.sendGiftWrap(order.buyerPubkey, invoiceChatRumor);

    console.log(`[Order] ✓ Order ${order.orderId.slice(0, 8)} processed - payment request sent`);
  } catch (error) {
    console.error(`[Order] ✗ Failed to process order ${order.orderId.slice(0, 8)}:`, error.message);
  }
}

/**
 * Handle payment receipt (Kind 17)
 *
 * A receipt is buyer-supplied, so it is checked against the invoice this
 * service issued for the order (lib/payment.js verifyPayment) before anything
 * says "paid":
 *   - the order must have our recorded invoice, and the receipt must come from
 *     that order's buyer
 *   - the receipt's invoice (when present) must be ours
 *   - sha256(preimage) must equal our invoice's payment hash
 *   - when the provider gave a LUD-21 verify URL, it must report settled
 * Bogus receipts are logged and get no reply. A receipt the provider hasn't
 * confirmed gets a neutral "couldn't confirm yet" note and is NOT persisted,
 * so a restart re-checks it.
 *
 * @param {Omit<import('nostr-tools').Event, 'id'|'sig'>} event - inner receipt rumor
 * @param {NostrClient} nostrClient
 * @param {{ store?: ProcessedStore, verify?: Parameters<typeof verifyPayment>[2] }} [deps]
 */
export async function handlePaymentReceipt(
  event,
  nostrClient,
  { store = processedStore, verify: verifyDeps } = {}
) {
  const receipt = parsePaymentReceipt(event);
  if (!receipt) {
    return;
  }

  // Dedup on a STABLE key. `event` here is the inner NIP-17 rumor, which is
  // intentionally unsigned (no `id`) - keying on `event.id` would be `undefined`
  // for every receipt. `${orderId}:${preimage}` is the payment identity.
  const receiptKey = receiptDedupKey(receipt);
  if (store.hasReceipt(receiptKey) || inFlightReceipts.has(receiptKey)) {
    console.log(`[Payment] Skipping duplicate receipt for order ${receipt.orderId.slice(0, 8)}`);
    return;
  }
  inFlightReceipts.add(receiptKey);
  const orderShort = receipt.orderId.slice(0, 8);

  try {
    console.log(
      `[Payment] Receipt received for order ${orderShort} from ${receipt.buyerPubkey.slice(0, 8)}...`
    );

    const record = store.getInvoice(receipt.orderId);
    let rejection = null;
    if (!record) rejection = 'no invoice was issued for this order';
    else if (record.paidAt) rejection = 'the order is already confirmed';
    else if (receipt.buyerPubkey !== record.buyerPubkey) rejection = 'sender is not the buyer';

    const result = rejection
      ? { status: 'invalid', reason: rejection }
      : await verifyPayment(record, receipt, verifyDeps);

    if (result.status === 'invalid') {
      console.warn(`[Payment] ✗ Ignoring receipt for order ${orderShort}: ${result.reason}`);
      store.addReceipt(receiptKey);
      return;
    }

    if (result.status === 'unsettled') {
      console.warn(`[Payment] Receipt for order ${orderShort} not confirmed: ${result.reason}`);
      try {
        await nostrClient.sendGiftWrap(receipt.buyerPubkey, {
          kind: 14,
          content: formatUnconfirmedNote(receipt.orderId),
          tags: [
            ['p', receipt.buyerPubkey],
            ['order', receipt.orderId],
          ],
        });
      } catch (error) {
        console.warn(
          `[Payment] Failed to send unconfirmed-payment note (non-fatal):`,
          error.message
        );
      }
      return;
    }

    console.log(
      `[Payment] ✓ Payment verified (${result.method}) for order ${orderShort}: ${record.amountSats} sats`
    );
    store.markPaid(receipt.orderId);
    store.addReceipt(receiptKey);

    const thankYouText = formatThankYouNote(receipt.orderId);

    // Gift-wrapped Kind 16 Type 3 status update (structured, authoritative).
    const statusRumor = createStatusUpdateEvent(
      receipt.orderId,
      receipt.buyerPubkey,
      'confirmed',
      thankYouText
    );
    try {
      await nostrClient.sendGiftWrap(receipt.buyerPubkey, statusRumor);
      console.log(`[Payment] ✓ Gift-wrapped status update sent for order ${orderShort}`);
    } catch (error) {
      console.warn(`[Payment] Failed to send status gift wrap (non-fatal):`, error.message);
    }

    // Also a gift-wrapped readable kind 14 line so the confirmation renders in
    // generic NIP-17 clients (Damus/Primal). Encrypted; non-blocking copy.
    try {
      await nostrClient.sendGiftWrap(receipt.buyerPubkey, {
        kind: 14,
        content: thankYouText,
        tags: [['p', receipt.buyerPubkey]],
      });
      console.log(`[Payment] ✓ Gift-wrapped readable thank-you sent for order ${orderShort}`);
    } catch (error) {
      console.warn(
        `[Payment] Failed to send readable thank-you gift wrap (non-fatal):`,
        error.message
      );
    }
  } finally {
    inFlightReceipts.delete(receiptKey);
  }
}

/**
 * Main entry point
 */
async function main() {
  console.log('='.repeat(50));
  console.log('Robotechy Order Processing Service');
  console.log('='.repeat(50));

  // Validate Lightning Address
  console.log(`\n[Startup] Validating Lightning Address: ${config.lightningAddress}`);
  const isValid = await validateLightningAddress(config.lightningAddress);
  if (!isValid) {
    console.error('[Startup] ✗ Invalid Lightning Address - check your configuration');
    process.exit(1);
  }
  console.log('[Startup] ✓ Lightning Address is valid');

  // Decode merchant nsec
  console.log('\n[Startup] Decoding merchant credentials...');
  const secretKey = decodeNsec(config.merchantNsec);

  // Initialize Nostr client
  console.log('[Startup] Connecting to Nostr relays...');
  const nostrClient = new NostrClient(secretKey, config.fallbackRelays);
  await nostrClient.init();

  console.log('\n[Startup] ✓ Service ready - listening for orders\n');
  console.log('-'.repeat(50));

  // Subscribe to NIP-17 gift wraps (kind 1059) addressed to the merchant.
  // A single subscription carries every commerce message; we unwrap each gift
  // wrap and dispatch by the inner rumor's kind/type. (Gift wraps use randomized
  // past timestamps per NIP-59, so look back 2 days to avoid missing any.)
  const giftWrapFilter = {
    kinds: [GIFT_WRAP_KIND],
    '#p': [nostrClient.pubkey],
    since: Math.floor(Date.now() / 1000) - TWO_DAYS_IN_SECONDS,
  };

  // Start polling for gift wraps, unwrap, and dispatch by inner rumor kind/type.
  const unsubGiftWraps = nostrClient.subscribe(
    giftWrapFilter,
    (giftWrap) => {
      const rumor = nostrClient.unwrapGiftWrap(giftWrap);
      if (!rumor) {
        return; // Not decryptable / not authenticated / not for us
      }

      const typeTag = rumor.tags?.find((t) => t[0] === 'type');

      if (rumor.kind === ORDER_PROCESS_KIND && typeTag?.[1] === ORDER_MESSAGE_TYPE.ORDER_CREATION) {
        handleOrder(rumor, nostrClient);
      } else if (rumor.kind === PAYMENT_RECEIPT_KIND) {
        handlePaymentReceipt(rumor, nostrClient);
      } else {
        console.log(
          `[Nostr] Ignoring gift wrap with inner kind ${rumor.kind}${typeTag ? ` type ${typeTag[1]}` : ''}`
        );
      }
    },
    5000,
    TWO_DAYS_IN_SECONDS
  );

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n[Shutdown] Received SIGINT, closing connections...');
    unsubGiftWraps();
    nostrClient.close();
    console.log('[Shutdown] Goodbye!');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n\n[Shutdown] Received SIGTERM, closing connections...');
    unsubGiftWraps();
    nostrClient.close();
    process.exit(0);
  });

  // Keep alive
  console.log('[Service] Waiting for orders... (Ctrl+C to stop)\n');
}

// Run — but only when executed directly (`node index.js`), not when this module
// is imported (e.g. by the regression test, which imports `handleOrder`). Guard
// with an entry-point check so importing the module has no network/relay side
// effects. `resolve()` makes the script path absolute first (Node already gives
// an absolute argv[1] for the main module, but resolving is a defensive no-op
// that keeps pathToFileURL correct even if argv[1] were ever relative).
const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntryPoint) {
  main().catch((error) => {
    console.error('[Fatal]', error);
    process.exit(1);
  });
}
