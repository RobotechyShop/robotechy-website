import type { CartItem, ShippingInfo } from '@/lib/cartTypes';
import type { NostrEvent } from '@nostrify/nostrify';

// Gamma Markets event kinds
export const ORDER_GENERAL_KIND = 14; // General communication
export const ORDER_PROCESS_KIND = 16; // Order processing
export const PAYMENT_RECEIPT_KIND = 17; // Payment receipts

// Order message types for Kind 16
export const ORDER_MESSAGE_TYPE = {
  ORDER_CREATION: '1',
  PAYMENT_REQUEST: '2',
  STATUS_UPDATE: '3',
  SHIPPING_UPDATE: '4',
} as const;

// Order status values
export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

/**
 * Generate a unique order ID
 */
export function generateOrderId(): string {
  return crypto.randomUUID();
}

/**
 * Format shipping address as a single string
 */
export function formatAddress(info: ShippingInfo): string {
  const parts = [info.address, info.city, info.state, info.postalCode, info.country].filter(
    Boolean
  );
  return parts.join(', ');
}

/**
 * Convert price from currency amount to satoshis
 * For now, assumes USD and uses a fixed rate (should be fetched from API in production)
 */
export function convertToSats(amount: number, currency: string): number {
  // For SATS/SAT currency, amount is already in sats
  if (currency.toUpperCase() === 'SATS' || currency.toUpperCase() === 'SAT') {
    return Math.round(amount);
  }

  // For BTC, convert to sats (1 BTC = 100,000,000 sats)
  if (currency.toUpperCase() === 'BTC') {
    return Math.round(amount * 100_000_000);
  }

  // For fiat currencies, we need an exchange rate
  // This is a placeholder - in production, fetch real-time rates
  // Using approximate rate: 1 USD = 2500 sats (adjust as needed)
  const SATS_PER_USD = 2500;
  return Math.round(amount * SATS_PER_USD);
}

/**
 * Create order tags for Kind 16 Type 1 (Order Creation)
 */
export function createOrderTags(
  orderId: string,
  items: CartItem[],
  shipping: ShippingInfo,
  merchantPubkey: string,
  totalSats: number
): string[][] {
  const tags: string[][] = [
    ['p', merchantPubkey],
    ['subject', `Order ${orderId.slice(0, 8)}`],
    ['type', ORDER_MESSAGE_TYPE.ORDER_CREATION],
    ['order', orderId],
    ['amount', totalSats.toString()],
  ];

  // Add item tags - format: ['item', 'product_ref', 'quantity']
  // Product ref format: 30402:<pubkey>:<d-tag>
  for (const item of items) {
    const productRef = `30402:${item.product.event.pubkey}:${item.productId}`;
    tags.push(['item', productRef, item.quantity.toString()]);
  }

  // Add shipping/contact info
  tags.push(['address', formatAddress(shipping)]);
  tags.push(['email', shipping.email]);

  if (shipping.phone) {
    tags.push(['phone', shipping.phone]);
  }

  return tags;
}

/**
 * Create a Kind 16 order creation event template
 * Note: This returns an unsigned event template - signing is done by the signer
 */
export function createOrderEventTemplate(
  orderId: string,
  items: CartItem[],
  shipping: ShippingInfo,
  merchantPubkey: string,
  totalSats: number
): Partial<NostrEvent> {
  return {
    kind: ORDER_PROCESS_KIND,
    content: shipping.message || '',
    tags: createOrderTags(orderId, items, shipping, merchantPubkey, totalSats),
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Create a Kind 17 payment receipt event template
 */
export function createPaymentReceiptTemplate(
  orderId: string,
  merchantPubkey: string,
  paymentMethod: 'lightning' | 'bitcoin',
  invoice: string,
  proof: string,
  amountSats: number
): Partial<NostrEvent> {
  return {
    kind: PAYMENT_RECEIPT_KIND,
    content: '',
    tags: [
      ['p', merchantPubkey],
      ['subject', `Payment for order ${orderId.slice(0, 8)}`],
      ['order', orderId],
      ['payment', paymentMethod, invoice, proof],
      ['amount', amountSats.toString()],
    ],
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Parse a payment request from Kind 16 Type 2 event
 */
export function parsePaymentRequest(event: NostrEvent): {
  orderId: string;
  amount: number;
  paymentOptions: Array<{
    type: 'lightning' | 'bitcoin' | 'fiat' | 'other';
    detail: string;
  }>;
  message?: string;
} | null {
  const typeTag = event.tags.find((t) => t[0] === 'type');
  if (typeTag?.[1] !== ORDER_MESSAGE_TYPE.PAYMENT_REQUEST) {
    return null;
  }

  const orderTag = event.tags.find((t) => t[0] === 'order');
  const amountTag = event.tags.find((t) => t[0] === 'amount');
  const paymentTags = event.tags.filter((t) => t[0] === 'payment');

  if (!orderTag || !amountTag) {
    return null;
  }

  return {
    orderId: orderTag[1],
    amount: parseInt(amountTag[1], 10),
    paymentOptions: paymentTags.map((t) => ({
      type: t[1] as 'lightning' | 'bitcoin' | 'fiat' | 'other',
      detail: t[2],
    })),
    message: event.content || undefined,
  };
}

/**
 * Parse an order status from Kind 16 Type 3 event
 */
export function parseOrderStatus(event: NostrEvent): {
  orderId: string;
  status: string;
  message?: string;
} | null {
  const typeTag = event.tags.find((t) => t[0] === 'type');
  if (typeTag?.[1] !== ORDER_MESSAGE_TYPE.STATUS_UPDATE) {
    return null;
  }

  const orderTag = event.tags.find((t) => t[0] === 'order');
  const statusTag = event.tags.find((t) => t[0] === 'status');

  if (!orderTag || !statusTag) {
    return null;
  }

  return {
    orderId: orderTag[1],
    status: statusTag[1],
    message: event.content || undefined,
  };
}
