/**
 * BTC exchange rates for server-side order pricing — a port of the website's
 * src/lib/exchangeRate.ts + src/hooks/useExchangeRate.ts, so the service
 * converts fiat prices with the SAME source the buyer's checkout used: the
 * average of CoinGecko, Kraken and Coinbase (any subset that responds), cached
 * for 5 minutes, turned into integer sats-per-unit with Math.round(1e8 / price).
 *
 * Deliberate difference from the website: NO hard-coded fallback prices and no
 * cross-rate guesses. A guess is fine for a browser estimate but not for an
 * invoice, so a currency nobody quoted stays null (pricing then throws) and the
 * order is retried or cancelled instead of being invoiced at a made-up rate.
 */

import { SATS_PER_BTC } from './pricing.js';

const CACHE_DURATION_MS = 5 * 60 * 1000;
const SOURCE_TIMEOUT_MS = 5000;
// When every source is down, a cached rate up to this old may still be used.
const MAX_STALE_MS = 60 * 60 * 1000;

const NO_RATES = { gbp: null, usd: null, eur: null };

let cached = null;

function safeAverage(values) {
  const valid = values.filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

async function getJson(fetchImpl, url) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
  return response.ok ? response.json() : null;
}

async function fetchCoinGecko(fetchImpl) {
  try {
    const data = await getJson(
      fetchImpl,
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=gbp,usd,eur'
    );
    return {
      gbp: data?.bitcoin?.gbp || null,
      usd: data?.bitcoin?.usd || null,
      eur: data?.bitcoin?.eur || null,
    };
  } catch {
    return NO_RATES;
  }
}

async function fetchKraken(fetchImpl) {
  try {
    const [gbp, usd, eur] = await Promise.all(
      ['XBTGBP', 'XBTUSD', 'XBTEUR'].map((pair) =>
        getJson(fetchImpl, `https://api.kraken.com/0/public/Ticker?pair=${pair}`)
      )
    );
    const last = (data, key) => {
      const c = data?.result?.[key]?.c?.[0];
      return c ? parseFloat(c) : null;
    };
    return { gbp: last(gbp, 'XXBTZGBP'), usd: last(usd, 'XXBTZUSD'), eur: last(eur, 'XXBTZEUR') };
  } catch {
    return NO_RATES;
  }
}

async function fetchCoinbase(fetchImpl) {
  try {
    const [gbp, usd, eur] = await Promise.all(
      ['GBP', 'USD', 'EUR'].map(async (currency) => {
        const data = await getJson(
          fetchImpl,
          `https://api.coinbase.com/v2/prices/BTC-${currency}/spot`
        );
        return data?.data?.amount ? parseFloat(data.data.amount) : null;
      })
    );
    return { gbp, usd, eur };
  } catch {
    return NO_RATES;
  }
}

const toSatsPer = (btcPrice) => (btcPrice ? Math.round(SATS_PER_BTC / btcPrice) : null);

/**
 * @param {{ fetch?: typeof fetch, now?: () => number }} [deps]
 * @returns {Promise<{ satsPerGbp: number | null, satsPerUsd: number | null, satsPerEur: number | null }>}
 * @throws when every source failed and nothing is cached
 */
export async function getSatsRates({ fetch: fetchImpl = fetch, now = Date.now } = {}) {
  if (cached && now() - cached.updatedAt < CACHE_DURATION_MS) return cached.rates;

  const [coingecko, kraken, coinbase] = await Promise.all([
    fetchCoinGecko(fetchImpl),
    fetchKraken(fetchImpl),
    fetchCoinbase(fetchImpl),
  ]);
  const gbp = safeAverage([coingecko.gbp, kraken.gbp, coinbase.gbp]);
  const usd = safeAverage([coingecko.usd, kraken.usd, coinbase.usd]);
  const eur = safeAverage([coingecko.eur, kraken.eur, coinbase.eur]);

  if (!gbp && !usd && !eur) {
    if (cached && now() - cached.updatedAt < MAX_STALE_MS) return cached.rates; // recent real rate beats none
    throw new Error('All exchange rate sources failed');
  }

  const rates = {
    satsPerGbp: toSatsPer(gbp),
    satsPerUsd: toSatsPer(usd),
    satsPerEur: toSatsPer(eur),
  };
  cached = { rates, updatedAt: now() };
  return rates;
}

/** Test hook: forget the cached rates. */
export function resetRateCache() {
  cached = null;
}
