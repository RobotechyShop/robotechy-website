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

/**
 * Parse a Kind 16 Type 1 order event
 * @param {import('nostr-tools').Event} event
 * @returns {{orderId: string, buyerPubkey: string, amount: number, items: Array<{ref: string, quantity: number}>, address: string, email: string, phone?: string, message?: string} | null}
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

  if (!orderTag || !amountTag) {
    console.warn('[OrderParser] Missing required order or amount tag');
    return null;
  }

  // Parse item tags: ['item', 'product_ref', 'quantity']
  const itemTags = event.tags.filter(t => t[0] === 'item');
  const items = itemTags.map(t => ({
    ref: t[1],           // e.g., "30402:pubkey:d-tag"
    quantity: parseInt(t[2], 10) || 1,
  }));

  return {
    orderId: orderTag[1],
    buyerPubkey: event.pubkey,
    amount: parseInt(amountTag[1], 10),
    items,
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

  if (!orderTag || !paymentTag) {
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
