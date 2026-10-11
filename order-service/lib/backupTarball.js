/**
 * Nightly dated tarballs of the event archive, with retention.
 *
 * The events/ tree itself is NEVER pruned. Only the dated tarballs in
 * <backupDir>/tarballs rotate (default 90 days), as they are point-in-time
 * copies of data that still lives in events/. Copies placed in BACKUP_COPY_DIR
 * (e.g. a mounted Nextcloud folder) are never deleted by this service.
 */

import { execFile } from 'node:child_process';
import { copyFile, mkdir, readdir, rename, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const TARBALL_RE = /^events-(\d{4}-\d{2}-\d{2})\.tar\.gz$/;

export function tarballName(date) {
  return `events-${date.toISOString().slice(0, 10)}.tar.gz`;
}

/** Tarball file names older than `retentionDays` relative to `now`. */
export function tarballsToRotate(names, now, retentionDays) {
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  return names.filter((name) => {
    const match = TARBALL_RE.exec(name);
    if (!match) return false; // never touch files we didn't create
    return Date.parse(`${match[1]}T00:00:00Z`) < cutoff;
  });
}

/**
 * Create today's tarball of <backupDir>/events (overwrites today's if re-run).
 * @param {object} opts
 * @param {Function} [opts.exec] injectable execFile (tests)
 */
export async function createTarball({ backupDir, now = new Date(), exec = execFileAsync }) {
  const dir = join(backupDir, 'tarballs');
  await mkdir(dir, { recursive: true });
  const out = join(dir, tarballName(now));
  const tmp = `${out}.tmp`;
  await exec('tar', ['-czf', tmp, '-C', backupDir, 'events']);
  await rename(tmp, out);
  return out;
}

export async function rotateTarballs({ backupDir, now = new Date(), retentionDays, logger = console }) {
  const dir = join(backupDir, 'tarballs');
  let names = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const doomed = tarballsToRotate(names, now, retentionDays);
  for (const name of doomed) {
    await unlink(join(dir, name));
    logger.log(`[Backup] Rotated ${name} (older than ${retentionDays} days)`);
  }
  return doomed;
}

/** Optional off-box copy hook (BACKUP_COPY_DIR). */
export async function copyToDir(file, copyDir) {
  if (!copyDir) return null;
  await mkdir(copyDir, { recursive: true });
  const target = join(copyDir, basename(file));
  await copyFile(file, target);
  return target;
}
