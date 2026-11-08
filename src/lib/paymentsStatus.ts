/**
 * payments-status.json — whether Lightning payments are currently available.
 * Written next to the site by the order service (order-service/lib/
 * paymentsStatus.js) whenever its Lightning health check changes:
 *
 *   { "lightning": "ok" | "unavailable", "checkedAt": "<ISO timestamp>" }
 *
 * Checkout only blocks buying on an explicit "unavailable". A missing,
 * unreadable or malformed file means "unknown", which never blocks buying.
 */

export const PAYMENTS_STATUS_URL = `${import.meta.env.BASE_URL ?? '/'}payments-status.json`;
const STATUS_FETCH_TIMEOUT_MS = 5000;

/** How often an open checkout re-checks the status. */
export const PAYMENTS_STATUS_POLL_MS = 60_000;

export type LightningAvailability = 'ok' | 'unavailable' | 'unknown';

export function parsePaymentsStatus(raw: unknown): LightningAvailability {
  const lightning = (raw as { lightning?: unknown } | null)?.lightning;
  return lightning === 'ok' || lightning === 'unavailable' ? lightning : 'unknown';
}

/** Fetch the status. Never throws: any failure means "unknown". */
export async function fetchPaymentsStatus({
  fetchImpl = fetch,
  url = PAYMENTS_STATUS_URL,
}: { fetchImpl?: typeof fetch; url?: string } = {}): Promise<LightningAvailability> {
  try {
    const res = await fetchImpl(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(STATUS_FETCH_TIMEOUT_MS),
    });
    // The SPA fallback answers unknown paths with index.html — not a status.
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return 'unknown';
    return parsePaymentsStatus(await res.json());
  } catch {
    return 'unknown';
  }
}
