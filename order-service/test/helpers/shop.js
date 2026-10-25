/**
 * Test fixtures: a merchant key with a SIGNED catalog (kind 30402 listings and
 * kind 30406 shipping options), order rumors against it, and real
 * preimage/payment-hash pairs.
 */

import { createHash, randomBytes } from 'node:crypto';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { buildVerifiedCatalog } from '../../lib/pricing.js';

export const merchantSk = generateSecretKey();
export const merchantPk = getPublicKey(merchantSk);

/** Fixed test rates: 1 GBP = 1,250 sats, 1 USD = 1,000 sats, 1 EUR = 1,100 sats. */
export const RATES = { satsPerGbp: 1250, satsPerUsd: 1000, satsPerEur: 1100 };

let clock = 1_700_000_000;

/** A signed kind-30402 listing. */
export function listing(d, price, { sk = merchantSk, shipping = [], createdAt } = {}) {
  return finalizeEvent(
    {
      kind: 30402,
      created_at: createdAt ?? (clock += 1),
      content: '',
      tags: [
        ['d', d],
        ['title', `Product ${d}`],
        ['price', ...price],
        ...shipping.map((s) => ['shipping_option', ...s]),
      ],
    },
    sk
  );
}

/** A signed kind-30406 shipping option. */
export function shippingOption(d, price, { sk = merchantSk, countries = [] } = {}) {
  return finalizeEvent(
    {
      kind: 30406,
      created_at: (clock += 1),
      content: '',
      tags: [
        ['d', d],
        ['title', `Ship ${d}`],
        ['price', ...price],
        ...(countries.length ? [['country', ...countries]] : []),
      ],
    },
    sk
  );
}

export const UK = `30406:${merchantPk}:ship-uk`;
export const WORLD = `30406:${merchantPk}:ship-world`;

/** The live shop's shape: GBP products referencing a UK and a worldwide option. */
export function shopEvents() {
  return [
    listing('medallion', ['60.00', 'GBP'], { shipping: [[UK], [WORLD]] }),
    listing('badge', ['4.50', 'GBP'], { shipping: [[UK], [WORLD, '2.00']] }),
    listing('sats-sticker', ['2100', 'SATS'], { shipping: [[UK]] }),
    shippingOption('ship-uk', ['5.00', 'GBP'], { countries: ['GB'] }),
    shippingOption('ship-world', ['15.00', 'GBP'], { countries: ['US', 'FR', 'DE'] }),
  ];
}

export function shopCatalog(events = shopEvents()) {
  return buildVerifiedCatalog(events, merchantPk);
}

export const ref = (d, pk = merchantPk) => `30402:${pk}:${d}`;

/** A Kind 16 Type 1 order rumor, as unwrapGiftWrap hands it to handleOrder. */
export function orderRumor({
  buyerPubkey = getPublicKey(generateSecretKey()),
  amount,
  items = [[ref('medallion'), '1']],
  shipping = UK,
  country = 'GB',
  address = '123 Maker St, London, SW1A 1AA, United Kingdom',
  orderId = randomBytes(16).toString('hex'),
} = {}) {
  return {
    kind: 16,
    pubkey: buyerPubkey,
    content: 'Please send my robot parts',
    tags: [
      ['type', '1'],
      ['order', orderId],
      ['amount', String(amount)],
      ...items.map(([r, q]) => ['item', r, q]),
      ...(shipping ? [['shipping', shipping]] : []),
      ...(country ? [['country', country]] : []),
      ['address', address],
      ['email', 'buyer@example.com'],
    ],
    created_at: Math.floor(Date.now() / 1000),
  };
}

/** A real preimage and its payment hash. */
export function preimagePair() {
  const preimage = randomBytes(32).toString('hex');
  const paymentHash = createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
  return { preimage, paymentHash };
}

/** In-memory store with ProcessedStore's interface. */
export function memoryStore() {
  const orders = new Set();
  const receipts = new Set();
  const invoices = new Map();
  return {
    invoices,
    hasOrder: (id) => orders.has(id),
    addOrder: (id) => orders.add(id),
    hasReceipt: (id) => receipts.has(id),
    addReceipt: (id) => receipts.add(id),
    getInvoice: (id) => invoices.get(id),
    addInvoice: (id, record) => {
      if (invoices.has(id)) throw new Error('already invoiced');
      invoices.set(id, { ...record, createdAt: 1 });
    },
    markPaid: (id) => invoices.set(id, { ...invoices.get(id), paidAt: 2 }),
  };
}

/** Fake NostrClient recording every gift wrap. */
export function fakeNostrClient() {
  const giftWraps = [];
  const dms = [];
  return {
    pubkey: merchantPk,
    giftWraps,
    dms,
    async sendGiftWrap(recipientPubkey, rumor) {
      giftWraps.push({ recipientPubkey, rumor });
    },
    async sendDM(recipientPubkey, content) {
      dms.push({ recipientPubkey, content });
    },
  };
}

export const tagValue = (rumor, name) => rumor.tags.find((t) => t[0] === name)?.[1];
