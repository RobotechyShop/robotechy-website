/**
 * payments-status.json — tells the storefront whether Lightning payments are
 * currently available, so checkout can say so instead of waiting forever for an
 * invoice. Written next to the static site (served by `serve` from dist/),
 * like catalog-snapshot.json.
 *
 *   { "lightning": "ok" | "unavailable", "checkedAt": "<ISO timestamp>" }
 */

import { writeFileSync, renameSync, rmSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// order-service/lib -> <app>/dist (/app/dist in the container, ./dist locally).
export const DEFAULT_PAYMENTS_STATUS_PATH =
  process.env.PAYMENTS_STATUS_PATH || join(__dirname, '..', '..', 'dist', 'payments-status.json');

/**
 * Atomically write the status file (temp file + rename, so the site never
 * serves a half-written file).
 * @param {{ healthy: boolean, checkedAt: string | null }} status
 * @param {string} [filePath]
 * @returns {boolean} whether the write succeeded (failures are logged, never thrown)
 */
export function writePaymentsStatus(status, filePath = DEFAULT_PAYMENTS_STATUS_PATH) {
  const tmpPath = `${filePath}.tmp`;
  try {
    if (!existsSync(dirname(filePath))) {
      console.warn(`[PaymentsStatus] ${dirname(filePath)} does not exist - not writing status`);
      return false;
    }
    const body = {
      lightning: status.healthy ? 'ok' : 'unavailable',
      checkedAt: status.checkedAt || new Date().toISOString(),
    };
    writeFileSync(tmpPath, `${JSON.stringify(body)}\n`, 'utf-8');
    renameSync(tmpPath, filePath);
    return true;
  } catch (error) {
    console.warn(`[PaymentsStatus] Failed to write ${filePath}:`, error.message);
    try {
      rmSync(tmpPath, { force: true });
    } catch {
      // ignore
    }
    return false;
  }
}
