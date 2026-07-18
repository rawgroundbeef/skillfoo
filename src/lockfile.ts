import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const LOCK_NAME = '.skillfoo.lock';
const LOCKFILE_VERSION = 1;

export interface LockEntry {
  source: string;
  hash: string;
}

export interface LockFile {
  lockfileVersion: number;
  skills: Record<string, LockEntry>;
}

export function setLockEntry(
  skills: Record<string, LockEntry>,
  name: string,
  entry: LockEntry,
): void {
  Object.defineProperty(skills, name, {
    value: entry,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function readLock(cwd: string): LockFile {
  const path = join(cwd, LOCK_NAME);
  if (!existsSync(path)) {
    return { lockfileVersion: LOCKFILE_VERSION, skills: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${LOCK_NAME} is corrupt: ${errorMessage(error)}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`${LOCK_NAME} is corrupt: expected a JSON object`);
  }

  const version = parsed.lockfileVersion ?? LOCKFILE_VERSION;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error(`${LOCK_NAME} is corrupt: "lockfileVersion" must be a positive integer`);
  }
  if (version > LOCKFILE_VERSION) {
    throw new Error(`${LOCK_NAME} was written by a newer skillfoo; upgrade`);
  }

  const rawSkills = parsed.skills ?? {};
  if (!isRecord(rawSkills)) {
    throw new Error(`${LOCK_NAME} is corrupt: "skills" must be an object`);
  }

  const skills: Record<string, LockEntry> = {};
  for (const [name, value] of Object.entries(rawSkills)) {
    if (!isRecord(value)) {
      throw new Error(`${LOCK_NAME} is corrupt: skills["${name}"] must be an object`);
    }
    if (typeof value.hash !== 'string' || !value.hash) {
      throw new Error(`${LOCK_NAME} is corrupt: skills["${name}"].hash is missing or empty`);
    }
    setLockEntry(skills, name, {
      source: typeof value.source === 'string' ? value.source : '',
      hash: value.hash,
    });
  }

  return { lockfileVersion: version, skills };
}

export function writeLock(cwd: string, lock: LockFile): void {
  const skills: Record<string, LockEntry> = {};
  for (const name of Object.keys(lock.skills).sort()) {
    const entry = lock.skills[name];
    if (entry !== undefined) setLockEntry(skills, name, entry);
  }

  const contents = `${JSON.stringify({ lockfileVersion: LOCKFILE_VERSION, skills }, null, 2)}\n`;
  writeFileSync(join(cwd, LOCK_NAME), contents);
}
