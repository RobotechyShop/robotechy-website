/**
 * Append-only, on-disk archive of every signed event the shop key owns.
 *
 * Layout (under <backupDir>/events):
 *   <kind>/<slot>/<created_at>.json   the original signed event, byte-for-byte JSON
 *   latest.jsonl                      newest known version of every event, one per line
 *
 * <slot> is the d-tag for addressable kinds (30000-39999), the pubkey for
 * replaceable kinds (0, 3, 10000-19999) so every version of the profile sits in
 * one folder, and the event id for regular kinds (1, 5, ...).
 *
 * Rules:
 *   - only events signed by the shop key (signature verified) are stored;
 *   - files are never overwritten or deleted — a new version is a new file;
 *   - a kind-5 deletion is archived as evidence and logged as a WARNING, and the
 *     targeted copies are kept so they can be restored.
 */

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyEvent } from 'nostr-tools/pure';

export function isReplaceable(kind) {
  return kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000);
}

export function isAddressable(kind) {
  return kind >= 30000 && kind < 40000;
}

export function dTagOf(event) {
  return event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
}

/** `kind:pubkey:d` for addressable, `kind:pubkey` for replaceable, else null. */
export function coordinateOf(event) {
  if (isAddressable(event.kind)) return `${event.kind}:${event.pubkey}:${dTagOf(event)}`;
  if (isReplaceable(event.kind)) return `${event.kind}:${event.pubkey}`;
  return null;
}

/** Identity of "the same logical event" across versions. */
export function eventKey(event) {
  return coordinateOf(event) ?? event.id;
}

/** NIP-01 ordering: newer created_at wins; on a tie the lowest id wins. */
export function isNewer(a, b) {
  if (!b) return true;
  if (a.created_at !== b.created_at) return a.created_at > b.created_at;
  return a.id < b.id;
}

/**
 * Make an arbitrary d-tag safe as a single path segment. Clean tags pass
 * through unchanged; anything else is sanitised and suffixed with a short hash
 * of the original so two different tags can never collide.
 */
export function safeSegment(raw) {
  const value = String(raw);
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100);
  if (cleaned === value && value !== '' && value !== '.' && value !== '..') return value;
  const hash = createHash('sha256').update(value).digest('hex').slice(0, 12);
  return `${cleaned || 'empty'}~${hash}`;
}

export function slotFor(event) {
  if (isAddressable(event.kind)) return safeSegment(dTagOf(event));
  if (isReplaceable(event.kind)) return event.pubkey;
  return event.id;
}

/**
 * Copy only the NIP-01 fields. nostr-tools caches signature checks on a
 * Symbol property that survives object spread, so a tampered copy of a
 * verified event would otherwise pass verifyEvent — always verify a clean copy.
 */
export function canonical(event) {
  const { id, pubkey, created_at, kind, tags, content, sig } = event;
  return { id, pubkey, created_at, kind, tags, content, sig };
}

