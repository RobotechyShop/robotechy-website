/**
 * Persistent dedup store for processed orders and payment receipts.
 *
 * The service starts with `since: now - 2 days` (NIP-59 randomizes gift-wrap
 * `created_at` up to 2 days in the past), so on every restart it re-fetches up
 * to 2 days of historical gift wraps. With in-memory-only tracking that means
 * already-processed orders would be re-processed after a restart, firing
 * duplicate invoices. This store persists the processed IDs to a small JSON file
 * on disk (gitignored, next to the service) and loads them on startup, so a
 * previously processed order/receipt is never processed twice.
 *
 * Entries are pruned to the lookback window: anything older than `maxAgeSeconds`
 * can no longer be re-fetched by the `since` filter, so it is safe to drop and
 * keeps the file bounded.
 */

import { readFileSync, writeFileSync, existsSync, renameSync, rmSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Default location: order-service/data/.processed.json (gitignored). The store
// lives in a dedicated data/ directory — not next to the code — so a Docker
// deployment can mount a volume at that directory and the dedup state survives
// container REBUILDS, not just restarts. (Without the volume, every rebuild
// wiped the store and re-invoiced up to 2 days of orders — buyers received
// duplicate payment-request DMs after each deploy.) Override with
// PROCESSED_STORE_PATH for non-default layouts.
/**
 * Issued invoices are kept longer than the dedup entries: a buyer may pay (and
 * send the receipt) well after the order arrived, and the record is what the
 * receipt is checked against.
 */
export const INVOICE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Keep only well-formed invoice records from the persisted JSON. The receipt
 * check trusts these fields, so anything malformed is dropped, not repaired.
 */
function validInvoiceEntries(source) {
  return new Map(
    Object.entries(source || {}).filter(
      ([, r]) =>
        r &&
        typeof r === 'object' &&
        typeof r.invoice === 'string' &&
        typeof r.paymentHash === 'string' &&
        /^[0-9a-f]{64}$/.test(r.paymentHash) &&
        Number.isSafeInteger(r.amountSats) &&
        r.amountSats > 0 &&
        typeof r.buyerPubkey === 'string' &&
        Number.isFinite(r.createdAt) &&
        (r.verifyUrl === undefined || typeof r.verifyUrl === 'string') &&
        (r.paidAt === undefined || Number.isFinite(r.paidAt))
    )
  );
}

export const DEFAULT_STORE_PATH =
  process.env.PROCESSED_STORE_PATH || join(__dirname, '..', 'data', '.processed.json');

export class ProcessedStore {
  /**
   * @param {string} [filePath] - Where to persist the JSON store.
   * @param {number} [maxAgeSeconds=0] - Prune entries older than this many
   *   seconds (0 = never prune). Should match the subscription lookback window.
   * @param {number} [invoiceMaxAgeSeconds] - Prune issued-invoice records older
   *   than this (0 = never).
   */
  constructor(
    filePath = DEFAULT_STORE_PATH,
    maxAgeSeconds = 0,
    invoiceMaxAgeSeconds = INVOICE_MAX_AGE_SECONDS
  ) {
    this.filePath = filePath;
    this.maxAgeSeconds = maxAgeSeconds;
    this.invoiceMaxAgeSeconds = invoiceMaxAgeSeconds;
    /**
     * orderId -> the invoice issued for it:
     * { invoice, paymentHash, amountSats, buyerPubkey, verifyUrl?, createdAt, paidAt? }
     * @type {Map<string, object>}
     */
    this.invoices = new Map();
    /** @type {Map<string, number>} id -> processedAt (unix seconds) */
    this.orders = new Map();
    /** @type {Map<string, number>} id -> processedAt (unix seconds) */
    this.receipts = new Map();
    this.load();
  }

  /** Load persisted IDs from disk and prune stale entries. */
  load() {
    try {
      if (!existsSync(this.filePath)) {
        return;
      }
      const raw = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      this.orders = new Map(Object.entries(raw.orders || {}).map(([id, ts]) => [id, Number(ts)]));
      this.receipts = new Map(
        Object.entries(raw.receipts || {}).map(([id, ts]) => [id, Number(ts)])
      );
      this.invoices = validInvoiceEntries(raw.invoices);
      const rawInvoices = Object.keys(raw.invoices || {}).length;
      if (rawInvoices > this.invoices.size) {
        console.warn(
          `[Store] Dropped ${rawInvoices - this.invoices.size} malformed invoice record(s) from ${this.filePath}`
        );
      }
      this.prune();
      console.log(
        `[Store] Loaded ${this.orders.size} order(s), ${this.receipts.size} receipt(s) and ${this.invoices.size} invoice(s) from ${this.filePath}`
      );
    } catch (error) {
      console.warn(`[Store] Failed to load processed store (${this.filePath}):`, error.message);
    }
  }

  /** Drop entries older than the lookback window. */
  prune() {
    if (this.invoiceMaxAgeSeconds) {
      const invoiceCutoff = Math.floor(Date.now() / 1000) - this.invoiceMaxAgeSeconds;
      for (const [id, record] of this.invoices) {
        if (record.createdAt < invoiceCutoff) this.invoices.delete(id);
      }
    }
    if (!this.maxAgeSeconds) {
      return;
    }
    const cutoff = Math.floor(Date.now() / 1000) - this.maxAgeSeconds;
    for (const [id, ts] of this.orders) {
      if (ts < cutoff) this.orders.delete(id);
    }
    for (const [id, ts] of this.receipts) {
      if (ts < cutoff) this.receipts.delete(id);
    }
  }

  /**
   * Persist the current state to disk. Writes to a sibling temp file then renames
   * it into place — rename is atomic on the same filesystem, so a crash mid-write
   * can't leave a truncated `.processed.json` (which would fail to parse on the
   * next `load()` and cause up to a lookback-window of gift wraps to be
   * re-processed, firing duplicate invoices/status updates). The store is small,
   * so a whole-file rewrite each time is fine.
   *
   * @returns {boolean} whether the write succeeded (failures are logged)
   */
  save() {
    const tmpPath = `${this.filePath}.tmp`;
    try {
      const data = {
        orders: Object.fromEntries(this.orders),
        receipts: Object.fromEntries(this.receipts),
        invoices: Object.fromEntries(this.invoices),
      };
      // The data/ directory may not exist yet (fresh checkout, or an empty
      // just-created Docker volume) — create it before the first write.
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(tmpPath, JSON.stringify(data), 'utf-8');
      renameSync(tmpPath, this.filePath);
      return true;
    } catch (error) {
      console.warn(`[Store] Failed to persist processed store (${this.filePath}):`, error.message);
      // Best-effort cleanup so a failed write doesn't leave a stray temp file.
      try {
        rmSync(tmpPath, { force: true });
      } catch {
        // ignore
      }
      return false;
    }
  }

  hasOrder(orderId) {
    return this.orders.has(orderId);
  }

  addOrder(orderId) {
    this.orders.set(orderId, Math.floor(Date.now() / 1000));
    this.prune();
    this.save();
  }

  hasReceipt(receiptId) {
    return this.receipts.has(receiptId);
  }

  addReceipt(receiptId) {
    this.receipts.set(receiptId, Math.floor(Date.now() / 1000));
    this.prune();
    this.save();
  }

  /** The invoice issued for an order, or undefined. */
  getInvoice(orderId) {
    return this.invoices.get(orderId);
  }

  /**
   * Record the invoice issued for an order. Called BEFORE the invoice is sent
   * to the buyer, so a receipt can always be checked against it.
   * @throws when the order already has an invoice record (an order id is never
   *   re-invoiced, even after its dedup entry expires) or the record can't be
   *   persisted; either way the caller must not send the invoice
   */
  addInvoice(orderId, { invoice, paymentHash, amountSats, buyerPubkey, verifyUrl }) {
    if (this.invoices.has(orderId)) {
      throw new Error(`Order ${orderId.slice(0, 8)} already has an invoice`);
    }
    this.invoices.set(orderId, {
      invoice,
      paymentHash,
      amountSats,
      buyerPubkey,
      ...(verifyUrl ? { verifyUrl } : {}),
      createdAt: Math.floor(Date.now() / 1000),
    });
    this.prune();
    if (!this.save()) {
      this.invoices.delete(orderId);
      throw new Error(`Could not persist the invoice record for order ${orderId.slice(0, 8)}`);
    }
  }

  /** Mark an order's invoice as paid (confirmed), so later receipts are no-ops. */
  markPaid(orderId) {
    const record = this.invoices.get(orderId);
    if (!record) return;
    this.invoices.set(orderId, { ...record, paidAt: Math.floor(Date.now() / 1000) });
    this.save();
  }
}
