/**
 * Robotechy Order Processing Service
 *
 * Listens for NIP-17 gift-wrapped (kind 1059) commerce messages and:
 * 1. Unwraps each gift wrap to its inner Gamma Markets rumor (kind 16/17)
 * 2. Generates Lightning invoices via LNURL-pay for incoming orders
 * 3. Sends gift-wrapped Kind 16 Type 2 payment requests back to the buyer
 * 4. On gift-wrapped Kind 17 payment receipts, sends a gift-wrapped thank-you
 *    status update (Kind 16 Type 3)
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

import { pathToFileURL } from 'url';
import { config } from './lib/config.js';
import { isIgnorableRelayError } from './lib/relayErrors.js';
import { NostrClient, decodeNsec } from './lib/nostr.js';
import { ProcessedStore } from './lib/processedStore.js';
import { generateInvoice, validateLightningAddress } from './lib/lightning.js';
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
 * Handle incoming order (Kind 16 Type 1)
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
 * `generateInvoice` is injected (defaulting to the real LNURL implementation) so
 * the order flow can be exercised hermetically in tests — no network, and the
 * test can assert it is called exactly once with the returned BOLT11 ending up
 * in the payment-request event.
 *
 * @param {Omit<import('nostr-tools').Event, 'id'|'sig'>} event - inner order rumor
 * @param {NostrClient} nostrClient
 * @param {{ generateInvoice?: typeof generateInvoice }} [deps]
 */
export async function handleOrder(
  event,
  nostrClient,
  { generateInvoice: genInvoice = generateInvoice } = {}
) {
  const order = parseOrderEvent(event);
  if (!order) {
    return;
  }

  // Skip if already processed (persisted across restarts to avoid re-invoicing)
  if (processedStore.hasOrder(order.orderId)) {
    console.log(`[Order] Skipping duplicate order ${order.orderId.slice(0, 8)}`);
    return;
  }
  processedStore.addOrder(order.orderId);

  console.log(`[Order] New order received!`);
  console.log(`  Order ID: ${order.orderId.slice(0, 8)}`);
  console.log(`  Buyer: ${order.buyerPubkey.slice(0, 8)}...`);
  console.log(`  Amount: ${order.amount} sats`);
  console.log(`  Items: ${order.items.length}`);
  if (order.address) console.log(`  Address: ${order.address}`);
  if (order.email) console.log(`  Email: ${order.email}`);
  if (order.message) console.log(`  Message: ${order.message}`);

  try {
    // Generate Lightning invoice
    console.log(`[Order] Generating invoice for ${order.amount} sats...`);
    const invoice = await genInvoice(config.lightningAddress, order.amount, order.orderId);

    // Build the Kind 16 Type 2 payment request rumor and gift-wrap it to the buyer.
    // The structured invoice data lives in the rumor tags; we fold a human-readable
    // note into the content. No plaintext event and no NIP-04 DM are published -
    // the whole payment request rides inside the encrypted NIP-17 gift wrap.
    const paymentRequestRumor = createPaymentRequestEvent(
      order.orderId,
      order.buyerPubkey,
      order.amount,
      invoice
    );
    paymentRequestRumor.content = formatInvoiceNote(order.orderId, order.amount);

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
      content: formatInvoiceChatNote(order.orderId, order.amount, invoice),
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
 */
async function handlePaymentReceipt(event, nostrClient) {
  const receipt = parsePaymentReceipt(event);
  if (!receipt) {
    return;
  }

  // Dedup on a STABLE key. `event` here is the inner NIP-17 rumor, which is
  // intentionally unsigned (no `id`) - keying on `event.id` would be `undefined`
  // for every receipt, collapsing all of them to one key so only the first ever
  // fires a confirmation. Use `${orderId}:${preimage}` instead: it is the payment
  // identity, so genuinely distinct receipts get distinct keys (never wrongly
  // skipped) while the same receipt re-fetched within the lookback window - or a
  // client retry that re-wraps the same payment - is correctly skipped.
  const receiptKey = receiptDedupKey(receipt);
  if (processedStore.hasReceipt(receiptKey)) {
    console.log(`[Payment] Skipping duplicate receipt for order ${receipt.orderId.slice(0, 8)}`);
    return;
  }
  processedStore.addReceipt(receiptKey);

  console.log(`[Payment] Payment received!`);
  console.log(`  Order ID: ${receipt.orderId.slice(0, 8)}`);
  console.log(`  Buyer: ${receipt.buyerPubkey.slice(0, 8)}...`);
  console.log(`  Amount: ${receipt.amount} sats`);

  const thankYouText = formatThankYouNote(receipt.orderId);

  // Send a gift-wrapped thank-you as a Kind 16 Type 3 status update (structured,
  // authoritative - parsed for rich cards). Non-blocking.
  const statusRumor = createStatusUpdateEvent(
    receipt.orderId,
    receipt.buyerPubkey,
    'confirmed',
    thankYouText
  );
  try {
    await nostrClient.sendGiftWrap(receipt.buyerPubkey, statusRumor);
    console.log(
      `[Payment] ✓ Gift-wrapped status update sent for order ${receipt.orderId.slice(0, 8)}`
    );
  } catch (error) {
    console.warn(`[Payment] Failed to send status gift wrap (non-fatal):`, error.message);
  }

  // Also send a gift-wrapped readable kind 14 line so the confirmation renders in
  // generic NIP-17 clients (Damus/Primal). Encrypted; non-blocking copy.
  const readableRumor = {
    kind: 14,
    content: thankYouText,
    tags: [['p', receipt.buyerPubkey]],
  };
  try {
    await nostrClient.sendGiftWrap(receipt.buyerPubkey, readableRumor);
    console.log(
      `[Payment] ✓ Gift-wrapped readable thank-you sent for order ${receipt.orderId.slice(0, 8)}`
    );
  } catch (error) {
    console.warn(
      `[Payment] Failed to send readable thank-you gift wrap (non-fatal):`,
      error.message
    );
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
// effects.
const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error) => {
    console.error('[Fatal]', error);
    process.exit(1);
  });
}
