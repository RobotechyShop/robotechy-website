// @vitest-environment node
// Run in the node environment: this test exercises noble-hashes crypto via
// nostr-tools, and jsdom's TextEncoder returns cross-realm Uint8Arrays that
// noble rejects ("expected Uint8Array, got object").
import { describe, it, expect } from 'vitest';
import { generateSecretKey, getPublicKey, nip59 } from 'nostr-tools';
import {
  createPaymentReceiptTemplate,
  createOrderTags,
  parseCommerceAmount,
  parsePaymentRequest,
  toGammaPaymentOptions,
  ORDER_PROCESS_KIND,
  PAYMENT_RECEIPT_KIND,
  ORDER_MESSAGE_TYPE,
} from './gammaOrderUtils';
import type { CartItem, ShippingInfo } from './cartTypes';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * These tests validate the Gamma commerce *rumor* shape — the inner kind (16/17)
 * and structured tags (including customer PII) — survives a wrap → unwrap
 * round-trip, and that the plaintext never leaks into the gift wrap envelope.
 *
 * NOTE on scope: the wrap/unwrap here use nostr-tools' `nip59` (which produces a
 * SIGNED seal — the same primitives the order-service backend uses), NOT the
 * storefront's hand-built NIP-17 envelope in `DMProvider` (which uses an
 * unsigned seal). So these assert the rumor schema and backend-compatible nip59
 * wrapping for the commerce kinds — not that the exact frontend envelope
 * implementation round-trips.
 */

// Minimal CartItem fixture for building an order rumor.
const buildCartItem = (): CartItem =>
  ({
    productId: 'widget-d-tag',
    quantity: 2,
    product: {
      event: { pubkey: 'a'.repeat(64) } as unknown as NostrEvent,
      price: { amount: '500', currency: 'SATS' },
    },
  }) as unknown as CartItem;

const buildShipping = (): ShippingInfo =>
  ({
    name: 'Test Buyer',
    address: '123 Robot Lane',
    city: 'Botville',
    state: 'CA',
    postalCode: '90210',
    country: 'US',
    email: 'buyer@example.com',
    phone: '+15551234567',
    shippingZone: 'domestic',
    message: 'Leave at door',
  }) as unknown as ShippingInfo;

describe('NIP-17 commerce gift wraps', () => {
  it('round-trips an inner kind 16 order rumor with PII tags', () => {
    const buyerSk = generateSecretKey();
    const buyerPk = getPublicKey(buyerSk);
    const merchantSk = generateSecretKey();
    const merchantPk = getPublicKey(merchantSk);

    const orderId = 'order-12345678-abcd';
    const tags = createOrderTags(orderId, [buildCartItem()], buildShipping(), merchantPk, 1000);

    const orderRumor = {
      kind: ORDER_PROCESS_KIND, // 16
      content: 'Leave at door',
      tags,
    };

    // Buyer gift-wraps the order to the merchant.
    const giftWrap = nip59.wrapEvent(orderRumor, buyerSk, merchantPk);

    // The wrap is a kind 1059 with only a single ['p', merchant] tag - no PII.
    expect(giftWrap.kind).toBe(1059);
    expect(giftWrap.tags).toEqual([['p', merchantPk]]);
    expect(giftWrap.content).not.toContain('buyer@example.com');
    expect(giftWrap.content).not.toContain('Robot Lane');

    // Merchant unwraps and recovers the inner rumor (with PII intact).
    const inner = nip59.unwrapEvent(giftWrap, merchantSk) as NostrEvent;
    expect(inner.kind).toBe(ORDER_PROCESS_KIND);
    expect(inner.pubkey).toBe(buyerPk); // real sender, authenticated by seal
    expect(inner.tags).toContainEqual(['order', orderId]);
    expect(inner.tags).toContainEqual(['type', ORDER_MESSAGE_TYPE.ORDER_CREATION]);
    expect(inner.tags).toContainEqual(['email', 'buyer@example.com']);
    expect(inner.tags).toContainEqual(['phone', '+15551234567']);
    expect(inner.tags.find((t) => t[0] === 'address')?.[1]).toContain('123 Robot Lane');
  });

  it('round-trips an inner kind 16 type 2 payment request and parses it', () => {
    const merchantSk = generateSecretKey();
    const buyerSk = generateSecretKey();
    const buyerPk = getPublicKey(buyerSk);

    const orderId = 'order-abcdef01-2345';
    const invoice = 'lnbc1000n1pinvoicestub';

    // Mirror the backend's createPaymentRequestEvent rumor shape.
    const paymentRequestRumor = {
      kind: ORDER_PROCESS_KIND, // 16
      content: 'Please pay this invoice to complete your order',
      tags: [
        ['p', buyerPk],
        ['type', ORDER_MESSAGE_TYPE.PAYMENT_REQUEST],
        ['order', orderId],
        ['amount', '1000'],
        ['payment', 'lightning', invoice],
      ],
    };

    const giftWrap = nip59.wrapEvent(paymentRequestRumor, merchantSk, buyerPk);
    const inner = nip59.unwrapEvent(giftWrap, buyerSk) as NostrEvent;

    expect(inner.kind).toBe(ORDER_PROCESS_KIND);

    const parsed = parsePaymentRequest(inner);
    expect(parsed).not.toBeNull();
    expect(parsed?.orderId).toBe(orderId);
    expect(parsed?.amount).toBe(1000);
    expect(parsed?.paymentOptions).toEqual([{ type: 'lightning', detail: invoice }]);
  });

  it('maps only lightning payment options to ln and drops untrusted ones', () => {
    // A crafted/untrusted payment request mixing a real lightning invoice with
    // a bitcoin on-chain address and other unsupported types. Only the
    // lightning option must survive, mapped to 'ln'; the rest are dropped so
    // they can never be routed through the Lightning payment UI.
    const mapped = toGammaPaymentOptions([
      { type: 'bitcoin', detail: 'bc1qonchainaddressxxxxxxxxxxxxxxxxxxxx' },
      { type: 'lightning', detail: 'lnbc1000n1pinvoicestub' },
      { type: 'fiat', detail: 'https://pay.example/fiat' },
      { type: 'other', detail: 'anything' },
    ]);

    expect(mapped).toEqual([{ type: 'ln', link: 'lnbc1000n1pinvoicestub' }]);
  });

  it('round-trips an inner kind 17 payment receipt template', () => {
    const buyerSk = generateSecretKey();
    const merchantSk = generateSecretKey();
    const merchantPk = getPublicKey(merchantSk);

    const template = createPaymentReceiptTemplate(
      'order-99887766-5544',
      merchantPk,
      'lightning',
      'lnbc500n1pstub',
      'preimage-proof-hex',
      500
    );

    const receiptRumor = {
      kind: template.kind!,
      content: template.content!,
      tags: template.tags!,
    };

    const giftWrap = nip59.wrapEvent(receiptRumor, buyerSk, merchantPk);
    const inner = nip59.unwrapEvent(giftWrap, merchantSk) as NostrEvent;

    expect(inner.kind).toBe(PAYMENT_RECEIPT_KIND);
    expect(inner.tags).toContainEqual(['order', 'order-99887766-5544']);
    expect(inner.tags).toContainEqual([
      'payment',
      'lightning',
      'lnbc500n1pstub',
      'preimage-proof-hex',
    ]);
    expect(inner.tags).toContainEqual(['amount', '500']);
  });
});

