/**
 * Pure planning logic for restore.js (no network, no keys) — unit-tested.
 *
 * Modes:
 *   rebroadcast  re-send the ORIGINAL signed events from the archive. Needs no
 *                key. Works whenever relays simply lost the data. It cannot
 *                undo a kind-5 deletion (relays that honour NIP-09 will refuse
 *                the old event) or roll back to an older version (relays keep
 *                the newest replaceable event).
 *   republish    produce UNSIGNED templates (same tags/content, fresh
 *                created_at) for the owner to sign in the browser. The
 *                container never holds or asks for a secret key.
 */

import { CATALOG_KINDS } from './archiveConfig.js';
import { coordinateOf, dTagOf, eventKey, isNewer, EventArchive } from './eventArchive.js';

/** What a restore touches by default: catalog + profile, relay list, contacts. Never kind 5. */
export const DEFAULT_RESTORE_KINDS = [0, 3, 10002, ...CATALOG_KINDS];

export const USAGE = `Usage: node restore.js [options]

  --mode rebroadcast|republish   default: rebroadcast
  --d <tag>                      only the event(s) with this d-tag (one product)
  --kind <n>                     only this kind (repeatable); default ${DEFAULT_RESTORE_KINDS.join(',')}
  --at <created_at>              restore the version at/before this unix time
  --relays <a,b,...>             target relays (default: archiver relays)
  --out <file>                   republish: write templates here (default: stdout)
  --dry-run                      show the plan only (DEFAULT)
  --execute                      actually send (rebroadcast) / write --out (republish)
  -h, --help`;

export function parseArgs(argv) {
  const opts = { mode: 'rebroadcast', d: null, kinds: [], at: null, relays: null, out: null, dryRun: true, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      i += 1;
      return value;
    };
    switch (arg) {
      case '--mode':
        opts.mode = next();
        if (!['rebroadcast', 'republish'].includes(opts.mode)) {
          throw new Error(`--mode must be rebroadcast or republish, got ${opts.mode}`);
        }
        break;
      case '--d':
        opts.d = next();
        break;
      case '--kind': {
        const kind = Number.parseInt(next(), 10);
        if (!Number.isInteger(kind) || kind === 5) throw new Error('--kind must be an integer other than 5');
        opts.kinds.push(kind);
        break;
      }
      case '--at':
        opts.at = Number.parseInt(next(), 10);
        if (!Number.isInteger(opts.at)) throw new Error('--at must be a unix timestamp');
        break;
      case '--relays':
        opts.relays = next().split(',').map((r) => r.trim()).filter(Boolean);
        break;
      case '--out':
        opts.out = next();
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--execute':
      case '--no-dry-run':
        opts.dryRun = false;
        break;
      case '-h':
      case '--help':
        opts.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return opts;
}

/**
 * Pick the version of each logical event to restore.
 * @param {object[]} events  archived events
 * @param {{d?: string|null, kinds?: number[], at?: number|null}} filter
 */
export function selectEvents(events, { d = null, kinds = [], at = null } = {}) {
  const allowed = kinds.length ? kinds : DEFAULT_RESTORE_KINDS;
  const chosen = new Map();
  for (const event of events) {
    if (event.kind === 5 || !allowed.includes(event.kind)) continue;
    if (d !== null && dTagOf(event) !== d) continue;
    if (at !== null && event.created_at > at) continue;
    const key = eventKey(event);
    if (isNewer(event, chosen.get(key))) chosen.set(key, event);
  }
  return [...chosen.values()].sort((a, b) => a.kind - b.kind || a.created_at - b.created_at);
}

/** An unsigned copy of `event` for the owner to re-sign. */
export function toTemplate(event, now = Math.floor(Date.now() / 1000)) {
  return { kind: event.kind, created_at: now, tags: event.tags, content: event.content };
}

/**
 * Annotate each selected event with warnings the operator should see.
 * @param {object[]} selected     from selectEvents
 * @param {object[]} allEvents    the whole archive (to spot deletions / newer versions)
 */
export function planRestore(selected, allEvents, { mode = 'rebroadcast' } = {}) {
  const deletions = allEvents.filter((e) => e.kind === 5);
  const newestByKey = new Map();
  for (const event of allEvents) {
    if (event.kind === 5) continue;
    const key = eventKey(event);
    if (isNewer(event, newestByKey.get(key))) newestByKey.set(key, event);
  }

  return selected.map((event) => {
    const deletedBy = deletions.filter((d) => EventArchive.targets(d, event)).map((d) => d.id);
    const newest = newestByKey.get(eventKey(event));
    const superseded = !!newest && newest.id !== event.id && coordinateOf(event) !== null;
    const warnings = [];
    if (mode === 'rebroadcast' && deletedBy.length) {
      warnings.push(`deleted by ${deletedBy.join(', ')} — relays will likely refuse it; use --mode republish`);
    }
    if (mode === 'rebroadcast' && superseded) {
      warnings.push(`a newer version (${newest.created_at}) exists — relays keep the newest; use --mode republish to roll back`);
    }
    return { event, coordinate: coordinateOf(event), deletedBy, superseded, warnings };
  });
}

export function describe(event) {
  const title = event.tags.find((t) => t[0] === 'title' || t[0] === 'name')?.[1];
  const d = dTagOf(event);
  return `kind ${event.kind}${d ? ` d=${d}` : ''}${title ? ` "${title}"` : ''} @${event.created_at} (${event.id.slice(0, 12)})`;
}

export function formatPlan(plan, { mode, dryRun, relays }) {
  const lines = [
    `${dryRun ? '[DRY RUN] ' : ''}${mode} of ${plan.length} event(s)` +
      (mode === 'rebroadcast' ? ` to ${relays.length} relay(s): ${relays.join(', ')}` : ''),
  ];
  for (const item of plan) {
    lines.push(`  - ${describe(item.event)}`);
    for (const warning of item.warnings) lines.push(`      ! ${warning}`);
  }
  if (dryRun) lines.push('Nothing sent. Re-run with --execute to proceed.');
  return lines.join('\n');
}
