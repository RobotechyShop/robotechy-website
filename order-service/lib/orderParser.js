/**
 * Parse Gamma Markets Kind 16 and Kind 17 events
 */

// Gamma Markets event kinds
export const ORDER_PROCESS_KIND = 16;
export const PAYMENT_RECEIPT_KIND = 17;

// Order message types for Kind 16
export const ORDER_MESSAGE_TYPE = {
  ORDER_CREATION: '1',
  PAYMENT_REQUEST: '2',
  STATUS_UPDATE: '3',
  SHIPPING_UPDATE: '4',
};

// Sanity cap on an order's sat amount (0.1 BTC — far above anything the shop
// sells). Orders come from untrusted buyers, so an amount must be a plain, safe,
// positive integer within this cap before anything is priced or invoiced.
export const MAX_ORDER_SATS = 10_000_000;

/**
 * Strictly parse an untrusted sat amount: digits only, safe integer, positive,
 * within MAX_ORDER_SATS. Returns null for anything else — parseInt would accept
 * partial junk ("100abc"), negatives and unbounded magnitudes.
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseSatAmount(raw) {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_ORDER_SATS ? value : null;
}

/**
 * Strictly parse an untrusted item quantity: digits only, safe positive integer.
 * Returns null otherwise, so pricing can cancel the order with a reason (the old
 * `parseInt(...) || 1` silently turned junk into a quantity of one). The
 * per-line cap is enforced by pricing (lib/pricing.js MAX_QUANTITY).
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseQuantity(raw) {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Parse a Kind 16 Type 1 order event
 * @param {import('nostr-tools').Event} event
 * @returns {{orderId: string, buyerPubkey: string, amount: number, items: Array<{ref: string, quantity: number | null}>, shippingRef?: string, address: string, email: string, phone?: string, message?: string} | null}
 */
export function parseOrderEvent(event) {
  if (event.kind !== ORDER_PROCESS_KIND) {
    return null;
  }

  const typeTag = event.tags.find(t => t[0] === 'type');
  if (typeTag?.[1] !== ORDER_MESSAGE_TYPE.ORDER_CREATION) {
    return null;
  }

  const orderTag = event.tags.find(t => t[0] === 'order');
  const amountTag = event.tags.find(t => t[0] === 'amount');
  const addressTag = event.tags.find(t => t[0] === 'address');
  const emailTag = event.tags.find(t => t[0] === 'email');
  const phoneTag = event.tags.find(t => t[0] === 'phone');
  const shippingTag = event.tags.find(t => t[0] === 'shipping' && typeof t[1] === 'string');

  if (typeof orderTag?.[1] !== 'string' || !orderTag[1] || !amountTag) {
    console.warn('[OrderParser] Missing required order or amount tag');
    return null;
  }

  // The buyer's amount is untrusted: it is only ever COMPARED with the
  // server-computed total (lib/pricing.js), never invoiced. Still reject junk
  // outright so nothing downstream sees NaN, negatives or absurd magnitudes.
  const amount = parseSatAmount(amountTag[1]);
  if (amount === null) {
    console.warn(`[OrderParser] Rejecting order with invalid amount ${JSON.stringify(amountTag[1])}`);
    return null;
  }

  // Parse item tags: ['item', 'product_ref', 'quantity']. A null quantity is
  // kept (not defaulted) so pricing can cancel the order with a reason.
  const itemTags = event.tags.filter(t => t[0] === 'item');
  const items = itemTags.map(t => ({
    ref: t[1],           // e.g., "30402:pubkey:d-tag"
    quantity: parseQuantity(t[2]),
  }));

  return {
    orderId: orderTag[1],
    buyerPubkey: event.pubkey,
    amount,
    items,
    // Chosen shipping option per the Gamma spec: "30406:<pubkey>:<d-tag>".
    // Absent when the buyer picked one of the website's legacy fallback zones.
    shippingRef: shippingTag?.[1] || undefined,
    address: addressTag?.[1] || '',
    email: emailTag?.[1] || '',
    phone: phoneTag?.[1],
    message: event.content || undefined,
  };
}

/**
 * Parse a Kind 17 payment receipt event
 * @param {import('nostr-tools').Event} event
 * @returns {{orderId: string, buyerPubkey: string, paymentType: string, invoice: string, preimage: string, amount: number} | null}
 */
export function parsePaymentReceipt(event) {
  if (event.kind !== PAYMENT_RECEIPT_KIND) {
    return null;
  }

  const orderTag = event.tags.find(t => t[0] === 'order');
  const paymentTag = event.tags.find(t => t[0] === 'payment');
  const amountTag = event.tags.find(t => t[0] === 'amount');

  if (typeof orderTag?.[1] !== 'string' || !orderTag[1] || !paymentTag) {
    console.warn('[OrderParser] Missing required order or payment tag');
    return null;
  }

  return {
    orderId: orderTag[1],
    buyerPubkey: event.pubkey,
    paymentType: paymentTag[1],  // 'lightning' or 'bitcoin'
    invoice: paymentTag[2],       // BOLT11 invoice
    preimage: paymentTag[3],      // Payment preimage (proof)
    amount: parseInt(amountTag?.[1], 10) || 0,
  };
}

/**
 * Build a STABLE dedup key for a parsed payment receipt.
 *
 * The receipt rides inside a NIP-17 gift wrap as an unsigned inner rumor, so the
 * rumor has no `id` - keying dedup on `event.id` yields `undefined` for every
 * receipt, collapsing them all to one key (so only the first ever fires a
 * confirmation). `${orderId}:${preimage}` is the payment identity instead:
 * genuinely distinct payments get distinct keys (never wrongly skipped) while the
 * same payment re-fetched within the lookback window - or re-wrapped by a client
 * retry - is correctly skipped.
 *
 * @param {{orderId: string, preimage: string}} receipt - parsePaymentReceipt result
 * @returns {string}
 */
export function receiptDedupKey(receipt) {
  return `${receipt.orderId}:${receipt.preimage}`;
}

/**
 * Create a Kind 16 Type 2 payment request event template
 * @param {string} orderId
 * @param {string} buyerPubkey
 * @param {number} amountSats
 * @param {string} invoice - BOLT11 invoice
 * @returns {Partial<import('nostr-tools').Event>}
 */
export function createPaymentRequestEvent(orderId, buyerPubkey, amountSats, invoice) {
  return {
    kind: ORDER_PROCESS_KIND,
    content: 'Please pay this invoice to complete your order',
    tags: [
      ['p', buyerPubkey],
      ['type', ORDER_MESSAGE_TYPE.PAYMENT_REQUEST],
      ['order', orderId],
      ['amount', amountSats.toString()],
      ['payment', 'lightning', invoice],
    ],
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Create a Kind 16 Type 3 status update event template
 * @param {string} orderId
 * @param {string} buyerPubkey
 * @param {string} status - 'pending', 'confirmed', 'processing', 'completed', 'cancelled'
 * @param {string} [message]
 * @returns {Partial<import('nostr-tools').Event>}
 */
export function createStatusUpdateEvent(orderId, buyerPubkey, status, message = '') {
  return {
    kind: ORDER_PROCESS_KIND,
    content: message,
    tags: [
      ['p', buyerPubkey],
      ['type', ORDER_MESSAGE_TYPE.STATUS_UPDATE],
      ['order', orderId],
      ['status', status],
    ],
    created_at: Math.floor(Date.now() / 1000),
  };
}
