import { useState, useEffect, useCallback } from 'react';
import { getExchangeRates } from '@/lib/exchangeRate';

interface UseExchangeRateReturn {
  satsPerGbp: number | null;
  satsPerUsd: number | null;
  isLoading: boolean;
  error: string | null;
  convertToSats: (amount: number, currency: string) => number;
  convertToFiat: (sats: number, currency: string) => number;
  refresh: () => Promise<void>;
}

const SATS_PER_BTC = 100_000_000;

// Fallback rates if API fails (approximate)
const FALLBACK_BTC_GBP = 80000;
const FALLBACK_BTC_USD = 100000;

export function useExchangeRate(): UseExchangeRateReturn {
  const [satsPerGbp, setSatsPerGbp] = useState<number | null>(null);
  const [satsPerUsd, setSatsPerUsd] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const rates = await getExchangeRates();
      // sats per £1 = 100,000,000 / BTC price in GBP
      setSatsPerGbp(Math.round(SATS_PER_BTC / rates.btcToGbp));
      setSatsPerUsd(Math.round(SATS_PER_BTC / rates.btcToUsd));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch rates';
      setError(message);
      // Use fallback rates
      setSatsPerGbp(Math.round(SATS_PER_BTC / FALLBACK_BTC_GBP));
      setSatsPerUsd(Math.round(SATS_PER_BTC / FALLBACK_BTC_USD));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  const convertToSats = useCallback(
    (amount: number, currency: string): number => {
      const upper = currency.toUpperCase();

      if (upper === 'SAT' || upper === 'SATS') {
        return Math.round(amount);
      }

      if (upper === 'BTC') {
        return Math.round(amount * SATS_PER_BTC);
      }

      // Use live rate if available, otherwise fallback
      if (upper === 'GBP' || upper === '£') {
        const rate = satsPerGbp || Math.round(SATS_PER_BTC / FALLBACK_BTC_GBP);
        return Math.round(amount * rate);
      }

      // Default to USD
      const rate = satsPerUsd || Math.round(SATS_PER_BTC / FALLBACK_BTC_USD);
      return Math.round(amount * rate);
    },
    [satsPerGbp, satsPerUsd]
  );

  const convertToFiat = useCallback(
    (sats: number, currency: string): number => {
      const upper = currency.toUpperCase();

      if (upper === 'GBP' || upper === '£') {
        const rate = satsPerGbp || Math.round(SATS_PER_BTC / FALLBACK_BTC_GBP);
        return sats / rate;
      }

      // Default to USD
      const rate = satsPerUsd || Math.round(SATS_PER_BTC / FALLBACK_BTC_USD);
      return sats / rate;
    },
    [satsPerGbp, satsPerUsd]
  );

  return {
    satsPerGbp,
    satsPerUsd,
    isLoading,
    error,
    convertToSats,
    convertToFiat,
    refresh: fetchRates,
  };
}
