import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { checkRelayStatus, RELAY_CONNECT_TIMEOUT_MS } from './useRelayStatus';

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    if (url.startsWith('throw:')) {
      throw new Error('invalid URL');
    }
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

describe('checkRelayStatus', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("resolves 'connected' when the socket opens, then closes it", async () => {
    const promise = checkRelayStatus('wss://relay.example.com');
    const socket = MockWebSocket.instances[0];

    socket.onopen?.();

    await expect(promise).resolves.toBe('connected');
    expect(socket.closed).toBe(true);
  });

  it("resolves 'unreachable' when the socket errors", async () => {
    const promise = checkRelayStatus('wss://relay.example.com');
    const socket = MockWebSocket.instances[0];

    socket.onerror?.();

    await expect(promise).resolves.toBe('unreachable');
    expect(socket.closed).toBe(true);
  });

  it("resolves 'unreachable' when the connection times out", async () => {
    const promise = checkRelayStatus('wss://relay.example.com');

    vi.advanceTimersByTime(RELAY_CONNECT_TIMEOUT_MS);

    await expect(promise).resolves.toBe('unreachable');
    expect(MockWebSocket.instances[0].closed).toBe(true);
  });

  it("resolves 'unreachable' when the WebSocket constructor throws", async () => {
    await expect(checkRelayStatus('throw://bad-url')).resolves.toBe('unreachable');
  });

  it('rejects with the abort reason and cleans up the socket when the abort signal fires', async () => {
    const controller = new AbortController();
    const promise = checkRelayStatus('wss://relay.example.com', controller.signal);
    const socket = MockWebSocket.instances[0];

    controller.abort();

    // Rejecting (not resolving 'unreachable') lets React Query treat a
    // cancelled probe as a cancellation instead of caching a false result.
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(socket.closed).toBe(true);
  });

  it('rejects immediately without opening a socket when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const promise = checkRelayStatus('wss://relay.example.com', controller.signal);

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(MockWebSocket.instances).toHaveLength(0);
  });
});
