import { describe, it, expect, vi } from 'vitest';

import { fetchPaymentsStatus, parsePaymentsStatus } from './paymentsStatus';

function response(body: string, { status = 200, type = 'application/json' } = {}) {
  return new Response(body, { status, headers: { 'content-type': type } });
}

describe('parsePaymentsStatus', () => {
  it('accepts only the two known states', () => {
    expect(parsePaymentsStatus({ lightning: 'ok' })).toBe('ok');
    expect(parsePaymentsStatus({ lightning: 'unavailable' })).toBe('unavailable');
    expect(parsePaymentsStatus({ lightning: 'down' })).toBe('unknown');
    expect(parsePaymentsStatus(null)).toBe('unknown');
    expect(parsePaymentsStatus('ok')).toBe('unknown');
  });
});

describe('fetchPaymentsStatus', () => {
  it('reads the status file', async () => {
    const fetchImpl = vi.fn(async () =>
      response('{"lightning":"unavailable","checkedAt":"2026-11-08T12:00:00Z"}')
    );
    expect(await fetchPaymentsStatus({ fetchImpl })).toBe('unavailable');
  });

  it('treats a missing file, the SPA index.html fallback or a network error as unknown', async () => {
    expect(
      await fetchPaymentsStatus({ fetchImpl: async () => response('', { status: 404 }) })
    ).toBe('unknown');
    expect(
      await fetchPaymentsStatus({
        fetchImpl: async () => response('<!doctype html>', { type: 'text/html' }),
      })
    ).toBe('unknown');
    expect(
      await fetchPaymentsStatus({
        fetchImpl: async () => {
          throw new TypeError('Failed to fetch');
        },
      })
    ).toBe('unknown');
  });
});
