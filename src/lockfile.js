import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const LOCK_NAME = '.skillfoo.lock';
const LOCKFILE_VERSION = 1;

export function readLock(cwd) {
  const path = join(cwd, LOCK_NAME);
  if (!existsSync(path)) {
    return { lockfileVersion: LOCKFILE_VERSION, skills: {} };
  }

  let lock;
  try {
    lock = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`${LOCK_NAME} is corrupt: ${err.message}`);
  }

  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) {
    throw new Error(`${LOCK_NAME} is corrupt: expected a JSON object`);
  }
  if (lock.lockfileVersion > LOCKFILE_VERSION) {
    throw new Error(`${LOCK_NAME} was written by a newer skillfoo; upgrade`);
  }
  if (lock.skills != null && (typeof lock.skills !== 'object' || Array.isArray(lock.skills))) {
    throw new Error(`${LOCK_NAME} is corrupt: "skills" must be an object`);
  }

  return {
    lockfileVersion: lock.lockfileVersion ?? LOCKFILE_VERSION,
    skills: lock.skills ?? {},
  };
}

export function writeLock(cwd, lock) {
  const skills = {};
  for (const name of Object.keys(lock.skills).sort()) {
    const entry = lock.skills[name];
    skills[name] = { source: entry.source, hash: entry.hash };
  }

  const contents = `${JSON.stringify({ lockfileVersion: LOCKFILE_VERSION, skills }, null, 2)}\n`;
  writeFileSync(join(cwd, LOCK_NAME), contents);
}
