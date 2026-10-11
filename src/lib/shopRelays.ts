/**
 * The shop's relays — where its catalog, profile and story notes live.
 *
 * Used as the app's default relay list AND, for shop data, queried directly
 * (outbox model): a visitor whose own relay list lacks these relays must still
 * see the catalog. Keep in sync with DEFAULT_SHOP_RELAYS in
 * order-service/lib/archiveConfig.js.
 *
 * relay.weeksfamily.me is the family relay; it comes first but may be
 * unreachable, and nothing may wait on it. Removed (dead / not serving the
 * shop): relay.nostr.band, relay.nostr.net, nos.lol.
 */
export const SHOP_RELAYS: readonly string[] = [
  'wss://relay.weeksfamily.me',
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
  'wss://relay.plebeian.market',
];

/** Hard ceiling on a shop query — after this, whatever has arrived is used. */
export const SHOP_QUERY_TIMEOUT_MS = 3000;

/**
 * Once the FIRST relay has sent EOSE, wait at most this long for the others
 * (NPool `eoseTimeout`). A dead relay therefore costs nothing once any good
 * relay has answered.
 */
export const SHOP_EOSE_TIMEOUT_MS = 1000;

/** The app's default relay metadata (read + write on every shop relay). */
export function shopRelayMetadata() {
  return {
    relays: SHOP_RELAYS.map((url) => ({ url, read: true, write: true })),
    updatedAt: 0,
  };
}
