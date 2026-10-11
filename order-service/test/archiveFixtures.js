/**
 * Shared fixtures for the archive tests: a throwaway keypair generated per run
 * (never a real shop key) and helpers to sign events with it.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';

export const shopKey = generateSecretKey();
export const shopPubkey = getPublicKey(shopKey);
export const otherKey = generateSecretKey();

export function signed(template, key = shopKey) {
  return finalizeEvent({ tags: [], content: '', created_at: 1_700_000_000, ...template }, key);
}

export function product(d, title, created_at, extraTags = []) {
  return signed({
    kind: 30402,
    created_at,
    tags: [['d', d], ['title', title], ['price', '1000', 'SAT'], ...extraTags],
    content: `${title} description`,
  });
}

export async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'archive-test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const silentLogger = { log() {}, warn() {}, error() {} };

export function recordingLogger() {
  const lines = { log: [], warn: [], error: [] };
  return {
    lines,
    log: (m) => lines.log.push(String(m)),
    warn: (m) => lines.warn.push(String(m)),
    error: (m) => lines.error.push(String(m)),
  };
}
