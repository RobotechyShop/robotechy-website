/**
 * Lightning Address health monitor.
 *
 * Periodically probes the merchant's LNURL-pay endpoint
 * (`https://<domain>/.well-known/lnurlp/<name>`) so the order service can keep
 * running while the Lightning backend (e.g. LNbits) is down: orders are held
 * instead of invoiced, and the storefront is told payments are unavailable.
 *
 * Healthy = HTTP 200 + a JSON body with a `callback`. An empty, unset or
 * malformed address is simply "unhealthy" (no network call), so a deployment
 * without a Lightning Address starts cleanly in degraded mode.
 *
 * Only state CHANGES are logged, so a long outage doesn't flood the logs.
 *
 * This file is shared verbatim by robotechy-website, eden-weeks-art and
 * knowall-website — keep the copies identical.
 */

/**
 * The LNURL-pay discovery URL for a Lightning Address, or null if malformed.
 * @param {string | undefined | null} address
 * @returns {string | null}
 */
export function lnurlpUrl(address) {
  const trimmed = (address || '').trim();
  const parts = trimmed.split('@');
  if (parts.length !== 2) return null;
  const [name, domain] = parts;
  if (!/^[a-z0-9._+-]+$/i.test(name) || !/^[a-z0-9.-]+(:\d+)?$/i.test(domain)) return null;
  return `https://${domain}/.well-known/lnurlp/${name}`;
}

/**
 * Probe a Lightning Address once.
 * @param {string | undefined | null} address
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ healthy: boolean, reason?: string }>}
 */
export async function probeLightningAddress(address, { timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const url = lnurlpUrl(address);
  if (!url) {
    return {
      healthy: false,
      reason: address ? 'invalid Lightning Address' : 'no Lightning Address configured',
    };
  }
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    });
    if (response.status !== 200) return { healthy: false, reason: `HTTP ${response.status}` };
    const data = await response.json();
    if (!data || typeof data.callback !== 'string' || !data.callback) {
      return { healthy: false, reason: 'LNURL response has no callback' };
    }
    return { healthy: true };
  } catch (error) {
    return { healthy: false, reason: error?.message || String(error) };
  }
}

/**
 * Start probing a Lightning Address every `intervalMs`.
 *
 * The first probe runs immediately; `ready` resolves once it has finished.
 * `onChange(status)` fires whenever health flips — including the first probe,
 * since the starting state is "not yet checked".
 *
 * @param {string | undefined | null} lightningAddress
 * @param {{
 *   intervalMs?: number,
 *   timeoutMs?: number,
 *   onChange?: (status: { healthy: boolean, checkedAt: string | null, since: string | null }) => void,
 *   fetchImpl?: typeof fetch,
 *   logger?: Pick<Console, 'log' | 'warn'>,
 * }} [options]
 */
export function startHealthMonitor(
  lightningAddress,
  { intervalMs = 60000, timeoutMs = 8000, onChange, fetchImpl = fetch, logger = console } = {}
) {
  /** @type {{ healthy: boolean, checkedAt: string | null, since: string | null }} */
  let state = { healthy: false, checkedAt: null, since: null };
  let checked = false;
  let stopped = false;
  let timer = null;
  let inFlight = null;

  const status = () => ({ ...state });

  const runProbe = async () => {
    const result = await probeLightningAddress(lightningAddress, { timeoutMs, fetchImpl });
    const now = new Date().toISOString();
    const changed = !checked || result.healthy !== state.healthy;
    checked = true;
    state = {
      healthy: result.healthy,
      checkedAt: now,
      since: changed ? now : state.since,
    };
    if (changed) {
      if (result.healthy) {
        logger.log(`[LightningHealth] ✓ Lightning payments available (${lightningAddress})`);
      } else {
        logger.warn(
          `[LightningHealth] ✗ Lightning payments unavailable (${lightningAddress || 'unset'}): ${result.reason}`
        );
      }
      try {
        onChange?.(status());
      } catch (error) {
        logger.warn('[LightningHealth] onChange handler failed:', error?.message || error);
      }
    }
    return state.healthy;
  };

  /** Probe now (coalesces with a probe already in flight). Resolves to isHealthy(). */
  const checkNow = () => {
    if (!inFlight) {
      inFlight = runProbe().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(async () => {
      await checkNow();
      schedule();
    }, intervalMs);
    // Never keep the process alive just for health checks.
    timer.unref?.();
  };

  const ready = checkNow().then(() => {
    schedule();
  });

  return {
    /** Last probe result (false until the first probe has succeeded). */
    isHealthy: () => state.healthy,
    /** `{ healthy, checkedAt, since }` — ISO timestamps, null before the first probe. */
    status,
    checkNow,
    /** Resolves after the first probe. */
    ready,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
