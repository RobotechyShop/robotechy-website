/**
 * Restore shop events from the in-container archive. DRY RUN by default.
 *
 *   docker exec robotechy node /app/order-service/restore.js --d my-product
 *   docker exec robotechy node /app/order-service/restore.js --d my-product --execute
 *   docker exec robotechy node /app/order-service/restore.js --mode republish --d my-product
 *
 * rebroadcast re-sends the original signed events (no key needed).
 * republish prints unsigned templates for the OWNER to sign in the browser —
 * this script never reads or asks for a secret key. See README "Backups & restore".
 */

import { writeFile } from 'node:fs/promises';
import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';
import WebSocket from 'ws';
import { loadArchiveConfig } from './lib/archiveConfig.js';
import { EventArchive } from './lib/eventArchive.js';
import { describe, formatPlan, parseArgs, planRestore, selectEvents, toTemplate, USAGE } from './lib/restorePlan.js';

useWebSocketImplementation(WebSocket);

async function rebroadcast(plan, relays) {
  const pool = new SimplePool();
  try {
    for (const { event } of plan) {
      const results = await Promise.allSettled(pool.publish(relays, event, { maxWait: 10000 }));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      console.log(`  ${ok}/${relays.length} accepted  ${describe(event)}`);
      for (const [i, r] of results.entries()) {
        if (r.status === 'rejected') console.log(`      ${relays[i]}: ${r.reason?.message || r.reason}`);
      }
      // Be gentle: one event at a time, short pause between them.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  } finally {
    pool.destroy?.();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return;
  }

  const config = loadArchiveConfig();
  const relays = opts.relays ?? config.relays;
  const archive = await new EventArchive({
    dir: config.backupDir,
    merchantPubkey: config.merchantPubkey,
    kinds: config.kinds,
  }).load();

  const selected = selectEvents(archive.all(), { d: opts.d, kinds: opts.kinds, at: opts.at });
  if (!selected.length) {
    console.log('No archived events match. Check --d / --kind / --at, or list the archive folders.');
    process.exitCode = 1;
    return;
  }
  const plan = planRestore(selected, archive.all(), { mode: opts.mode });
  console.log(formatPlan(plan, { mode: opts.mode, dryRun: opts.dryRun, relays }));

  if (opts.mode === 'republish') {
    const templates = plan.map(({ event }) => toTemplate(event));
    const json = JSON.stringify(templates, null, 2);
    if (!opts.dryRun && opts.out) {
      await writeFile(opts.out, `${json}\n`);
      console.log(`Wrote ${templates.length} unsigned template(s) to ${opts.out}`);
    } else {
      console.log(json);
    }
    console.log(
      'These are UNSIGNED. The shop owner signs and publishes them from the browser ' +
        '(see README "Backups & restore" → Republish). The container never holds the key.'
    );
    return;
  }

  if (!opts.dryRun) await rebroadcast(plan, relays);
}

main().catch((error) => {
  console.error(`restore.js: ${error.message}\n\n${USAGE}`);
  process.exit(1);
});
