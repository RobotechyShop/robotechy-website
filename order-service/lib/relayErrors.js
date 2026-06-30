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
  // Specific connection phrases only — a bare 'connection' would swallow
  // unrelated failures (e.g. Lightning/LNURL). 'timed out'/'timeout' below also
  // catch "connection timed out".
  'connection refused',
  'connection reset',
  'connection closed',
  'timed out',
  'timeout',
  'socket hang up',
  'econnrefused',
  'econnreset',
  'etimedout',
  'ehostunreach',
  'enotfound',
  'eai_again',
  'rate-limit',
  'noting too much',
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
