/**
 * The archiver: keeps <backupDir> in step with everything the shop key
 * publishes, using only the shop's PUBLIC key.
 *
 *  - live: one subscription across the shop relays, so a publish is on disk
 *    within seconds (re-armed every 30 min to pick up relays that were down);
 *  - startup + nightly: a full sync from each relay, latest.jsonl, the
 *    catalog snapshot; nightly also a dated tarball (90-day rotation), the
 *    optional BACKUP_COPY_DIR copy and the optional n8n status POST.
 *
 * Gentle on relays by design: a nightly sync is 3 REQs per relay, and the
 * live subscription is a single REQ per relay.
 */

import { buildStatus, loadState, postStatus, saveState } from './archiveMonitor.js';
import { copyToDir, createTarball, rotateTarballs } from './backupTarball.js';
import { buildSnapshot, writeSnapshot } from './catalogSnapshot.js';
import { LISTING_KINDS } from './archiveConfig.js';

export const REARM_INTERVAL_MS = 30 * 60 * 1000;
export const SNAPSHOT_DEBOUNCE_MS = 2000;
export const RELAY_QUERY_MAX_WAIT_MS = 15000;

/** The REQ filters for a full sync (notes and deletions get their own limits). */
export function syncFilters(pubkey, kinds) {
  const other = kinds.filter((k) => k !== 1 && k !== 5);
  const filters = [{ authors: [pubkey], kinds: other, limit: 1000 }];
  if (kinds.includes(1)) filters.push({ authors: [pubkey], kinds: [1], limit: 500 });
  if (kinds.includes(5)) filters.push({ authors: [pubkey], kinds: [5], limit: 500 });
  return filters;
}

