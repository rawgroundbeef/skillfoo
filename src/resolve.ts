import {
  copyFileSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
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
  type AdapterInspection,
} from './adapter.js';
import {
  CONFIG_NAME,
  editOverridePolicy,
  parseConfigContents,
  type SkillfooConfig,
} from './config.js';
import { readSkillDescription, renderTargetAgentsMd } from './emit.js';
import {
  LOCK_NAME,
  parseLockContents,
  renderLock,
  setLockEntry,
  type LockEntry,
  type LockFile,
} from './lockfile.js';
import {
  planReconciliation,
  type ConflictReason,
  type ReconciliationPlan,
  type SkillPlanRecord,
  type SkillState,
} from './plan.js';
import {
  assertMetadataUnchanged,
  atomicReplaceRootMetadata,
  inspectRootMetadata,
  restoreRootMetadata,
  type RootMetadataSnapshot,
} from './root-metadata.js';
import {
  resolveRegistryCatalog,
  type RegistryCatalog,
} from './registry.js';
import { isSafeSkillName } from './skill-name.js';
import { hashSkillDir, walkFiles } from './skilldir.js';
import { statusExitCode } from './status.js';

export type ResolutionOutcomeCode = 0 | 2 | 3;
export type ResolutionDirection = 'take_registry' | 'keep_local';
export type ResolutionAction =
  | 'replaced'
  | 'already_current'
  | 'kept_local'
  | 'already_overridden';

export interface ResolutionResult {
  skill: string;
  direction: ResolutionDirection;
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
  | 'recovery_persisted'
  | 'config_updated'
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
  direction?: ResolutionDirection;
  registryReporter?: (message: string) => void;
  registryCacheRoot?: string;
  hooks?: ResolutionHooks;
}

interface AdapterSnapshot {
  inspection: AdapterInspection;
  identity: AdapterIdentity | null;
  linkTarget: string | null;
}

interface AdapterIdentity {
  device: number;
  inode: number;
  mode: number;
  size: number;
  mtimeMs: number;
  birthtimeMs: number;
}

interface TargetEvidence {
  skill: string;
  direction: ResolutionDirection;
  cwd: string;
  emitRel: string;
  sourceDir: string;
  destinationDir: string;
  previousEntry: LockEntry;
  localHash: string | null;
  registryHash: string;
  sourceAvailable: boolean;
  targetWasMissing: boolean;
  description: string;
  adapter: ClaudeAdapterCandidate;
  adapterBefore: AdapterSnapshot;
  config: SkillfooConfig;
  configBefore: RootMetadataSnapshot;
  lockBefore: RootMetadataSnapshot;
  agentsBefore: RootMetadataSnapshot;
  nextConfig: Buffer;
  nextLock: Buffer;
  nextAgents: Buffer;
  catalog: RegistryCatalog;
  wasOverridden: boolean;
}

interface TransactionState {
  transactionDir: string;
  recoveryDir: string;
  stagedDir: string;
  movedTargetDir: string;
  targetSnapshotDir: string;
  mutationStarted: boolean;
  configAfter: RootMetadataSnapshot | null;
  lockAfter: RootMetadataSnapshot | null;
  agentsAfter: RootMetadataSnapshot | null;
  targetMoved: boolean;
  targetInstalled: boolean;
  targetInstalledIdentity: AdapterIdentity | null;
  adapterAttempted: boolean;
  adapterCreated: boolean;
  adapterIdentity: AdapterIdentity | null;
  adapterAncestors: CreatedAncestor[];
  targetAncestors: CreatedAncestor[];
}

interface CreatedAncestor {
  path: string;
  wasMissing: boolean;
  createdIdentity: AdapterIdentity | null;
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

function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
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

function adapterIdentity(path: string): AdapterIdentity {
  const stat = lstatSync(path);
  return {
    device: stat.dev,
    inode: stat.ino,
    mode: stat.mode,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    birthtimeMs: stat.birthtimeMs,
  };
}

function sameAdapterIdentity(left: AdapterIdentity, right: AdapterIdentity): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.birthtimeMs === right.birthtimeMs
  );
}

function sameNodeIdentity(left: AdapterIdentity, right: AdapterIdentity): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.mode === right.mode &&
    left.birthtimeMs === right.birthtimeMs
  );
}

