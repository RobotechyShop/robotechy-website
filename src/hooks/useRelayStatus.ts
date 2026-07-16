import { useQuery } from '@tanstack/react-query';

export type RelayStatus = 'connecting' | 'connected' | 'unreachable';

export const RELAY_CONNECT_TIMEOUT_MS = 5000;

/**
 * Probe a relay by opening a WebSocket: 'connected' if the socket opens,
 * 'unreachable' on error or timeout. The socket is closed as soon as the
 * result is known, and the probe aborts cleanly via the given signal.
 */
export function checkRelayStatus(
  url: string,
  signal?: AbortSignal
): Promise<Exclude<RelayStatus, 'connecting'>> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      resolve('unreachable');
      return;
    }

    const settle = (status: Exclude<RelayStatus, 'connecting'>) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      socket.onopen = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch {
        // Socket may already be closed or in a closing state.
      }
      resolve(status);
    };
    const onAbort = () => settle('unreachable');

    const timer = setTimeout(() => settle('unreachable'), RELAY_CONNECT_TIMEOUT_MS);
    signal?.addEventListener('abort', onAbort);
    socket.onopen = () => settle('connected');
    socket.onerror = () => settle('unreachable');
  });
}

/**
 * Live connection status for a relay URL. Results are cached per URL for the
 * session, so re-rendering (or re-opening the dialog) doesn't hammer relays.
 */
export function useRelayStatus(url: string): RelayStatus {
  const { data } = useQuery({
    queryKey: ['relay-status', url],
    queryFn: ({ signal }) => checkRelayStatus(url, signal),
    staleTime: Infinity,
    retry: false,
  });

  return data ?? 'connecting';
}
