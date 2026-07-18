import {
  copyFileSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  createClaudeAdapter,
  inspectClaudeAdapter,
  resolveClaudeAdapterCandidate,
  type ClaudeAdapterCandidate,
} from './adapter.js';
import { loadConfig, validateEmitPath } from './config.js';
import { readSkillDescription, renderTargetAgentsMd } from './emit.js';
import {
  compareAndSetLockEntry,
  readLock,
  type LockEntry,
} from './lockfile.js';
import {
  planReconciliation,
  type ConflictReason,
  type ReconciliationPlan,
  type SkillState,
} from './plan.js';
import { resolveRegistryCatalog } from './registry.js';
import { isSafeSkillName } from './skill-name.js';
import { hashSkillDir, walkFiles } from './skilldir.js';
import { statusExitCode } from './status.js';

export type ResolutionOutcomeCode = 0 | 2 | 3;
export type ResolutionAction = 'replaced' | 'already_current';

export interface ResolutionResult {
  skill: string;
  action: ResolutionAction;
  exitCode: ResolutionOutcomeCode;
  plan: ReconciliationPlan;
}

export class ResolutionRefusalError extends Error {
  readonly state: SkillState | 'not_managed';
  readonly reason: ConflictReason | undefined;

  constructor(
    message: string,
    state: SkillState | 'not_managed',
    reason?: ConflictReason,
  ) {
    super(message);
    this.name = 'ResolutionRefusalError';
    this.state = state;
    this.reason = reason;
  }
}

export type ResolutionHookStep =
  | 'staged'
  | 'revalidated'
  | 'target_recovered'
  | 'target_installed'
  | 'lock_updated'
  | 'agents_updated'
  | 'adapter_reconciled'
  | 'classified';

/** Injectable only at the command-service boundary for deterministic failure tests. */
export interface ResolutionHooks {
  beforeRevalidation?(): void;
  afterStep?(step: ResolutionHookStep): void;
  beforePostPlan?(): void;
}

export interface ResolutionOptions {
  registryReporter?: (message: string) => void;
  registryCacheRoot?: string;
  hooks?: ResolutionHooks;
}

interface TargetEvidence {
  skill: string;
  cwd: string;
  emitRoot: string;
  sourceDir: string;
  destinationDir: string;
  previousEntry: LockEntry;
  canonicalEntry: LockEntry;
  localHash: string;
  registryHash: string;
  emitRel: string;
  registryDescription: string;
  adapter: ClaudeAdapterCandidate;
}

interface OptionalFileSnapshot {
  path: string;
  contents: Buffer | null;
}

interface TransactionState {
  transactionDir: string;
  stagedDir: string;
  recoveryDir: string;
  agentsBefore: OptionalFileSnapshot;
  agentsAfter: Buffer | null;
  targetMoved: boolean;
  targetInstalled: boolean;
  lockAttempted: boolean;
  agentsAttempted: boolean;
  adapterAttempted: boolean;
  adapterCreated: boolean;
  adapterIdentity: AdapterIdentity | null;
  adapterAncestors: Array<{ path: string; wasMissing: boolean }>;
}

interface AdapterIdentity {
  device: number;
  inode: number;
  mode: number;
  birthtimeMs: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function isNotEmpty(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    ['ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')
  );
}

function entriesEqual(left: LockEntry | undefined, right: LockEntry): boolean {
  return left !== undefined && left.source === right.source && left.hash === right.hash;
}