function inspectAdapterSnapshot(cwd: string, candidate: ClaudeAdapterCandidate): AdapterSnapshot {
  const inspection = inspectClaudeAdapter(cwd, candidate);
  if (!pathExists(candidate.adapterPath)) {
    return { inspection, identity: null, linkTarget: null };
  }
  const stat = lstatSync(candidate.adapterPath);
  return {
    inspection,
    identity: adapterIdentity(candidate.adapterPath),
    linkTarget: stat.isSymbolicLink() ? readlinkSync(candidate.adapterPath) : null,
  };
}

function sameAdapterSnapshot(left: AdapterSnapshot, right: AdapterSnapshot): boolean {
  if (left.inspection.status !== right.inspection.status) return false;
  if (left.identity === null || right.identity === null) return left.identity === right.identity;
  return (
    sameAdapterIdentity(left.identity, right.identity) &&
    left.linkTarget === right.linkTarget
  );
}

function cloneLock(lock: LockFile): LockFile {
  const skills: Record<string, LockEntry> = {};
  for (const [name, entry] of Object.entries(lock.skills)) setLockEntry(skills, name, entry);
  return { lockfileVersion: lock.lockfileVersion, skills };
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

function refusalMessage(
  skill: string,
  direction: ResolutionDirection,
  state: SkillState,
  reason?: ConflictReason,
): string {
  const action = direction === 'keep_local' ? 'keep-local' : 'take-registry';
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
    return `${skill} is not Desired and cannot use ${action}; restore its selection or inspect with skillfoo status`;
  }
  if (state === 'drifted') {
    if (reason === 'override_content_missing') {
      return direction === 'keep_local'
        ? `${skill} is an Override whose repository content is missing; restore safe local content or use --take-registry`
        : `${skill} cannot take the registry because its current source is unavailable`;
    }
    if (reason === 'emitted_path_not_managed_directory') {
      return `${skill} has an unsafe emitted path; restore a real managed directory before using ${action}`;
    }
    return `${skill} has unsupported conflict reason ${reason ?? 'unknown'}; inspect with skillfoo status`;
  }
  if (state === 'override') {
    return `${skill} is a local Override, but its current registry source is missing; restore the source before --take-registry`;
  }
  return `${skill} is not eligible for ${action} resolution`;
}

function assertRootEvidence(evidence: TargetEvidence): void {
  try {
    assertMetadataUnchanged(evidence.configBefore);
    assertMetadataUnchanged(evidence.lockBefore);
    assertMetadataUnchanged(evidence.agentsBefore);
  } catch (error) {
    throw stale(evidence.skill, errorMessage(error));
  }
}

function revalidateTarget(evidence: TargetEvidence): void {
  assertRootEvidence(evidence);
  const config = parseConfigContents(evidence.cwd, evidence.configBefore.contents?.toString('utf8') ?? '');
  const lock = parseLockContents(evidence.lockBefore.contents?.toString('utf8') ?? '');
  const currentEntry = Object.hasOwn(lock.skills, evidence.skill)
    ? lock.skills[evidence.skill]
    : undefined;
  if (
    currentEntry === undefined ||
    currentEntry.source !== evidence.previousEntry.source ||
    currentEntry.hash !== evidence.previousEntry.hash
  ) {
    throw stale(evidence.skill, 'the managed lock baseline changed');
  }
  if (config.registry !== evidence.config.registry || config.emit !== evidence.config.emit) {
    throw stale(evidence.skill, 'project configuration changed after classification');
  }
  if (evidence.targetWasMissing) {
    if (pathExists(evidence.destinationDir)) {
      throw stale(evidence.skill, 'the missing emitted target was repopulated');
    }
  } else {
    if (!realDirectory(evidence.destinationDir)) {
      throw stale(evidence.skill, 'the emitted target is no longer a real directory');
    }
    if (
      evidence.localHash === null ||
      hashSkillDir(evidence.destinationDir) !== evidence.localHash
    ) {
      throw stale(evidence.skill, 'local content changed after classification');
    }
  }
  if (
    evidence.sourceAvailable &&
    (!realDirectory(evidence.sourceDir) || hashSkillDir(evidence.sourceDir) !== evidence.registryHash)
  ) {
    throw stale(evidence.skill, 'registry content changed after classification');
  }
  if (!sameAdapterSnapshot(inspectAdapterSnapshot(evidence.cwd, evidence.adapter), evidence.adapterBefore)) {
    throw stale(evidence.skill, 'target adapter state changed after classification');
  }
}

