/**
 * Bitcoin exchange rate service using multiple exchanges
 * Averages rates from CoinGecko, Kraken, and Coinbase
 * Caches rates for 5 minutes to avoid rate limiting
 */

interface ExchangeRates {
  btcToGbp: number;
  btcToUsd: number;
  btcToEur: number;
  updatedAt: number;
  sources: string[];
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const SATS_PER_BTC = 100_000_000;

let cachedRates: ExchangeRates | null = null;

/**
 * Calculate average from an array of numbers, filtering out invalid values
 */
function safeAverage(values: (number | null | undefined)[]): number | null {
  const validValues = values.filter(
    (v): v is number => typeof v === 'number' && !isNaN(v) && v > 0
  );
  if (validValues.length === 0) return null;
  return validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
}

/**
 * Fetch rates from CoinGecko
 */
async function fetchCoinGecko(): Promise<{
  gbp: number | null;
  usd: number | null;
  eur: number | null;
}> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=gbp,usd,eur',
      { signal: AbortSignal.timeout(5000) }
    );
    if (!response.ok) return { gbp: null, usd: null, eur: null };
    const data = await response.json();
    return {
      gbp: data.bitcoin?.gbp || null,
      usd: data.bitcoin?.usd || null,
      eur: data.bitcoin?.eur || null,
    };
  } catch {
    console.warn('[ExchangeRate] CoinGecko fetch failed');
    return { gbp: null, usd: null, eur: null };
  }
}

/**
 * Fetch rates from Kraken
 */
async function fetchKraken(): Promise<{
  gbp: number | null;
  usd: number | null;
  eur: number | null;
}> {
  try {
    const [usdRes, eurRes, gbpRes] = await Promise.all([
      fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSD', {
        signal: AbortSignal.timeout(5000),
      }),
      fetch('https://api.kraken.com/0/public/Ticker?pair=XBTEUR', {
        signal: AbortSignal.timeout(5000),
      }),
      fetch('https://api.kraken.com/0/public/Ticker?pair=XBTGBP', {
        signal: AbortSignal.timeout(5000),
      }),
    ]);

    const [usdData, eurData, gbpData] = await Promise.all([
      usdRes.ok ? usdRes.json() : null,
      eurRes.ok ? eurRes.json() : null,
      gbpRes.ok ? gbpRes.json() : null,
    ]);

    return {
      usd: usdData?.result?.XXBTZUSD?.c?.[0] ? parseFloat(usdData.result.XXBTZUSD.c[0]) : null,
      eur: eurData?.result?.XXBTZEUR?.c?.[0] ? parseFloat(eurData.result.XXBTZEUR.c[0]) : null,
      gbp: gbpData?.result?.XXBTZGBP?.c?.[0] ? parseFloat(gbpData.result.XXBTZGBP.c[0]) : null,
    };
  } catch {
    console.warn('[ExchangeRate] Kraken fetch failed');
    return { gbp: null, usd: null, eur: null };
  }
}

/**
 * Fetch rates from Coinbase
 */
async function fetchCoinbase(): Promise<{
  gbp: number | null;
  usd: number | null;
  eur: number | null;
}> {
  try {
    const [usdRes, eurRes, gbpRes] = await Promise.all([
      fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', {
        signal: AbortSignal.timeout(5000),
      }),
      fetch('https://api.coinbase.com/v2/prices/BTC-EUR/spot', {
        signal: AbortSignal.timeout(5000),
      }),
      fetch('https://api.coinbase.com/v2/prices/BTC-GBP/spot', {
        signal: AbortSignal.timeout(5000),
      }),
    ]);

    const [usdData, eurData, gbpData] = await Promise.all([
      usdRes.ok ? usdRes.json() : null,
      eurRes.ok ? eurRes.json() : null,
      gbpRes.ok ? gbpRes.json() : null,
    ]);

    return {
      usd: usdData?.data?.amount ? parseFloat(usdData.data.amount) : null,
      eur: eurData?.data?.amount ? parseFloat(eurData.data.amount) : null,
      gbp: gbpData?.data?.amount ? parseFloat(gbpData.data.amount) : null,
    };
  } catch {
    console.warn('[ExchangeRate] Coinbase fetch failed');
    return { gbp: null, usd: null, eur: null };
  }
}

