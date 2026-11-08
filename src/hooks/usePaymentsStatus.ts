import { useQuery } from '@tanstack/react-query';

import {
  fetchPaymentsStatus,
  PAYMENTS_STATUS_POLL_MS,
  type LightningAvailability,
} from '@/lib/paymentsStatus';

/**
 * Lightning payment availability for checkout. Fetched when `enabled` turns on
 * (checkout opened) and re-checked every minute while it stays on. "unknown"
 * (status file missing or unreadable) must never block buying.
 */
export function usePaymentsStatus(enabled: boolean): LightningAvailability {
  const { data } = useQuery({
    queryKey: ['payments-status'],
    queryFn: () => fetchPaymentsStatus(),
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: enabled ? PAYMENTS_STATUS_POLL_MS : false,
    retry: false,
  });
  return data ?? 'unknown';
}
