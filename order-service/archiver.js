/**
 * Event archiver entry point — started by docker-entrypoint.sh when
 * MERCHANT_NPUB is set. Needs only the shop's PUBLIC key. See lib/archiver.js.
 */

import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';
import WebSocket from 'ws';
import { loadArchiveConfig } from './lib/archiveConfig.js';
import { Archiver } from './lib/archiver.js';
import { EventArchive } from './lib/eventArchive.js';

useWebSocketImplementation(WebSocket);

// A flaky relay must never take the archiver down: log and carry on.
process.on('unhandledRejection', (reason) => {
  console.warn('[Archiver] Ignoring unhandled rejection:', reason?.message || reason);
});

async function main() {
  const config = loadArchiveConfig();
  console.log(
    `[Archiver] Archiving ${config.shopName} (${config.merchantPubkey.slice(0, 12)}…) to ${config.backupDir} ` +
      `from ${config.relays.length} relays: ${config.relays.join(', ')}`
  );

  const archive = await new EventArchive({
    dir: config.backupDir,
    merchantPubkey: config.merchantPubkey,
    kinds: config.kinds,
  }).load();
  console.log(`[Archiver] Loaded ${archive.byId.size} archived events`);

  const pool = new SimplePool({ enableReconnect: true });
  const archiver = new Archiver({ config, archive, pool });

  const shutdown = () => {
    archiver.stop();
    pool.destroy?.();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await archiver.start();
}

main().catch((error) => {
  console.error('[Archiver] Fatal:', error.message);
  process.exit(1);
});