/**
 * Fetch and average rates from multiple exchanges
 */
async function fetchRates(): Promise<ExchangeRates> {
  const [coingecko, kraken, coinbase] = await Promise.all([
    fetchCoinGecko(),
    fetchKraken(),
    fetchCoinbase(),
  ]);

  const sources: string[] = [];
  if (coingecko.gbp || coingecko.usd) sources.push('CoinGecko');
  if (kraken.gbp || kraken.usd) sources.push('Kraken');
  if (coinbase.gbp || coinbase.usd) sources.push('Coinbase');

  const avgGbp = safeAverage([coingecko.gbp, kraken.gbp, coinbase.gbp]);
  const avgUsd = safeAverage([coingecko.usd, kraken.usd, coinbase.usd]);
  const avgEur = safeAverage([coingecko.eur, kraken.eur, coinbase.eur]);

  if (!avgGbp && !avgUsd) {
    throw new Error('All exchange rate sources failed');
  }

  return {
    btcToGbp: avgGbp || (avgUsd ? avgUsd * 0.79 : 80000), // Fallback GBP from USD
    btcToUsd: avgUsd || (avgGbp ? avgGbp / 0.79 : 100000), // Fallback USD from GBP
    btcToEur: avgEur || (avgUsd ? avgUsd * 0.92 : 92000), // Fallback EUR from USD
    updatedAt: Date.now(),
    sources,
  };
}

/**
 * Get cached or fresh exchange rates
 */
export async function getExchangeRates(): Promise<ExchangeRates> {
  // Return cached if still valid
  if (cachedRates && Date.now() - cachedRates.updatedAt < CACHE_DURATION) {
    return cachedRates;
  }

  try {
    cachedRates = await fetchRates();
    return cachedRates;
  } catch (error) {
    // If fetch fails and we have stale cache, use it
    if (cachedRates) {
      console.warn('[ExchangeRate] Using stale cache due to fetch error:', error);
      return cachedRates;
    }
    throw error;
  }
}

/**
 * Convert fiat amount to satoshis using live rates
 */
export async function fiatToSats(amount: number, currency: string): Promise<number> {
  const rates = await getExchangeRates();

  let btcRate: number;
  switch (currency.toUpperCase()) {
    case 'GBP':
    case '£':
      btcRate = rates.btcToGbp;
      break;
    case 'USD':
    case '$':
      btcRate = rates.btcToUsd;
      break;
    case 'EUR':
    case '€':
      btcRate = rates.btcToEur;
      break;
    default:
      // Default to USD rate for unknown currencies
      btcRate = rates.btcToUsd;
  }

  // amount in fiat / BTC price = BTC amount
  // BTC amount * 100,000,000 = sats
  const btcAmount = amount / btcRate;
  return Math.round(btcAmount * SATS_PER_BTC);
}

/**
 * Convert satoshis to fiat using live rates
 */
export async function satsToFiat(sats: number, currency: string): Promise<number> {
  const rates = await getExchangeRates();

  let btcRate: number;
  switch (currency.toUpperCase()) {
    case 'GBP':
    case '£':
      btcRate = rates.btcToGbp;
      break;
    case 'USD':
    case '$':
      btcRate = rates.btcToUsd;
      break;
    case 'EUR':
    case '€':
      btcRate = rates.btcToEur;
      break;
    default:
      btcRate = rates.btcToUsd;
  }

  // sats / 100,000,000 = BTC amount
  // BTC amount * BTC price = fiat amount
  const btcAmount = sats / SATS_PER_BTC;
  return btcAmount * btcRate;
}

/**
 * Get sats per unit of fiat currency (e.g., sats per £1)
 */
export async function getSatsPerFiat(currency: string): Promise<number> {
  return fiatToSats(1, currency);
}
