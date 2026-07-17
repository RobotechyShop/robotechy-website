/**
 * Classify unhandled rejections raised by nostr-tools' relay connections.
 *
 * The order service talks to several relays (some flaky, paid, or restrictive).
 * nostr-tools surfaces relay/connection problems as unhandled promise rejections
 * that don't affect order processing — the poll and publish paths already handle
 * their own retries / `Promise.allSettled`. So a single flaky relay must NOT be
 * able to crash the whole service. Anything matched here is swallowed; anything
 * else is treated as a genuine bug and remains fatal.
 *
 * Matching is case-insensitive substring so it tolerates both errno codes
 * (`ETIMEDOUT`) and human phrasings ("connection timed out") — the latter is what
 * actually slipped through and crashed the service before.
 */
const RELAY_NOISE = [
  'restricted',
  'pay on',
  'blocked',
  'not allowed',
  'network error',
  'non-101',
  'websocket',
  // ws's handshake failure ("Unexpected server response: 403") when a relay
  // refuses the WebSocket upgrade with an HTTP status. Raised on an internal
  // nostr-tools connection promise nobody awaits, so it reaches this handler
  // (and crashed the service in production on 2026-07-02). The phrase is
  // specific to ws's upgrade path — the LNURL/Lightning fetch path can never
  // produce it — so matching it cannot swallow a real payment error.
  'unexpected server response',
  // nostr-tools' relay publish timeout ("publish timed out"), raised on an
  // internal promise nobody awaits when a slow relay never ACKs the event.
  // The publish paths already handle per-relay failures via allSettled — a
  // single slow relay must not kill the service (crashed production on
  // 2026-07-02 and restarted the container via the supervised entrypoint).
  // Phrase is specific to the relay publish path, so it cannot swallow a
  // Lightning/LNURL HTTP timeout.
  'publish timed out',
  // Specific connection/socket phrases only — a bare 'connection' or 'timeout'
  // would swallow unrelated failures (e.g. a Lightning/LNURL HTTP timeout, which
  // is a real error). Relay/socket timeouts reaching this handler always carry a
  // connection/socket context or the errno form (ETIMEDOUT, below).
  'connection refused',
  'connection reset',
  'connection closed',
  'connection timed out',
  'socket timed out',
  'socket hang up',
  'econnrefused',
  'econnreset',
  'etimedout',
  'ehostunreach',
  'enotfound',
  'eai_again',
  'rate-limit',
  'noting too much',
  // Relay-side failure notice delivered on the subscription OK/CLOSED path
  // (AbstractRelay.handleNext) — an internal nostr-tools promise nobody
  // awaits. Crashed the service twice on 2026-07-17 while a relay was
  // failing. Matched WITH the relay machine-readable "error:" prefix so a
  // Lightning/LNURL HTTP failure mentioning "internal error" (a real bug)
  // can never be swallowed — same specificity principle as the entries above.
  'error: internal error',
];

/**
 * @param {unknown} reason - the unhandled-rejection reason
 * @returns {boolean} true when it's a transient relay/network error to ignore
 */
export function isIgnorableRelayError(reason) {
  // Coerce to a string defensively — `message` may be non-string (e.g. a number),
  // and this runs inside the global unhandledRejection handler where throwing
  // would itself crash the service.
  const raw = reason && reason.message != null ? reason.message : reason;
  const msg = String(raw ?? '').toLowerCase();
  if (!msg) return false;
  return RELAY_NOISE.some((needle) => msg.includes(needle));
}