/** Milliseconds from `now` until the next HH:00 UTC. */
export function msUntilHourUtc(hour, now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(hour, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

export class Archiver {
  /**
   * @param {object} deps
   * @param {ReturnType<import('./archiveConfig.js').loadArchiveConfig>} deps.config
   * @param {import('./eventArchive.js').EventArchive} deps.archive
   * @param {{querySync: Function, subscribeMany: Function}} deps.pool  nostr-tools SimplePool (or a fake)
   */
  constructor({ config, archive, pool, logger = console, fetchImpl = fetch, tar = createTarball }) {
    this.config = config;
    this.archive = archive;
    this.pool = pool;
    this.logger = logger;
    this.fetchImpl = fetchImpl;
    this.tar = tar;
    this.sub = null;
    this.timers = new Set();
    this.snapshotTimer = null;
    this.lastSeen = Math.floor(Date.now() / 1000);
  }

  async handleEvent(event) {
    try {
      const result = await this.archive.save(event);
      if (result.status === 'saved') {
        this.lastSeen = Math.max(this.lastSeen, event.created_at);
        this.logger.log(`[Archiver] Saved kind ${event.kind} ${event.id.slice(0, 12)} -> ${result.path}`);
        this.scheduleSnapshot();
      }
      return result;
    } catch (error) {
      this.logger.error(`[Archiver] Failed to archive ${event?.id}: ${error.message}`);
      return { status: 'rejected', reason: error.message };
    }
  }

  scheduleSnapshot() {
    if (this.snapshotTimer) return;
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      this.refreshDerived().catch((e) => this.logger.error(`[Archiver] Snapshot failed: ${e.message}`));
    }, SNAPSHOT_DEBOUNCE_MS);
  }

  /** Rewrite latest.jsonl and the catalog snapshot from the archive. */
  async refreshDerived() {
    await this.archive.writeLatestJsonl();
    const snapshot = buildSnapshot(this.archive);
    await writeSnapshot(snapshot, {
      backupDir: this.config.backupDir,
      publicPath: this.config.snapshotPublicPath,
    });
    return snapshot;
  }

  /** (Re)open the live subscription. */
  arm() {
    try {
      this.sub?.close();
    } catch {
      // already closed
    }
    const since = Math.max(0, this.lastSeen - 600);
    this.sub = this.pool.subscribeMany(
      this.config.relays,
      { authors: [this.config.merchantPubkey], kinds: this.config.kinds, since },
      {
        onevent: (event) => {
          this.handleEvent(event);
        },
        onclose: (reasons) => {
          this.logger.warn(`[Archiver] Live subscription closed: ${JSON.stringify(reasons)}`);
        },
      }
    );
  }

  /**
   * Query every relay (each on its own, in parallel) for everything the shop
   * owns and archive it.
   * @returns {Promise<{liveEvents: object[], relaysReached: string[], saved: number}>}
   */
  async syncFromRelays() {
    const filters = syncFilters(this.config.merchantPubkey, this.config.kinds);
    const byId = new Map();
    const relaysReached = [];

    await Promise.allSettled(
      this.config.relays.map(async (relay) => {
        let answered = false;
        for (const filter of filters) {
          try {
            const events = await this.pool.querySync([relay], filter, { maxWait: RELAY_QUERY_MAX_WAIT_MS });
            if (events.length) answered = true;
            for (const event of events) byId.set(event.id, event);
          } catch (error) {
            this.logger.warn(`[Archiver] ${relay} query failed: ${error.message}`);
          }
        }
        if (answered) relaysReached.push(relay);
      })
    );

    let saved = 0;
    const liveEvents = [];
    for (const event of byId.values()) {
      const result = await this.handleEvent(event);
      if (result.status === 'saved') saved += 1;
      // Only events that are genuinely the shop's count as "live".
      if (result.status !== 'rejected') liveEvents.push(event);
    }
    return { liveEvents, relaysReached: relaysReached.sort(), saved };
  }

  /** Startup / nightly full sync. */
  async fullSync({ nightly = false, now = new Date() } = {}) {
    const { liveEvents, relaysReached, saved } = await this.syncFromRelays();
    await this.refreshDerived();
    this.logger.log(
      `[Archiver] Sync: ${liveEvents.length} events from ${relaysReached.length}/${this.config.relays.length} relays, ` +
        `${saved} new, ${this.archive.byId.size} archived total`
    );
    if (!nightly) return { liveEvents, relaysReached, saved };

    try {
      const tarball = await this.tar({ backupDir: this.config.backupDir, now });
      await rotateTarballs({ backupDir: this.config.backupDir, now, retentionDays: this.config.retentionDays, logger: this.logger });
      const copied = await copyToDir(tarball, this.config.copyDir);
      this.logger.log(`[Archiver] Tarball ${tarball}${copied ? ` (copied to ${copied})` : ''}`);
    } catch (error) {
      this.logger.error(`[Archiver] Tarball step failed: ${error.message}`);
    }

    const state = await loadState(this.config.backupDir);
    const { status, nextState } = buildStatus({
      shopName: this.config.shopName,
      archive: this.archive,
      liveEvents,
      listingKinds: LISTING_KINDS,
      state,
      relaysReached,
      now,
    });
    if (status.newDeletions.length) {
      this.logger.warn(`[Archiver] ${status.newDeletions.length} new deletion(s) by the shop key since last night`);
    }
    await postStatus(this.config.webhookUrl, status, { fetchImpl: this.fetchImpl, logger: this.logger });
    await saveState(this.config.backupDir, nextState);
    return { liveEvents, relaysReached, saved, status };
  }

  _later(fn, ms) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
  }

  scheduleNightly() {
    this._later(async () => {
      try {
        await this.fullSync({ nightly: true });
      } catch (error) {
        this.logger.error(`[Archiver] Nightly sync failed: ${error.message}`);
      }
      this.scheduleNightly();
    }, msUntilHourUtc(this.config.nightlyHourUtc));
  }

  scheduleRearm() {
    this._later(() => {
      this.arm();
      this.scheduleRearm();
    }, REARM_INTERVAL_MS);
  }

  async start() {
    // Serve what we already have straight away (e.g. after a container rebuild).
    if (this.archive.byId.size) await this.refreshDerived();
    this.arm();
    this.scheduleRearm();
    this.scheduleNightly();
    await this.fullSync();
  }

  stop() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
    try {
      this.sub?.close();
    } catch {
      // ignore
    }
  }
}
