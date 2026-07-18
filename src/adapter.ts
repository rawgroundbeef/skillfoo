import {
  lstatSync,
  mkdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, normalize, relative, resolve } from 'node:path';
import { directChild } from './skill-name.js';

export interface ClaudeAdapterCandidate {
  name: string;
  emittedPath: string;
  adapterPath: string;
  adapterRoot: string;
}

export type AdapterInspection =
  | { status: 'missing' }
  | { status: 'expected' }
  | { status: 'foreign' }
  | { status: 'unsafe_ancestor' };

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
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

function inspectRealDirectory(path: string): 'missing' | 'directory' | 'unsafe' {
  try {
    const stat = lstatSync(path);
    return !stat.isSymbolicLink() && stat.isDirectory() ? 'directory' : 'unsafe';
  } catch (error) {
    if (isMissing(error)) return 'missing';
    throw error;
  }
}

export function resolveClaudeAdapterCandidate(
  cwd: string,
  emitRel: string,
  name: string,
): ClaudeAdapterCandidate {
  const emittedRoot = resolve(cwd, emitRel);
  const adapterRoot = resolve(cwd, '.claude', 'skills');
  return {
    name,
    emittedPath: directChild(emittedRoot, name),
    adapterPath: directChild(adapterRoot, name),
    adapterRoot,
  };
}

export function inspectClaudeAdapter(
  cwd: string,
  candidate: ClaudeAdapterCandidate,
): AdapterInspection {
  const claudeRoot = resolve(cwd, '.claude');
  const claudeState = inspectRealDirectory(claudeRoot);
  if (claudeState === 'unsafe') return { status: 'unsafe_ancestor' };
  if (claudeState === 'missing') return { status: 'missing' };

  const skillsState = inspectRealDirectory(candidate.adapterRoot);
  if (skillsState === 'unsafe') return { status: 'unsafe_ancestor' };
  if (skillsState === 'missing') return { status: 'missing' };

  let stat;
  try {
    stat = lstatSync(candidate.adapterPath);
  } catch (error) {
    if (isMissing(error)) return { status: 'missing' };
    throw error;
  }

  if (!stat.isSymbolicLink()) return { status: 'foreign' };

  const target = readlinkSync(candidate.adapterPath);
  const resolvedTarget = isAbsolute(target)
    ? normalize(target)
    : resolve(dirname(candidate.adapterPath), target);
  return comparablePath(resolvedTarget) === comparablePath(candidate.emittedPath)
    ? { status: 'expected' }
    : { status: 'foreign' };
}

export function createClaudeAdapter(candidate: ClaudeAdapterCandidate): void {
  mkdirSync(candidate.adapterRoot, { recursive: true });
  const relativeTarget = relative(candidate.adapterRoot, candidate.emittedPath);
  const target = process.platform === 'win32' ? candidate.emittedPath : relativeTarget;
  symlinkSync(target, candidate.adapterPath, process.platform === 'win32' ? 'junction' : 'dir');
}

export function removeClaudeAdapter(candidate: ClaudeAdapterCandidate): void {
  try {
    unlinkSync(candidate.adapterPath);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}