function makeTransaction(evidence: TargetEvidence): TransactionState {
  const transactionDir = mkdtempSync(join(evidence.cwd, '.skillfoo-resolve-'));
  const recoveryDir = join(transactionDir, 'recovery');
  mkdirSync(recoveryDir);
  return {
    transactionDir,
    recoveryDir,
    stagedDir: join(transactionDir, 'staged'),
    movedTargetDir: join(transactionDir, 'moved-target'),
    targetSnapshotDir: join(recoveryDir, 'target.before'),
    mutationStarted: false,
    configAfter: null,
    lockAfter: null,
    agentsAfter: null,
    targetMoved: false,
    targetInstalled: false,
    targetInstalledIdentity: null,
    adapterAttempted: false,
    adapterCreated: false,
    adapterIdentity: null,
    adapterAncestors: [],
    targetAncestors: [],
  };
}

function missingAncestorSnapshots(cwd: string, targetParent: string): CreatedAncestor[] {
  const missing: CreatedAncestor[] = [];
  let current = targetParent;
  while (current !== cwd && !pathExists(current)) {
    missing.unshift({ path: current, wasMissing: true, createdIdentity: null });
    current = dirname(current);
  }
  return missing;
}

function snapshotDescriptor(snapshot: RootMetadataSnapshot): Record<string, unknown> {
  return {
    path: snapshot.path,
    present: snapshot.contents !== null,
    mode: snapshot.mode,
    identity: snapshot.identity,
  };
}

