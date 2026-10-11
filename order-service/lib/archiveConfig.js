/**
 * Configuration for the event archiver / restore tooling.
 *
 * Deliberately separate from ./config.js: that module requires MERCHANT_NSEC at
 * import time, whereas the archiver only ever needs the shop's PUBLIC key
 * (MERCHANT_NPUB). Nothing in the backup path reads, stores or signs with a
 * secret key.
 *
 * Shared verbatim between robotechy-website and eden-weeks-art — only the
 * per-shop constants in the "Per-shop" block differ.
 */

import { nip19 } from 'nostr-tools';

// ---------------------------------------------------------------------------
// Per-shop constants (the only block that differs between the two repos)
// ---------------------------------------------------------------------------

/** Human-readable shop name, used in logs and the monitoring payload. */
export const SHOP_NAME = 'robotechy';

/**
 * Catalog kinds — the addressable "products & shop setup" events.
 * 30402 = NIP-99 / Gamma product, 30405 = collection, 30406 = shipping option.
 */
export const CATALOG_KINDS = [30402, 30405, 30406];

/** Kinds that count as a sellable listing for the monitoring "live listings" figure. */
export const LISTING_KINDS = [30402];

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/**
 * Everything the shop key owns that we archive:
 *   0 profile, 1 story notes (useStoryNotes / usePosts), 3 contacts,
 *   5 deletions (archived as evidence, never re-broadcast), 10002 relay list,
 *   plus the catalog kinds above.
 */
export const ARCHIVE_KINDS = [0, 1, 3, 5, 10002, ...CATALOG_KINDS];

/**
 * Default relays — keep in sync with src/lib/shopRelays.ts. The family relay
 * comes first; it may be unreachable and everything must tolerate that.
 */
export const DEFAULT_SHOP_RELAYS = [
  'wss://relay.weeksfamily.me',
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
  'wss://relay.plebeian.market',
];

/**
 * Decode an npub (or accept a 64-char hex pubkey) to hex. Throws on anything
 * else — including an nsec, which must never be passed here.
 */
export function decodePubkey(value) {
  const trimmed = String(value ?? '').trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (trimmed.startsWith('nsec')) {
    throw new Error('MERCHANT_NPUB must be a PUBLIC key (npub/hex), not an nsec');
  }
  const decoded = nip19.decode(trimmed);
  if (decoded.type !== 'npub') throw new Error(`Expected npub, got ${decoded.type}`);
  return decoded.data;
}

/** Normalise and de-duplicate a list of relay URLs (drops trailing slashes). */
export function normaliseRelays(urls) {
  const out = [];
  for (const raw of urls) {
    const url = String(raw ?? '')
      .trim()
      .replace(/\/+$/, '');
    if (!/^wss?:\/\//i.test(url)) continue;
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

/** Parse a comma-separated relay list from an env var. */
export function parseRelayList(value) {
  return normaliseRelays(String(value ?? '').split(','));
}

/**
 * Build the archiver config from the environment.
 *
 * Env:
 *   MERCHANT_NPUB          (required) shop public key, npub or hex
 *   BACKUP_DIR             default /data/backups
 *   ARCHIVE_RELAYS         default DEFAULT_SHOP_RELAYS (+ FALLBACK_RELAYS)
 *   FALLBACK_RELAYS        the order-service relay list; merged in if set
 *   SNAPSHOT_PUBLIC_PATH   where the site serves catalog-snapshot.json from
 *                          (default /app/dist/catalog-snapshot.json)
 *   BACKUP_COPY_DIR        optional mounted dir (e.g. Nextcloud) for tarball copies
 *   N8N_WEBHOOK_URL        optional; nightly status JSON is POSTed here
 *   BACKUP_RETENTION_DAYS  tarball retention, default 90
 *   NIGHTLY_SYNC_HOUR_UTC  default 3
 */
export function loadArchiveConfig(env = process.env) {
  if (!env.MERCHANT_NPUB) {
    throw new Error('Missing required environment variable: MERCHANT_NPUB');
  }
  const configured = env.ARCHIVE_RELAYS
    ? parseRelayList(env.ARCHIVE_RELAYS)
    : DEFAULT_SHOP_RELAYS;
  const relays = normaliseRelays([...configured, ...parseRelayList(env.FALLBACK_RELAYS)]);

  const retentionDays = Number.parseInt(env.BACKUP_RETENTION_DAYS ?? '', 10);
  const nightlyHour = Number.parseInt(env.NIGHTLY_SYNC_HOUR_UTC ?? '', 10);

  return {
    shopName: SHOP_NAME,
    merchantPubkey: decodePubkey(env.MERCHANT_NPUB),
    backupDir: env.BACKUP_DIR || '/data/backups',
    relays,
    snapshotPublicPath: env.SNAPSHOT_PUBLIC_PATH ?? '/app/dist/catalog-snapshot.json',
    copyDir: env.BACKUP_COPY_DIR || '',
    webhookUrl: env.N8N_WEBHOOK_URL || '',
    retentionDays: Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 90,
    nightlyHourUtc:
      Number.isFinite(nightlyHour) && nightlyHour >= 0 && nightlyHour < 24 ? nightlyHour : 3,
    kinds: ARCHIVE_KINDS,
  };
}