/** Shape check before the (more expensive) signature check. */
export function looksLikeEvent(event) {
  return (
    !!event &&
    typeof event === 'object' &&
    typeof event.id === 'string' &&
    typeof event.pubkey === 'string' &&
    typeof event.sig === 'string' &&
    Number.isInteger(event.kind) &&
    Number.isInteger(event.created_at) &&
    Array.isArray(event.tags) &&
    typeof event.content === 'string'
  );
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Write via a temp file + rename so readers never see a half-written file. */
export async function atomicWrite(path, data) {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}

export class EventArchive {
  /**
   * @param {object} opts
   * @param {string} opts.dir             backup root (events live in <dir>/events)
   * @param {string} opts.merchantPubkey  hex pubkey of the shop
   * @param {number[]} opts.kinds         kinds to accept
   * @param {Console} [opts.logger]
   * @param {(e: object) => boolean} [opts.verify]  signature check (injectable for tests)
   */
  constructor({ dir, merchantPubkey, kinds, logger = console, verify = verifyEvent }) {
    this.dir = dir;
    this.eventsDir = join(dir, 'events');
    this.merchantPubkey = merchantPubkey;
    this.kinds = new Set(kinds);
    this.logger = logger;
    this.verify = verify;
    /** @type {Map<string, object>} id -> event */
    this.byId = new Map();
    this._chain = Promise.resolve();
  }

  /** Load every archived event from disk into memory. Safe on an empty dir. */
  async load() {
    await mkdir(this.eventsDir, { recursive: true });
    for (const kindDir of await readdir(this.eventsDir, { withFileTypes: true })) {
      if (!kindDir.isDirectory()) continue;
      const kindPath = join(this.eventsDir, kindDir.name);
      for (const slot of await readdir(kindPath, { withFileTypes: true })) {
        if (!slot.isDirectory()) continue;
        const slotPath = join(kindPath, slot.name);
        for (const file of await readdir(slotPath)) {
          if (!file.endsWith('.json')) continue;
          try {
            const event = JSON.parse(await readFile(join(slotPath, file), 'utf8'));
            if (looksLikeEvent(event)) this.byId.set(event.id, canonical(event));
          } catch (error) {
            this.logger.warn(`[Archive] Skipping unreadable ${join(slotPath, file)}: ${error.message}`);
          }
        }
      }
    }
    return this;
  }

  all() {
    return [...this.byId.values()];
  }

  has(id) {
    return this.byId.has(id);
  }

  /** Newest version of every logical event (see eventKey). */
  latest() {
    const map = new Map();
    for (const event of this.byId.values()) {
      const key = eventKey(event);
      if (isNewer(event, map.get(key))) map.set(key, event);
    }
    return map;
  }

  deletions() {
    return this.all().filter((e) => e.kind === 5 && e.pubkey === this.merchantPubkey);
  }

  /** Does kind-5 event `deletion` target `event` (NIP-09 `e` / `a` tags)? */
  static targets(deletion, event) {
    if (deletion.pubkey !== event.pubkey || deletion.kind !== 5 || event.kind === 5) return false;
    const coordinate = coordinateOf(event);
    return deletion.tags.some(
      ([name, value]) =>
        (name === 'e' && value === event.id) ||
        (name === 'a' && coordinate !== null && value === coordinate &&
          event.created_at <= deletion.created_at)
    );
  }

  /** Kind-5 events (from the given set, default: the archive) that delete `event`. */
  deletedBy(event, deletions = this.deletions()) {
    return deletions.filter((d) => EventArchive.targets(d, event));
  }

  /** Archived events a kind-5 deletion targets. */
  targetsOf(deletion) {
    return this.all().filter((e) => EventArchive.targets(deletion, e));
  }

  pathFor(event) {
    return join(this.eventsDir, String(event.kind), slotFor(event), `${event.created_at}.json`);
  }

  /**
   * Verify and store one event. Serialised so concurrent relay deliveries of
   * the same event can't race on the filesystem.
   * @returns {Promise<{status: 'saved'|'duplicate'|'rejected', path?: string, reason?: string}>}
   */
  save(event) {
    const run = this._chain.then(() => this._save(event));
    this._chain = run.catch(() => {});
    return run;
  }

  async _save(input) {
    if (!looksLikeEvent(input)) return { status: 'rejected', reason: 'malformed' };
    const event = canonical(input);
    if (event.pubkey !== this.merchantPubkey) return { status: 'rejected', reason: 'foreign-pubkey' };
    if (!this.kinds.has(event.kind)) return { status: 'rejected', reason: 'kind-not-archived' };
    if (this.byId.has(event.id)) return { status: 'duplicate', path: this.pathFor(event) };
    if (!this.verify(event)) return { status: 'rejected', reason: 'bad-signature' };

    let path = this.pathFor(event);
    if (await exists(path)) {
      // Same slot + second, different event: keep both, never overwrite.
      const existing = JSON.parse(await readFile(path, 'utf8'));
      if (existing.id === event.id) {
        this.byId.set(event.id, event);
        return { status: 'duplicate', path };
      }
      path = path.replace(/\.json$/, `-${event.id.slice(0, 12)}.json`);
    }

    await mkdir(join(path, '..'), { recursive: true });
    await atomicWrite(path, `${JSON.stringify(event, null, 2)}\n`);
    this.byId.set(event.id, event);

    if (event.kind === 5) this._warnDeletion(event);
    return { status: 'saved', path };
  }

  _warnDeletion(deletion) {
    const targets = this.targetsOf(deletion);
    const described = targets.map((e) => {
      const title = e.tags.find((t) => t[0] === 'title' || t[0] === 'name')?.[1];
      return `kind ${e.kind} ${coordinateOf(e) ?? e.id}${title ? ` "${title}"` : ''}`;
    });
    const raw = deletion.tags.filter(([n]) => n === 'e' || n === 'a').map(([n, v]) => `${n}:${v}`);
    this.logger.warn(
      `[Archive] WARNING: shop key published deletion ${deletion.id} ` +
        `(${raw.length} target(s): ${raw.join(', ') || 'none'}). ` +
        (targets.length
          ? `Archived copies KEPT for ${described.join('; ')} — restore with restore.js.`
          : 'No archived copy of the target(s) yet.')
    );
  }

  /** Rewrite <events>/latest.jsonl (a derived index — safe to regenerate). */
  async writeLatestJsonl() {
    await mkdir(this.eventsDir, { recursive: true });
    const lines = [...this.latest().values()]
      .sort((a, b) => a.kind - b.kind || b.created_at - a.created_at)
      .map((e) => JSON.stringify(e));
    const path = join(this.eventsDir, 'latest.jsonl');
    await atomicWrite(path, lines.length ? `${lines.join('\n')}\n` : '');
    return path;
  }
}