describe('payment receipt amount survives a cleared cart', () => {
  // Regression for the "0 sats" receipt bug: submitPaymentReceipt used to
  // recompute the amount from the cart, but the cart is cleared the moment the
  // order is placed - so the receipt (kind 17 amount tag) and the readable
  // kind 14 summary both reported 0 sats. The fix persists the order total in
  // checkoutState.totalSats at order-creation time and resolves the receipt
  // amount from it, recomputing only as a fallback.
  //
  // This mirrors the hook's exact resolution expression:
  //   const totalSats = checkoutState.totalSats ?? convertToSats(totalPrice, currency);
  // with the cart already cleared (convertToSats(0, ...) === 0).
  const resolveReceiptSats = (persistedTotalSats: number | undefined, clearedCartSats: number) =>
    persistedTotalSats ?? clearedCartSats;

  it('uses the persisted order total for the kind 17 receipt and kind 14 summary', () => {
    const orderId = 'order-aabbccdd-0011';
    const persistedTotalSats = 21; // captured at order creation
    const clearedCartSats = 0; // convertToSats(totalPrice=0, currency) after clearCart()

    const totalSats = resolveReceiptSats(persistedTotalSats, clearedCartSats);
    expect(totalSats).toBe(21);

    // Kind 17 receipt template carries the real amount, not 0.
    const template = createPaymentReceiptTemplate(
      orderId,
      'b'.repeat(64),
      'lightning',
      'lnbc210n1pstub',
      'preimage-proof-hex',
      totalSats
    );
    expect(template.tags).toContainEqual(['amount', '21']);
    expect(template.tags).not.toContainEqual(['amount', '0']);
    expect(parseCommerceAmount(template.tags?.find((t) => t[0] === 'amount')?.[1])).toBe(21);

    // Readable kind 14 summary reports the real amount, not "0 sats".
    const receiptSummary = `🧾 Payment sent for order #${orderId.slice(0, 8)} — ${totalSats.toLocaleString()} sats (Lightning).`;
    expect(receiptSummary).toContain('21 sats');
    expect(receiptSummary).not.toContain('0 sats');
  });

  it('falls back to the recomputed cart amount only when no total was persisted', () => {
    // If totalSats was never captured, the recompute is still used (defensive).
    expect(resolveReceiptSats(undefined, 1234)).toBe(1234);
    // A persisted 0 is still honoured over the fallback (?? only guards nullish).
    expect(resolveReceiptSats(0, 1234)).toBe(0);
  });
});

describe('parseCommerceAmount (untrusted amount tag guard)', () => {
  // The CommerceCard renders `{amount.toLocaleString()} sats` only when this
  // returns a number - guarding against "NaN sats" from untrusted tag input.
  it('parses a valid numeric amount', () => {
    expect(parseCommerceAmount('1000')).toBe(1000);
    expect(parseCommerceAmount('0')).toBe(0);
    expect(parseCommerceAmount('1500.5')).toBe(1500.5);
  });

  it('returns undefined (never NaN) for missing/empty/non-numeric amounts', () => {
    for (const bad of [undefined, '', '   ', 'abc', 'NaN', '1000sats', '12px']) {
      const result = parseCommerceAmount(bad as string | undefined);
      expect(result).toBeUndefined();
      // The whole point: callers never end up formatting NaN.
      expect(Number.isNaN(result as unknown as number)).toBe(false);
    }
  });

  it('returns undefined for negative amounts', () => {
    expect(parseCommerceAmount('-1')).toBeUndefined();
    expect(parseCommerceAmount('-1000')).toBeUndefined();
  });
});
