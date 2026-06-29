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

// Handle unhandled rejections from nostr-tools (relay errors)
process.on('unhandledRejection', (reason, promise) => {
  const msg = reason?.message || String(reason) || '';
  // Ignore relay-specific errors that don't affect overall operation
  if (msg.includes('restricted') ||
      msg.includes('Pay on') ||
      msg.includes('blocked') ||
      msg.includes('not allowed') ||
      msg.includes('network error') ||
      msg.includes('non-101') ||
      msg.includes('WebSocket') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('rate-limit') ||
      msg.includes('noting too much')) {
    console.warn('[Nostr] Ignoring relay rejection:', msg);
    return;
  }
  console.error('[Fatal] Unhandled rejection:', reason);
  process.exit(1);
});

import { config } from './lib/config.js';
import { NostrClient, decodeNsec } from './lib/nostr.js';
import { ProcessedStore } from './lib/processedStore.js';
import { generateInvoice, validateLightningAddress } from './lib/lightning.js';
import {
  parseOrderEvent,
  parsePaymentReceipt,
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
 * Format a human-readable thank-you note to ride inside the gift-wrapped status
 * update rumor's `content` field.
 */
function formatThankYouNote(orderId) {
  const orderIdShort = orderId.slice(0, 8);
  return `✅ Thank you for your order! Order #${orderIdShort} has been paid. We'll process it shortly and send shipping updates via Nostr.`;
}

/**
 * Handle incoming order (Kind 16 Type 1)
 */
async function handleOrder(event, nostrClient) {
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
    const invoice = await generateInvoice(
      config.lightningAddress,
      order.amount,
      order.orderId
    );

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

  // Skip if already processed (persisted across restarts)
  if (processedStore.hasReceipt(event.id)) {
    console.log(`[Payment] Skipping duplicate receipt for order ${receipt.orderId.slice(0, 8)}`);
    return;
  }
  processedStore.addReceipt(event.id);

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
    console.log(`[Payment] ✓ Gift-wrapped status update sent for order ${receipt.orderId.slice(0, 8)}`);
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
    console.log(`[Payment] ✓ Gift-wrapped readable thank-you sent for order ${receipt.orderId.slice(0, 8)}`);
  } catch (error) {
    console.warn(`[Payment] Failed to send readable thank-you gift wrap (non-fatal):`, error.message);
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
  const unsubGiftWraps = nostrClient.subscribe(giftWrapFilter, (giftWrap) => {
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
  }, 5000, TWO_DAYS_IN_SECONDS);

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

// Run
main().catch((error) => {
  console.error('[Fatal]', error);
  process.exit(1);
});
