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
export const DEFAULT_STORE_PATH =
  process.env.PROCESSED_STORE_PATH || join(__dirname, '..', 'data', '.processed.json');

export class ProcessedStore {
  /**
   * @param {string} [filePath] - Where to persist the JSON store.
   * @param {number} [maxAgeSeconds=0] - Prune entries older than this many
   *   seconds (0 = never prune). Should match the subscription lookback window.
   */
  constructor(filePath = DEFAULT_STORE_PATH, maxAgeSeconds = 0) {
    this.filePath = filePath;
    this.maxAgeSeconds = maxAgeSeconds;
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
      this.prune();
      console.log(
        `[Store] Loaded ${this.orders.size} order(s) and ${this.receipts.size} receipt(s) from ${this.filePath}`
      );
    } catch (error) {
      console.warn(`[Store] Failed to load processed store (${this.filePath}):`, error.message);
    }
  }

  /** Drop entries older than the lookback window. */
  prune() {
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
   */
  save() {
    const tmpPath = `${this.filePath}.tmp`;
    try {
      const data = {
        orders: Object.fromEntries(this.orders),
        receipts: Object.fromEntries(this.receipts),
      };
      // The data/ directory may not exist yet (fresh checkout, or an empty
      // just-created Docker volume) — create it before the first write.
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(tmpPath, JSON.stringify(data), 'utf-8');
      renameSync(tmpPath, this.filePath);
    } catch (error) {
      console.warn(`[Store] Failed to persist processed store (${this.filePath}):`, error.message);
      // Best-effort cleanup so a failed write doesn't leave a stray temp file.
      try {
        rmSync(tmpPath, { force: true });
      } catch {
        // ignore
      }
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
}
