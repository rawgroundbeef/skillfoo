import {
  lstatSync,
  readlinkSync,
  readdirSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  normalize,
  posix,
  resolve,
  win32,
} from 'node:path';
import { hashSkillDir, SKIP } from './skilldir.js';

export interface ManagedRemovalCandidate {
  name: string;
  emittedPath: string;
  adapterPath: string;
}

export type ManagedRemovalResult =
  | { status: 'removed' }
  | {
      status: 'blocked';
      reason:
        | 'local changes'
        | 'unrepresented local structure'
        | 'emitted path is not a managed directory'
        | 'adapter ownership cannot be proven';
    };

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function isSafePathSegment(name: string): boolean {
  if (
    name.length === 0 ||
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('\0') ||
    name.includes(':') ||
    /[\u0000-\u001f\u007f]/.test(name) ||
    /[. ]$/.test(name)
  ) {
    return false;
  }

  if (posix.basename(name) !== name || win32.basename(name) !== name) return false;

  const windowsStem = name.split('.')[0]?.toUpperCase();
  return !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(windowsStem ?? '');
}

function directChild(root: string, name: string): string | null {
  const normalizedRoot = normalize(resolve(root));
  const candidate = normalize(resolve(normalizedRoot, name));
  return dirname(candidate) === normalizedRoot ? candidate : null;
}

/**
 * Resolve every lock-derived removal path before any consumer mutation begins.
 * Lock keys are untrusted even though they came from a previously written lockfile.
 */
export function resolveManagedRemovalCandidates(
  cwd: string,
  emitRel: string,
  names: readonly string[],
): ManagedRemovalCandidate[] {
  const emittedRoot = resolve(cwd, emitRel);
  const adapterRoot = resolve(cwd, '.claude', 'skills');

  return names.map((name) => {
    const emittedPath = isSafePathSegment(name) ? directChild(emittedRoot, name) : null;
    const adapterPath = isSafePathSegment(name) ? directChild(adapterRoot, name) : null;
    if (emittedPath === null || adapterPath === null) {
      throw new Error(
        `.skillfoo.lock is corrupt: unsafe managed skill name ${JSON.stringify(name)}; ` +
          'expected one path segment',
      );
    }
    return { name, emittedPath, adapterPath };
  });
}

function inspectDirectoryShape(dir: string): boolean {
  const entries = readdirSync(dir, { withFileTypes: true });
  if (entries.length === 0) return false;

  for (const entry of entries) {
    if (SKIP.has(entry.name)) return false;
    const path = resolve(dir, entry.name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return false;
    if (stat.isDirectory()) {
      if (!inspectDirectoryShape(path)) return false;
    } else if (!stat.isFile()) {
      return false;
    }
  }

  return true;
}

function inspectEmittedPath(path: string, lockedHash: string): ManagedRemovalResult | null {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }

  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    return { status: 'blocked', reason: 'emitted path is not a managed directory' };
  }
  if (!inspectDirectoryShape(path)) {
    return { status: 'blocked', reason: 'unrepresented local structure' };
  }
  if (hashSkillDir(path) !== lockedHash) {
    return { status: 'blocked', reason: 'local changes' };
  }
  return null;
}

function comparablePath(path: string): string {
  let comparable = normalize(path);
  if (process.platform === 'win32') {
    comparable = comparable
      .replace(/^\\\\\?\\UNC\\/i, '\\\\')
      .replace(/^\\\\\?\\/i, '')
      .toLowerCase();
  }
  return comparable;
}

function inspectAdapterPath(path: string, expectedTarget: string): ManagedRemovalResult | null {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }

  if (!stat.isSymbolicLink()) {
    return { status: 'blocked', reason: 'adapter ownership cannot be proven' };
  }

  const target = readlinkSync(path);
  const resolvedTarget = isAbsolute(target) ? normalize(target) : resolve(dirname(path), target);
  if (comparablePath(resolvedTarget) !== comparablePath(expectedTarget)) {
    return { status: 'blocked', reason: 'adapter ownership cannot be proven' };
  }

  return null;
}

/** Preflight both projections and mutate neither unless both ownership checks pass. */
export function removeManagedSkill(
  candidate: ManagedRemovalCandidate,
  lockedHash: string,
): ManagedRemovalResult {
  const emittedBlock = inspectEmittedPath(candidate.emittedPath, lockedHash);
  if (emittedBlock !== null) return emittedBlock;

  const adapterBlock = inspectAdapterPath(candidate.adapterPath, candidate.emittedPath);
  if (adapterBlock !== null) return adapterBlock;

  try {
    unlinkSync(candidate.adapterPath);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  rmSync(candidate.emittedPath, { recursive: true, force: true });
  return { status: 'removed' };
}
