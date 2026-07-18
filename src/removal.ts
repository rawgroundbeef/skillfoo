import { lstatSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  inspectClaudeAdapter,
  removeClaudeAdapter,
  resolveClaudeAdapterCandidate,
  type ClaudeAdapterCandidate,
} from './adapter.js';
import { assertSafeSkillName } from './skill-name.js';
import { hashSkillDir, SKIP } from './skilldir.js';

export interface ManagedRemovalCandidate extends ClaudeAdapterCandidate {
  cwd: string;
}

export type RemovalConflictReason =
  | 'local_changes'
  | 'unrepresented_local_structure'
  | 'emitted_path_not_managed_directory'
  | 'adapter_ownership_unproven';

export type ManagedRemovalInspection =
  | { status: 'safe' }
  | { status: 'blocked'; reason: RemovalConflictReason };

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

/** Resolve every lock-derived path before any consumer mutation begins. */
export function resolveManagedRemovalCandidates(
  cwd: string,
  emitRel: string,
  names: readonly string[],
): ManagedRemovalCandidate[] {
  return names.map((name) => {
    assertSafeSkillName(name, 'lock');
    return { cwd, ...resolveClaudeAdapterCandidate(cwd, emitRel, name) };
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

function inspectEmittedPath(
  path: string,
  lockedHash: string,
): ManagedRemovalInspection | null {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }

  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    return { status: 'blocked', reason: 'emitted_path_not_managed_directory' };
  }
  if (!inspectDirectoryShape(path)) {
    return { status: 'blocked', reason: 'unrepresented_local_structure' };
  }
  if (hashSkillDir(path) !== lockedHash) {
    return { status: 'blocked', reason: 'local_changes' };
  }
  return null;
}

/** Inspect both owned projections without mutating either one. */
export function inspectManagedRemoval(
  candidate: ManagedRemovalCandidate,
  lockedHash: string,
): ManagedRemovalInspection {
  const emittedBlock = inspectEmittedPath(candidate.emittedPath, lockedHash);
  if (emittedBlock !== null) return emittedBlock;

  const adapter = inspectClaudeAdapter(candidate.cwd, candidate);
  if (adapter.status === 'foreign' || adapter.status === 'unsafe_ancestor') {
    return { status: 'blocked', reason: 'adapter_ownership_unproven' };
  }
  return { status: 'safe' };
}

/** Execute a candidate only after inspectManagedRemoval returned safe. */
export function executeManagedRemoval(candidate: ManagedRemovalCandidate): void {
  removeClaudeAdapter(candidate);
  rmSync(candidate.emittedPath, { recursive: true, force: true });
}

const LEGACY_REASON: Record<RemovalConflictReason, ManagedRemovalResult & { status: 'blocked' }> = {
  local_changes: { status: 'blocked', reason: 'local changes' },
  unrepresented_local_structure: {
    status: 'blocked',
    reason: 'unrepresented local structure',
  },
  emitted_path_not_managed_directory: {
    status: 'blocked',
    reason: 'emitted path is not a managed directory',
  },
  adapter_ownership_unproven: {
    status: 'blocked',
    reason: 'adapter ownership cannot be proven',
  },
};

/** Backward-compatible inspect-and-execute wrapper. */
export function removeManagedSkill(
  candidate: ManagedRemovalCandidate,
  lockedHash: string,
): ManagedRemovalResult {
  const inspection = inspectManagedRemoval(candidate, lockedHash);
  if (inspection.status === 'blocked') return LEGACY_REASON[inspection.reason];
  executeManagedRemoval(candidate);
  return { status: 'removed' };
}