function persistRecovery(evidence: TargetEvidence, state: TransactionState): void {
  const copySnapshot = (name: string, snapshot: RootMetadataSnapshot): void => {
    if (snapshot.contents !== null) writeFileSync(join(state.recoveryDir, name), snapshot.contents);
  };
  copySnapshot('config.before', evidence.configBefore);
  copySnapshot('lock.before', evidence.lockBefore);
  copySnapshot('AGENTS.before', evidence.agentsBefore);
  if (!evidence.targetWasMissing) {
    cpSync(evidence.destinationDir, state.targetSnapshotDir, {
      recursive: true,
      force: false,
      errorOnExist: true,
      verbatimSymlinks: true,
    });
  }

  const claudeRoot = resolve(evidence.cwd, '.claude');
  state.adapterAncestors = [
    { path: claudeRoot, wasMissing: !pathExists(claudeRoot), createdIdentity: null },
    {
      path: evidence.adapter.adapterRoot,
      wasMissing: !pathExists(evidence.adapter.adapterRoot),
      createdIdentity: null,
    },
  ];
  state.targetAncestors = missingAncestorSnapshots(evidence.cwd, dirname(evidence.destinationDir));
  const manifest = {
    version: 1,
    skill: evidence.skill,
    direction: evidence.direction,
    rootMetadata: {
      config: snapshotDescriptor(evidence.configBefore),
      lock: snapshotDescriptor(evidence.lockBefore),
      agents: snapshotDescriptor(evidence.agentsBefore),
    },
    target: {
      path: evidence.destinationDir,
      missing: evidence.targetWasMissing,
      hash: evidence.localHash,
      snapshot: evidence.targetWasMissing ? null : 'target.before',
    },
    adapter: {
      path: evidence.adapter.adapterPath,
      before: evidence.adapterBefore,
      ancestors: state.adapterAncestors,
    },
    targetAncestors: state.targetAncestors,
  };
  writeFileSync(join(state.recoveryDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function removeEmptyCreatedAncestor(ancestor: CreatedAncestor): void {
  if (ancestor.createdIdentity === null || !pathExists(ancestor.path)) return;
  const current = adapterIdentity(ancestor.path);
  if (!sameNodeIdentity(current, ancestor.createdIdentity)) {
    throw new Error(`${ancestor.path} was replaced while rollback was in progress`);
  }
  try {
    rmdirSync(ancestor.path);
  } catch (error) {
    if (isMissing(error) || isNotEmpty(error)) return;
    throw error;
  }
}

function rollbackAdapter(evidence: TargetEvidence, state: TransactionState): void {
  if (state.adapterCreated) {
    const current = inspectAdapterSnapshot(evidence.cwd, evidence.adapter);
    if (
      current.inspection.status === 'expected' &&
      current.identity !== null &&
      state.adapterIdentity !== null &&
      sameAdapterIdentity(current.identity, state.adapterIdentity)
    ) {
      unlinkSync(evidence.adapter.adapterPath);
    } else if (current.inspection.status !== 'missing') {
      throw new Error('foreign adapter content appeared while rollback was in progress');
    }
  }
  if (!state.adapterAttempted) return;
  for (const ancestor of [...state.adapterAncestors].reverse()) {
    if (ancestor.wasMissing) removeEmptyCreatedAncestor(ancestor);
  }
}

function rollbackTarget(evidence: TargetEvidence, state: TransactionState): void {
  if (!state.targetMoved && !state.targetInstalled) {
    for (const ancestor of [...state.targetAncestors].reverse()) {
      if (ancestor.wasMissing) removeEmptyCreatedAncestor(ancestor);
    }
    return;
  }
  if (!state.targetInstalled) {
    if (!state.targetMoved || !pathExists(state.movedTargetDir)) {
      throw new Error('the moved target recovery entry is missing');
    }
    if (pathExists(evidence.destinationDir)) {
      throw new Error('the target path was repopulated while rollback was in progress');
    }
    renameSync(state.movedTargetDir, evidence.destinationDir);
    return;
  }

  if (!realDirectory(evidence.destinationDir)) {
    throw new Error('the installed target is no longer a real directory');
  }
  if (
    state.targetInstalledIdentity === null ||
    !sameNodeIdentity(adapterIdentity(evidence.destinationDir), state.targetInstalledIdentity)
  ) {
    throw new Error('the installed target was replaced while rollback was in progress');
  }
  if (hashSkillDir(evidence.destinationDir) !== evidence.registryHash) {
    throw new Error('the installed target changed while rollback was in progress');
  }
  rmSync(evidence.destinationDir, { recursive: true, force: true });
  if (evidence.targetWasMissing) {
    for (const ancestor of [...state.targetAncestors].reverse()) {
      if (ancestor.wasMissing) removeEmptyCreatedAncestor(ancestor);
    }
    return;
  }
  if (state.targetMoved && realDirectory(state.movedTargetDir)) {
    renameSync(state.movedTargetDir, evidence.destinationDir);
    return;
  }
  if (!realDirectory(state.targetSnapshotDir)) throw new Error('the target before-snapshot is missing');
  cpSync(state.targetSnapshotDir, evidence.destinationDir, {
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
  if (state.agentsAfter !== null) {
    attempt('AGENTS.md rollback', () => restoreRootMetadata(evidence.agentsBefore, state.agentsAfter!));
  }
  if (state.lockAfter !== null) {
    attempt('lock rollback', () => restoreRootMetadata(evidence.lockBefore, state.lockAfter!));
  }
  attempt('skill rollback', () => rollbackTarget(evidence, state));
  if (state.configAfter !== null) {
    attempt('config rollback', () => restoreRootMetadata(evidence.configBefore, state.configAfter!));
  }

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
  if (!state.mutationStarted) {
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

function reconcileTargetAdapter(evidence: TargetEvidence, state: TransactionState): void {
  const inspection = inspectClaudeAdapter(evidence.cwd, evidence.adapter);
  if (inspection.status !== 'missing') return;
  state.adapterAttempted = true;
  createClaudeAdapter(evidence.adapter);
  state.adapterCreated = true;
  state.adapterIdentity = adapterIdentity(evidence.adapter.adapterPath);
  for (const ancestor of state.adapterAncestors) {
    if (ancestor.wasMissing && pathExists(ancestor.path)) {
      ancestor.createdIdentity = adapterIdentity(ancestor.path);
    }
  }
}

function assertTransactionRootEvidence(evidence: TargetEvidence, state: TransactionState): void {
  try {
    assertMetadataUnchanged(state.configAfter ?? evidence.configBefore);
    assertMetadataUnchanged(state.lockAfter ?? evidence.lockBefore);
    assertMetadataUnchanged(state.agentsAfter ?? evidence.agentsBefore);
  } catch (error) {
    throw stale(evidence.skill, errorMessage(error));
  }
}

function installTarget(
  evidence: TargetEvidence,
  state: TransactionState,
  hooks: ResolutionHooks | undefined,
): void {
  const shouldInstall =
    evidence.targetWasMissing ||
    evidence.localHash === null ||
    evidence.localHash !== evidence.registryHash;
  if (!shouldInstall) return;

  assertTransactionRootEvidence(evidence, state);

  if (!evidence.targetWasMissing) {
    renameSync(evidence.destinationDir, state.movedTargetDir);
    state.targetMoved = true;
    if (
      evidence.localHash === null ||
      !realDirectory(state.movedTargetDir) ||
      hashSkillDir(state.movedTargetDir) !== evidence.localHash
    ) {
      throw stale(evidence.skill, 'local content changed at the replacement boundary');
    }
    hooks?.afterStep?.('target_recovered');
  }
  if (evidence.targetWasMissing && state.targetAncestors.length > 0) {
    mkdirSync(dirname(evidence.destinationDir), { recursive: true });
    for (const ancestor of state.targetAncestors) {
      if (ancestor.wasMissing && pathExists(ancestor.path)) {
        ancestor.createdIdentity = adapterIdentity(ancestor.path);
      }
    }
  }
  if (!realDirectory(evidence.sourceDir) || hashSkillDir(evidence.sourceDir) !== evidence.registryHash) {
    throw stale(evidence.skill, 'registry content changed at the replacement boundary');
  }
  if (!realDirectory(state.stagedDir) || hashSkillDir(state.stagedDir) !== evidence.registryHash) {
    throw stale(evidence.skill, 'the staged registry copy changed at the replacement boundary');
  }
  renameSync(state.stagedDir, evidence.destinationDir);
  state.targetInstalled = true;
  state.targetInstalledIdentity = adapterIdentity(evidence.destinationDir);
  for (const ancestor of state.targetAncestors) {
    if (ancestor.wasMissing && pathExists(ancestor.path)) {
      ancestor.createdIdentity = adapterIdentity(ancestor.path);
    }
  }
  hooks?.afterStep?.('target_installed');
}

function assertPostCondition(evidence: TargetEvidence, plan: ReconciliationPlan): void {
  const target = plan.skills.find((record) => record.name === evidence.skill);
  if (target === undefined) throw new Error('post-resolution plan lost the target skill');
  if (evidence.direction === 'keep_local') {
    if (target.state !== 'override') {
      throw new Error(`post-resolution target is ${target.state}, expected override`);
    }
    const currentAgents = inspectRootMetadata(join(evidence.cwd, 'AGENTS.md'), 'AGENTS.md', false);
    const rendered = Buffer.from(
      renderTargetAgentsMd(
        currentAgents.contents?.toString('utf8') ?? null,
        evidence.emitRel,
        { name: evidence.skill, description: evidence.description, localOverride: true },
      ),
    );
    if (currentAgents.contents === null || !currentAgents.contents.equals(rendered)) {
      throw new Error('post-resolution target AGENTS.md projection is still pending');
    }
  } else if (target.state !== 'unchanged') {
    throw new Error(`post-resolution target is ${target.state}, expected unchanged`);
  }
  const adapter = plan.projections.find(
    (record) => record.kind === 'claude_adapter' && record.skill === evidence.skill,
  );
  if (adapter?.state === 'update') {
    throw new Error('post-resolution target adapter projection is still pending');
  }
}

function executeTransaction(evidence: TargetEvidence, options: ResolutionOptions): ResolutionResult {
  const state = makeTransaction(evidence);
  try {
    if (evidence.direction === 'take_registry') {
      stageSkill(evidence.sourceDir, state.stagedDir);
      if (hashSkillDir(state.stagedDir) !== evidence.registryHash) {
        throw stale(evidence.skill, 'the staged registry copy did not match its source');
      }
    }
    options.hooks?.afterStep?.('staged');
    options.hooks?.beforeRevalidation?.();
    revalidateTarget(evidence);
    if (
      evidence.direction === 'take_registry' &&
      hashSkillDir(state.stagedDir) !== evidence.registryHash
    ) {
      throw stale(evidence.skill, 'the staged registry copy changed before replacement');
    }
    options.hooks?.afterStep?.('revalidated');

    persistRecovery(evidence, state);
    options.hooks?.afterStep?.('recovery_persisted');
    revalidateTarget(evidence);
    state.mutationStarted = true;

    if (!evidence.configBefore.contents?.equals(evidence.nextConfig)) {
      state.configAfter = atomicReplaceRootMetadata(evidence.configBefore, evidence.nextConfig);
    }
    options.hooks?.afterStep?.('config_updated');

    if (evidence.direction === 'take_registry') installTarget(evidence, state, options.hooks);

    assertTransactionRootEvidence(evidence, state);
    if (
      evidence.direction === 'take_registry' &&
      !evidence.lockBefore.contents?.equals(evidence.nextLock)
    ) {
      state.lockAfter = atomicReplaceRootMetadata(evidence.lockBefore, evidence.nextLock);
    }
    options.hooks?.afterStep?.('lock_updated');

    assertTransactionRootEvidence(evidence, state);
    if (!evidence.agentsBefore.contents?.equals(evidence.nextAgents)) {
      state.agentsAfter = atomicReplaceRootMetadata(evidence.agentsBefore, evidence.nextAgents);
    }
    options.hooks?.afterStep?.('agents_updated');

    assertTransactionRootEvidence(evidence, state);
    if (!sameAdapterSnapshot(inspectAdapterSnapshot(evidence.cwd, evidence.adapter), evidence.adapterBefore)) {
      throw stale(evidence.skill, 'target adapter state changed before reconciliation');
    }
    reconcileTargetAdapter(evidence, state);
    options.hooks?.afterStep?.('adapter_reconciled');

    options.hooks?.beforePostPlan?.();
    assertTransactionRootEvidence(evidence, state);
    const postPlan = planReconciliation(evidence.cwd, { registryCatalog: evidence.catalog });
    assertPostCondition(evidence, postPlan);
    options.hooks?.afterStep?.('classified');
    const exitCode = statusExitCode(postPlan);
    rmSync(state.transactionDir, { recursive: true, force: true });
    return {
      skill: evidence.skill,
      direction: evidence.direction,
      action:
        evidence.direction === 'keep_local'
          ? evidence.wasOverridden
            ? 'already_overridden'
            : 'kept_local'
          : 'replaced',
      exitCode,
      plan: postPlan,
    };
  } catch (error) {
    throw transactionFailure(evidence, state, error);
  }
}

function targetEvidence(
  cwd: string,
  skill: string,
  direction: ResolutionDirection,
  config: SkillfooConfig,
  lock: LockFile,
  catalog: RegistryCatalog,
  target: SkillPlanRecord,
  roots: {
    config: RootMetadataSnapshot;
    lock: RootMetadataSnapshot;
    agents: RootMetadataSnapshot;
  },
): TargetEvidence {
  const previousEntry = Object.hasOwn(lock.skills, skill) ? lock.skills[skill] : undefined;
  const sourceDir = join(catalog.directory, skill);
  const registryHash = target.registryHash ?? previousEntry?.hash;
  const destinationDir = target.destinationDir;
  if (
    previousEntry === undefined ||
    registryHash === undefined ||
    destinationDir === undefined ||
    (direction === 'take_registry' && !catalog.skills.includes(skill))
  ) {
    throw new Error(`internal error: eligible resolution evidence is incomplete for ${skill}`);
  }
  const wasOverridden = Object.hasOwn(config.overrides, skill);
  const nextConfigText = editOverridePolicy(
    cwd,
    roots.config.contents?.toString('utf8') ?? '',
    skill,
    direction === 'keep_local',
  );
  const nextLock = cloneLock(lock);
  if (direction === 'take_registry') {
    setLockEntry(nextLock.skills, skill, { source: config.registry, hash: registryHash });
  }
  const description =
    direction === 'keep_local'
      ? readSkillDescription(destinationDir)
      : readSkillDescription(sourceDir);
  const nextAgentsText = renderTargetAgentsMd(
    roots.agents.contents?.toString('utf8') ?? null,
    config.emit,
    {
      name: skill,
      description,
      ...(direction === 'keep_local' ? { localOverride: true } : {}),
    },
  );
  const adapter = resolveClaudeAdapterCandidate(cwd, config.emit, skill);
  return {
    skill,
    direction,
    cwd,
    emitRel: config.emit,
    sourceDir,
    destinationDir,
    previousEntry,
    localHash: target.currentHash ?? null,
    registryHash,
    sourceAvailable: catalog.skills.includes(skill),
    targetWasMissing: target.reason === 'override_content_missing',
    description,
    adapter,
    adapterBefore: inspectAdapterSnapshot(cwd, adapter),
    config,
    configBefore: roots.config,
    lockBefore: roots.lock,
    agentsBefore: roots.agents,
    nextConfig: Buffer.from(nextConfigText),
    nextLock: Buffer.from(renderLock(nextLock)),
    nextAgents: Buffer.from(nextAgentsText),
    catalog,
    wasOverridden,
  };
}

export function resolveSkill(
  cwd: string,
  skill: string,
  options: ResolutionOptions = {},
): ResolutionResult {
  if (!isSafeSkillName(skill)) {
    throw new Error(`unsafe skill name ${JSON.stringify(skill)}; expected one path segment`);
  }
  const direction = options.direction ?? 'take_registry';

  const configBefore = inspectRootMetadata(join(cwd, CONFIG_NAME), CONFIG_NAME, true);
  const lockBefore = inspectRootMetadata(join(cwd, LOCK_NAME), LOCK_NAME, true);
  const agentsBefore = inspectRootMetadata(join(cwd, 'AGENTS.md'), 'AGENTS.md', false);
  const config = parseConfigContents(cwd, configBefore.contents?.toString('utf8') ?? '');
  const lock = parseLockContents(lockBefore.contents?.toString('utf8') ?? '');
  const catalog = resolveRegistryCatalog(config.registry, cwd, {
    ...(options.registryReporter === undefined ? {} : { reporter: options.registryReporter }),
    ...(options.registryCacheRoot === undefined ? {} : { cacheRoot: options.registryCacheRoot }),
  });
  const plan = planReconciliation(cwd, { registryCatalog: catalog, config, lock });
  const target = plan.skills.find((record) => record.name === skill);
  if (target === undefined) {
    throw new ResolutionRefusalError(
      `${skill} is not a Desired Managed skill; inspect the configured selection with skillfoo status`,
      'not_managed',
    );
  }

  const overridden = Object.hasOwn(config.overrides, skill);
  if (direction === 'take_registry' && target.state === 'unchanged' && !overridden) {
    const evidence = targetEvidence(
      cwd,
      skill,
      direction,
      config,
      lock,
      catalog,
      target,
      { config: configBefore, lock: lockBefore, agents: agentsBefore },
    );
    revalidateTarget(evidence);
    return {
      skill,
      direction,
      action: 'already_current',
      exitCode: statusExitCode(plan),
      plan,
    };
  }

  const keepEligible =
    direction === 'keep_local' &&
    ((target.state === 'drifted' && target.reason === 'local_changes') ||
      target.state === 'override');
  const takeEligible =
    direction === 'take_registry' &&
    ((target.state === 'drifted' &&
      (target.reason === 'local_changes' || target.reason === 'override_content_missing')) ||
      target.state === 'override');
  if (!keepEligible && !takeEligible) {
    throw new ResolutionRefusalError(
      refusalMessage(skill, direction, target.state, target.reason),
      target.state,
      target.reason,
    );
  }
  if (takeEligible && !catalog.skills.includes(skill)) {
    throw new ResolutionRefusalError(
      refusalMessage(skill, direction, target.state, target.reason),
      target.state,
      target.reason,
    );
  }

  const evidence = targetEvidence(
    cwd,
    skill,
    direction,
    config,
    lock,
    catalog,
    target,
    { config: configBefore, lock: lockBefore, agents: agentsBefore },
  );

  const targetProjectionCurrent =
    evidence.agentsBefore.contents !== null &&
    evidence.agentsBefore.contents.equals(evidence.nextAgents) &&
    evidence.adapterBefore.inspection.status !== 'missing';
  if (
    direction === 'keep_local' &&
    target.state === 'override' &&
    evidence.configBefore.contents?.equals(evidence.nextConfig) === true &&
    targetProjectionCurrent
  ) {
    revalidateTarget(evidence);
    return {
      skill,
      direction,
      action: 'already_overridden',
      exitCode: statusExitCode(plan),
      plan,
    };
  }

  return executeTransaction(evidence, options);
}