function readOptionalFile(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function buffersEqual(left: Buffer | null, right: Buffer | null): boolean {
  if (left === null || right === null) return left === right;
  return left.equals(right);
}

function realDirectory(path: string): boolean {
  try {
    const stat = lstatSync(path);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function adapterIdentity(path: string): AdapterIdentity {
  const stat = lstatSync(path);
  return {
    device: stat.dev,
    inode: stat.ino,
    mode: stat.mode,
    birthtimeMs: stat.birthtimeMs,
  };
}

function sameAdapterIdentity(left: AdapterIdentity, right: AdapterIdentity): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.mode === right.mode &&
    left.birthtimeMs === right.birthtimeMs
  );
}

function stageSkill(sourceDir: string, stagedDir: string): void {
  mkdirSync(stagedDir);
  for (const relativePath of walkFiles(sourceDir)) {
    const destination = join(stagedDir, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(sourceDir, relativePath), destination);
  }
}

function stale(skill: string, detail: string): Error {
  return new Error(`stale evidence for ${skill}: ${detail}; inspect with skillfoo status and retry`);
}

function revalidateTarget(evidence: TargetEvidence, agentsBefore: OptionalFileSnapshot): void {
  const lock = readLock(evidence.cwd);
  const currentEntry = Object.hasOwn(lock.skills, evidence.skill)
    ? lock.skills[evidence.skill]
    : undefined;
  if (!entriesEqual(currentEntry, evidence.previousEntry)) {
    throw stale(evidence.skill, 'the managed lock baseline changed');
  }
  if (!realDirectory(evidence.destinationDir)) {
    throw stale(evidence.skill, 'the emitted target is no longer a real directory');
  }
  if (hashSkillDir(evidence.destinationDir) !== evidence.localHash) {
    throw stale(evidence.skill, 'local content changed after classification');
  }
  if (hashSkillDir(evidence.sourceDir) !== evidence.registryHash) {
    throw stale(evidence.skill, 'registry content changed after classification');
  }
  if (!buffersEqual(readOptionalFile(agentsBefore.path), agentsBefore.contents)) {
    throw stale(evidence.skill, 'AGENTS.md changed after classification');
  }
}

function refusalMessage(skill: string, state: SkillState, reason?: ConflictReason): string {
  if (state === 'lock_update') {
    return `${skill} only needs a safe lock metadata update; run skillfoo sync`;
  }
  if (state === 'add' || state === 'update' || state === 'remove') {
    return `${skill} has a safe pending ${state}; run skillfoo sync instead`;
  }
  if (state === 'blocked') {
    return `${skill} is not a Managed skill at the desired path; preserve or remove the Bespoke content before ordinary sync`;
  }
  if (state === 'removal_blocked') {
    return `${skill} is not Desired and cannot be resolved by taking the registry; restore its selection or inspect with skillfoo status`;
  }
  if (state === 'drifted') {
    return `${skill} has unsupported conflict reason ${reason ?? 'unknown'}; inspect with skillfoo status`;
  }
  return `${skill} is not eligible for take-registry resolution`;
}

function restoreAgents(state: TransactionState): void {
  if (!state.agentsAttempted || state.agentsAfter === null) return;
  const current = readOptionalFile(state.agentsBefore.path);
  if (buffersEqual(current, state.agentsBefore.contents)) return;
  if (!buffersEqual(current, state.agentsAfter)) {
    throw new Error('AGENTS.md changed while rollback was in progress');
  }
  if (state.agentsBefore.contents === null) {
    unlinkSync(state.agentsBefore.path);
  } else {
    writeFileSync(state.agentsBefore.path, state.agentsBefore.contents);
  }
}

function restoreLock(evidence: TargetEvidence, state: TransactionState): void {
  if (!state.lockAttempted) return;
  const lock = readLock(evidence.cwd);
  const current = Object.hasOwn(lock.skills, evidence.skill)
    ? lock.skills[evidence.skill]
    : undefined;
  if (entriesEqual(current, evidence.previousEntry)) return;
  if (!entriesEqual(current, evidence.canonicalEntry)) {
    throw new Error('the target lock entry changed while rollback was in progress');
  }
  compareAndSetLockEntry(
    evidence.cwd,
    evidence.skill,
    evidence.canonicalEntry,
    evidence.previousEntry,
  );
}

function removeEmptyCreatedAncestor(path: string): void {
  try {
    rmdirSync(path);
  } catch (error) {
    if (isMissing(error) || isNotEmpty(error)) return;
    throw error;
  }
}

function rollbackAdapter(evidence: TargetEvidence, state: TransactionState): void {
  if (state.adapterCreated) {
    const inspection = inspectClaudeAdapter(evidence.cwd, evidence.adapter);
    if (inspection.status === 'expected') {
      if (
        state.adapterIdentity === null ||
        !sameAdapterIdentity(adapterIdentity(evidence.adapter.adapterPath), state.adapterIdentity)
      ) {
        throw new Error('the transaction-created adapter was replaced while rollback was in progress');
      }
      unlinkSync(evidence.adapter.adapterPath);
    } else if (inspection.status !== 'missing') {
      throw new Error('foreign adapter content appeared while rollback was in progress');
    }
  }
  if (!state.adapterAttempted) return;
  for (const ancestor of [...state.adapterAncestors].reverse()) {
    if (ancestor.wasMissing) removeEmptyCreatedAncestor(ancestor.path);
  }
}

function restoreTarget(evidence: TargetEvidence, state: TransactionState): void {
  if (!state.targetMoved) return;
  if (!state.targetInstalled) {
    if (!pathExists(state.recoveryDir)) throw new Error('the moved target recovery entry is missing');
    if (pathExists(evidence.destinationDir)) {
      throw new Error('the target path was repopulated while rollback was in progress');
    }
    renameSync(state.recoveryDir, evidence.destinationDir);
    return;
  }

  if (!realDirectory(state.recoveryDir)) throw new Error('the recovery copy is missing');
  if (!realDirectory(evidence.destinationDir)) {
    throw new Error('the installed target is no longer a real directory');
  }
  if (hashSkillDir(evidence.destinationDir) !== evidence.registryHash) {
    throw new Error('the installed target changed while rollback was in progress');
  }
  rmSync(evidence.destinationDir, { recursive: true, force: true });
  cpSync(state.recoveryDir, evidence.destinationDir, {
    recursive: true,
    force: false,
    errorOnExist: true,
    verbatimSymlinks: true,
  });
}

function rollback(evidence: TargetEvidence, state: TransactionState): string[] {
  const failures: string[] = [];
  const attempt = (label: string, operation: () => void): void => {
    try {
      operation();
    } catch (error) {
      failures.push(`${label}: ${errorMessage(error)}`);
    }
  };

  attempt('adapter rollback', () => rollbackAdapter(evidence, state));
  attempt('AGENTS.md rollback', () => restoreAgents(state));
  attempt('lock rollback', () => restoreLock(evidence, state));
  attempt('skill rollback', () => restoreTarget(evidence, state));

  if (failures.length === 0) {
    attempt('transaction cleanup', () => rmSync(state.transactionDir, { recursive: true, force: true }));
  }
  return failures;
}

function transactionFailure(
  evidence: TargetEvidence,
  state: TransactionState,
  error: unknown,
): Error {
  if (!state.targetMoved) {
    try {
      rmSync(state.transactionDir, { recursive: true, force: true });
    } catch (cleanupError) {
      return new Error(
        `resolution failed for ${evidence.skill}: ${errorMessage(error)}; ` +
          `staging cleanup also failed: ${errorMessage(cleanupError)}`,
      );
    }
    return new Error(`resolution failed for ${evidence.skill}: ${errorMessage(error)}`);
  }

  const rollbackFailures = rollback(evidence, state);
  if (rollbackFailures.length === 0) {
    return new Error(
      `resolution failed for ${evidence.skill}: ${errorMessage(error)}; previous state restored`,
    );
  }
  return new Error(
    `resolution failed for ${evidence.skill}: ${errorMessage(error)}; rollback incomplete ` +
      `(${rollbackFailures.join('; ')}); recovery data preserved at ${state.recoveryDir}`,
  );
}

function makeTransaction(evidence: TargetEvidence): TransactionState {
  const agentsBefore = {
    path: join(evidence.cwd, 'AGENTS.md'),
    contents: readOptionalFile(join(evidence.cwd, 'AGENTS.md')),
  };
  const transactionDir = mkdtempSync(join(evidence.emitRoot, '.skillfoo-resolve-'));
  return {
    transactionDir,
    stagedDir: join(transactionDir, 'staged'),
    recoveryDir: join(transactionDir, 'recovery'),
    agentsBefore,
    agentsAfter: null,
    targetMoved: false,
    targetInstalled: false,
    lockAttempted: false,
    agentsAttempted: false,
    adapterAttempted: false,
    adapterCreated: false,
    adapterIdentity: null,
    adapterAncestors: [],
  };
}

function updateTargetAgents(evidence: TargetEvidence, state: TransactionState): void {
  const current = readOptionalFile(state.agentsBefore.path);
  if (!buffersEqual(current, state.agentsBefore.contents)) {
    throw stale(evidence.skill, 'AGENTS.md changed before its target row could be updated');
  }
  const next = Buffer.from(
    renderTargetAgentsMd(
      state.agentsBefore.contents?.toString('utf8') ?? null,
      evidence.emitRel,
      { name: evidence.skill, description: evidence.registryDescription },
    ),
  );
  if (buffersEqual(next, state.agentsBefore.contents)) return;
  state.agentsAfter = next;
  state.agentsAttempted = true;
  writeFileSync(state.agentsBefore.path, next);
}

function reconcileTargetAdapter(evidence: TargetEvidence, state: TransactionState): void {
  const inspection = inspectClaudeAdapter(evidence.cwd, evidence.adapter);
  if (inspection.status !== 'missing') return;

  const claudeRoot = resolve(evidence.cwd, '.claude');
  state.adapterAncestors = [
    { path: claudeRoot, wasMissing: !pathExists(claudeRoot) },
    { path: evidence.adapter.adapterRoot, wasMissing: !pathExists(evidence.adapter.adapterRoot) },
  ];
  state.adapterAttempted = true;
  createClaudeAdapter(evidence.adapter);
  state.adapterCreated = true;
  state.adapterIdentity = adapterIdentity(evidence.adapter.adapterPath);
}

function executeTransaction(
  evidence: TargetEvidence,
  catalog: ReturnType<typeof resolveRegistryCatalog>,
  options: ResolutionOptions,
): ResolutionResult {
  const state = makeTransaction(evidence);
  try {
    stageSkill(evidence.sourceDir, state.stagedDir);
    if (hashSkillDir(state.stagedDir) !== evidence.registryHash) {
      throw stale(evidence.skill, 'the staged registry copy did not match its source');
    }
    options.hooks?.afterStep?.('staged');
    options.hooks?.beforeRevalidation?.();
    revalidateTarget(evidence, state.agentsBefore);
    if (hashSkillDir(state.stagedDir) !== evidence.registryHash) {
      throw stale(evidence.skill, 'the staged registry copy changed before replacement');
    }
    options.hooks?.afterStep?.('revalidated');

    renameSync(evidence.destinationDir, state.recoveryDir);
    state.targetMoved = true;
    options.hooks?.afterStep?.('target_recovered');
    if (!realDirectory(state.recoveryDir) || hashSkillDir(state.recoveryDir) !== evidence.localHash) {
      throw stale(evidence.skill, 'local content changed at the replacement boundary');
    }
    if (hashSkillDir(evidence.sourceDir) !== evidence.registryHash) {
      throw stale(evidence.skill, 'registry content changed at the replacement boundary');
    }
    if (hashSkillDir(state.stagedDir) !== evidence.registryHash) {
      throw stale(evidence.skill, 'the staged registry copy changed at the replacement boundary');
    }
    renameSync(state.stagedDir, evidence.destinationDir);
    state.targetInstalled = true;
    options.hooks?.afterStep?.('target_installed');

    state.lockAttempted = true;
    compareAndSetLockEntry(
      evidence.cwd,
      evidence.skill,
      evidence.previousEntry,
      evidence.canonicalEntry,
    );
    options.hooks?.afterStep?.('lock_updated');

    updateTargetAgents(evidence, state);
    options.hooks?.afterStep?.('agents_updated');
    reconcileTargetAdapter(evidence, state);
    options.hooks?.afterStep?.('adapter_reconciled');

    options.hooks?.beforePostPlan?.();
    const postPlan = planReconciliation(evidence.cwd, { registryCatalog: catalog });
    options.hooks?.afterStep?.('classified');
    const exitCode = statusExitCode(postPlan);
    rmSync(state.transactionDir, { recursive: true, force: true });
    return { skill: evidence.skill, action: 'replaced', exitCode, plan: postPlan };
  } catch (error) {
    throw transactionFailure(evidence, state, error);
  }
}

export function resolveSkill(
  cwd: string,
  skill: string,
  options: ResolutionOptions = {},
): ResolutionResult {
  if (!isSafeSkillName(skill)) {
    throw new Error(`unsafe skill name ${JSON.stringify(skill)}; expected one path segment`);
  }

  const config = loadConfig(cwd);
  const catalog = resolveRegistryCatalog(config.registry, cwd, {
    ...(options.registryReporter === undefined ? {} : { reporter: options.registryReporter }),
    ...(options.registryCacheRoot === undefined ? {} : { cacheRoot: options.registryCacheRoot }),
  });
  const plan = planReconciliation(cwd, { registryCatalog: catalog });
  const target = plan.skills.find((record) => record.name === skill);
  if (target === undefined) {
    throw new ResolutionRefusalError(
      `${skill} is not a Desired Managed skill; inspect the configured selection with skillfoo status`,
      'not_managed',
    );
  }

  if (target.state === 'unchanged') {
    return { skill, action: 'already_current', exitCode: statusExitCode(plan), plan };
  }
  if (target.state !== 'drifted' || target.reason !== 'local_changes') {
    throw new ResolutionRefusalError(
      refusalMessage(skill, target.state, target.reason),
      target.state,
      target.reason,
    );
  }
  if (
    target.previousEntry === undefined ||
    target.sourceDir === undefined ||
    target.destinationDir === undefined ||
    target.registryHash === undefined ||
    target.currentHash === undefined
  ) {
    throw new Error(`internal error: eligible resolution evidence is incomplete for ${skill}`);
  }

  const emitRoot = validateEmitPath(cwd, config.emit);
  const evidence: TargetEvidence = {
    skill,
    cwd,
    emitRoot,
    sourceDir: target.sourceDir,
    destinationDir: target.destinationDir,
    previousEntry: target.previousEntry,
    canonicalEntry: { source: config.registry, hash: target.registryHash },
    localHash: target.currentHash,
    registryHash: target.registryHash,
    emitRel: config.emit,
    registryDescription: readSkillDescription(target.sourceDir),
    adapter: resolveClaudeAdapterCandidate(cwd, config.emit, skill),
  };

  return executeTransaction(evidence, catalog, options);
}
