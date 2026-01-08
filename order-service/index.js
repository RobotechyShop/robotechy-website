/**
 * Robotechy Order Processing Service
 *
 * Listens for Gamma Markets Kind 16 orders and:
 * 1. Generates Lightning invoices via LNURL-pay
 * 2. Sends Kind 16 Type 2 payment requests back to buyer
 * 3. Sends NIP-04 DM with invoice link to buyer
 * 4. Listens for Kind 17 payment receipts and sends thank you DM
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
import { generateInvoice, validateLightningAddress } from './lib/lightning.js';
import {
  parseOrderEvent,
  parsePaymentReceipt,
  createPaymentRequestEvent,
  ORDER_PROCESS_KIND,
  PAYMENT_RECEIPT_KIND,
  ORDER_MESSAGE_TYPE,
} from './lib/orderParser.js';

// Track processed orders to avoid duplicates
const processedOrders = new Set();
const processedReceipts = new Set();

/**
 * Format invoice notification DM
 */
function formatInvoiceDM(orderId, amountSats, invoice) {
  const orderIdShort = orderId.slice(0, 8);
  return `⚡ Invoice for Order #${orderIdShort}

Amount: ${amountSats.toLocaleString()} sats

Pay with Lightning:
lightning:${invoice}

Or copy the invoice and paste it in your wallet.`;
}

/**
 * Format thank you DM
 */
function formatThankYouDM(orderId) {
  const orderIdShort = orderId.slice(0, 8);
  return `✅ Thank you for your order!

Order #${orderIdShort} has been paid.

We'll process your order shortly and send shipping updates via Nostr DM.`;
}

/**
 * Handle incoming order (Kind 16 Type 1)
 */
async function handleOrder(event, nostrClient) {
  const order = parseOrderEvent(event);
  if (!order) {
    return;
  }

  // Skip if already processed
  if (processedOrders.has(order.orderId)) {
    console.log(`[Order] Skipping duplicate order ${order.orderId.slice(0, 8)}`);
    return;
  }
  processedOrders.add(order.orderId);

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

    // Create and publish Kind 16 Type 2 payment request
    const paymentRequestEvent = createPaymentRequestEvent(
      order.orderId,
      order.buyerPubkey,
      order.amount,
      invoice
    );

    // Get combined relays (merchant + buyer)
    const publishRelays = await nostrClient.getPublishRelays(order.buyerPubkey);

    console.log(`[Order] Publishing payment request to ${publishRelays.length} relays...`);
    await nostrClient.publishEvent(paymentRequestEvent, publishRelays);

    // Wait before sending DM to avoid rate limiting
    console.log(`[Order] Waiting 2s before sending DM...`);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Send NIP-04 DM with invoice to buyer (non-blocking, don't crash on failure)
    const invoiceDM = formatInvoiceDM(order.orderId, order.amount, invoice);
    try {
      await nostrClient.sendDM(order.buyerPubkey, invoiceDM);
      console.log(`[Order] ✓ Invoice DM sent to buyer`);
    } catch (dmError) {
      console.warn(`[Order] Failed to send invoice DM (non-fatal):`, dmError.message);
    }

    console.log(`[Order] ✓ Order ${order.orderId.slice(0, 8)} processed - invoice sent`);

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

  // Skip if already processed
  if (processedReceipts.has(event.id)) {
    console.log(`[Payment] Skipping duplicate receipt for order ${receipt.orderId.slice(0, 8)}`);
    return;
  }
  processedReceipts.add(event.id);

  console.log(`[Payment] Payment received!`);
  console.log(`  Order ID: ${receipt.orderId.slice(0, 8)}`);
  console.log(`  Buyer: ${receipt.buyerPubkey.slice(0, 8)}...`);
  console.log(`  Amount: ${receipt.amount} sats`);

  // Send thank you DM (non-blocking, don't crash on failure)
  const thankYouDM = formatThankYouDM(receipt.orderId);
  try {
    await nostrClient.sendDM(receipt.buyerPubkey, thankYouDM);
    console.log(`[Payment] ✓ Thank you message sent for order ${receipt.orderId.slice(0, 8)}`);
  } catch (error) {
    console.warn(`[Payment] Failed to send thank you DM (non-fatal):`, error.message);
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

  // Subscribe to Kind 16 orders addressed to merchant
  // Note: Filter by type in handler since many relays don't support #type filtering
  const orderFilter = {
    kinds: [ORDER_PROCESS_KIND],
    '#p': [nostrClient.pubkey],
    since: Math.floor(Date.now() / 1000),
  };

  // Subscribe to Kind 17 payment receipts addressed to merchant
  const receiptFilter = {
    kinds: [PAYMENT_RECEIPT_KIND],
    '#p': [nostrClient.pubkey],
    since: Math.floor(Date.now() / 1000),
  };

  // Start polling for orders and receipts
  const unsubOrders = nostrClient.subscribe(orderFilter, (event) => {
    handleOrder(event, nostrClient);
  });

  const unsubReceipts = nostrClient.subscribe(receiptFilter, (event) => {
    handlePaymentReceipt(event, nostrClient);
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n[Shutdown] Received SIGINT, closing connections...');
    unsubOrders();
    unsubReceipts();
    nostrClient.close();
    console.log('[Shutdown] Goodbye!');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n\n[Shutdown] Received SIGTERM, closing connections...');
    unsubOrders();
    unsubReceipts();
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
