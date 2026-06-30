/**
 * Tests for payment-receipt parsing and the STABLE dedup key used by
 * handlePaymentReceipt. Uses Node's built-in test runner (no extra deps):
 *   node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePaymentReceipt,
  receiptDedupKey,
  PAYMENT_RECEIPT_KIND,
} from '../lib/orderParser.js';

const now = () => Math.floor(Date.now() / 1000);

/**
 * Build an UNSIGNED Kind 17 inner rumor (as delivered after gift-wrap unwrap).
 * Crucially it has no `id` - that is the whole point of the dedup-key bug.
 */
function buildReceiptRumor({ orderId, preimage, buyerPk = 'b'.repeat(64) }) {
  return {
    kind: PAYMENT_RECEIPT_KIND,
    pubkey: buyerPk,
    created_at: now(),
    content: '',
    tags: [
      ['p', 'm'.repeat(64)],
      ['order', orderId],
      ['payment', 'lightning', 'lnbc1...', preimage],
      ['amount', '1000'],
    ],
  };
}

test('inner receipt rumor is unsigned (no id) - why event.id dedup breaks', () => {
  const rumor = buildReceiptRumor({ orderId: 'order-1', preimage: 'preimage-1' });
  assert.equal(rumor.id, undefined, 'unsigned rumor has no id; event.id key would be undefined');
});

test('receiptDedupKey is stable for the same payment (true duplicates collapse)', () => {
  const a = parsePaymentReceipt(buildReceiptRumor({ orderId: 'order-1', preimage: 'pre-1' }));
  const b = parsePaymentReceipt(buildReceiptRumor({ orderId: 'order-1', preimage: 'pre-1' }));
  assert.equal(receiptDedupKey(a), receiptDedupKey(b), 'same order+preimage -> same key');
});

test('receiptDedupKey differs for distinct receipts (legit receipts not skipped)', () => {
  const r1 = parsePaymentReceipt(buildReceiptRumor({ orderId: 'order-1', preimage: 'pre-1' }));
  const r2 = parsePaymentReceipt(buildReceiptRumor({ orderId: 'order-2', preimage: 'pre-2' }));
  const r3 = parsePaymentReceipt(buildReceiptRumor({ orderId: 'order-1', preimage: 'pre-3' }));

  const keys = new Set([receiptDedupKey(r1), receiptDedupKey(r2), receiptDedupKey(r3)]);
  assert.equal(keys.size, 3, 'distinct order or preimage must produce distinct keys');
});
