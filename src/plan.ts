import {
  lstatSync,
  readFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import {
  inspectClaudeAdapter,
  resolveClaudeAdapterCandidate,
  type ClaudeAdapterCandidate,
} from './adapter.js';
import { CONFIG_NAME, loadConfig, type SkillfooConfig } from './config.js';
import {
  readSkillDescription,
  renderAgentsMd,
  type DescribedSkill,
} from './emit.js';
import { readLock, setLockEntry, type LockEntry, type LockFile } from './lockfile.js';
import {
  inspectManagedRemoval,
  resolveManagedRemovalCandidates,
  type ManagedRemovalCandidate,
} from './removal.js';
import {
  resolveRegistryCatalog,
  type RegistryCatalog,
} from './registry.js';
import {
  assertSafeSkillName,
  directChild,
  normalizeDesiredNames,
} from './skill-name.js';
import { hashSkillDir, walkFiles } from './skilldir.js';

export type SkillState =
  | 'unchanged'
  | 'override'
  | 'add'
  | 'update'
  | 'lock_update'
  | 'remove'
  | 'drifted'
  | 'blocked'
  | 'removal_blocked';

export type ProjectionState = 'unchanged' | 'update' | 'blocked';

export type ConflictReason =
  | 'local_changes'
  | 'override_content_missing'
  | 'unmanaged_destination'
  | 'unrepresented_local_structure'
  | 'emitted_path_not_managed_directory'
  | 'adapter_ownership_unproven';

export type ReconciliationOutcome =
  | 'converged'
  | 'changes_available'
  | 'attention_required';

export interface SkillPlanRecord {
  name: string;
  state: SkillState;
  reason?: ConflictReason;
  fileCount: number;
  sourceDir?: string;
  destinationDir?: string;
  registryHash?: string;
  currentHash?: string;
  nextEntry?: LockEntry;
  previousEntry?: LockEntry;
  removalCandidate?: ManagedRemovalCandidate;
  registryState?: 'unchanged' | 'changed' | 'missing';
}

export interface AgentsMdProjection {
  kind: 'agents_md';
  state: 'unchanged' | 'update';
  currentContents: string | null;
  nextContents: string | null;
}

export interface ClaudeAdapterProjection {
  kind: 'claude_adapter';
  skill: string;
  state: ProjectionState;
  reason?: 'unmanaged_destination' | 'adapter_ownership_unproven';
  candidate: ClaudeAdapterCandidate;
}

export type ProjectionPlanRecord = AgentsMdProjection | ClaudeAdapterProjection;

export interface SectionSummary {
  unchanged: number;
  changes: number;
  conflicts: number;
}

export interface SkillSectionSummary extends SectionSummary {
  overrides: number;
}

export interface ReconciliationSummary {
  skills: SkillSectionSummary;
  projections: SectionSummary;
}

export interface ReconciliationPlan {
  config: SkillfooConfig;
  registryDir: string;
  outcome: ReconciliationOutcome;
  skills: SkillPlanRecord[];
  projections: ProjectionPlanRecord[];
  summary: ReconciliationSummary;
  nextLock: LockFile;
  activeSkills: DescribedSkill[];
  retainedSkills: DescribedSkill[];
  preservedSkillNames: string[];
}

export interface PlanOptions {
  registryReporter?: (message: string) => void;
  registryCacheRoot?: string;
  registryCatalog?: RegistryCatalog;
  config?: SkillfooConfig;
  lock?: LockFile;
}

const SKILL_CHANGES = new Set<SkillState>(['add', 'update', 'lock_update', 'remove']);

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

type DestinationShape = 'missing' | 'directory' | 'other';

function inspectDestination(path: string): DestinationShape {
  try {
    const stat = lstatSync(path);
    return !stat.isSymbolicLink() && stat.isDirectory() ? 'directory' : 'other';
  } catch (error) {
    if (isMissing(error)) return 'missing';
    throw error;
  }
}

function localDescription(path: string): string {
  return inspectDestination(path) === 'directory' ? readSkillDescription(path) : '';
}

function currentAgentsMd(cwd: string): string | null {
  const path = join(cwd, 'AGENTS.md');
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function summarizeSkills(records: readonly SkillPlanRecord[]): SkillSectionSummary {
  const summary: SkillSectionSummary = { unchanged: 0, overrides: 0, changes: 0, conflicts: 0 };
  for (const record of records) {
    if (record.state === 'unchanged') summary.unchanged++;
    else if (record.state === 'override') summary.overrides++;
    else if (SKILL_CHANGES.has(record.state)) summary.changes++;
    else summary.conflicts++;
  }
  return summary;
}

function summarizeProjections(records: readonly ProjectionPlanRecord[]): SectionSummary {
  const summary: SectionSummary = { unchanged: 0, changes: 0, conflicts: 0 };
  for (const record of records) {
    if (record.state === 'unchanged') summary.unchanged++;
    else if (record.state === 'update') summary.changes++;
    else summary.conflicts++;
  }
  return summary;
}

function deriveOutcome(summary: ReconciliationSummary): ReconciliationOutcome {
  if (summary.skills.conflicts + summary.projections.conflicts > 0) {
    return 'attention_required';
  }
  if (summary.skills.changes + summary.projections.changes > 0) {
    return 'changes_available';
  }
  return 'converged';
}

function desiredRecord(
  name: string,
  registryDir: string,
  emitRoot: string,
  configuredSource: string,
  previousEntry: LockEntry | undefined,
  overridden: boolean,
  sourceAvailable: boolean,
): { record: SkillPlanRecord; description?: DescribedSkill } {
  const sourceDir = join(registryDir, name);
  const destinationDir = directChild(emitRoot, name);
  const registryHash = sourceAvailable ? hashSkillDir(sourceDir) : undefined;
  const fileCount = sourceAvailable ? walkFiles(sourceDir).length : 0;
  const canonicalEntry: LockEntry | undefined =
    registryHash === undefined ? undefined : { source: configuredSource, hash: registryHash };
  const shape = inspectDestination(destinationDir);

  if (overridden) {
    if (previousEntry === undefined) {
      throw new Error(`${CONFIG_NAME} override for ${name} has no Managed ownership in .skillfoo.lock`);
    }
    const registryState =
      registryHash === undefined
        ? 'missing'
        : previousEntry.source === configuredSource && previousEntry.hash === registryHash
          ? 'unchanged'
          : 'changed';
    if (shape === 'missing') {
      return {
        record: {
          name,
          state: 'drifted',
          reason: 'override_content_missing',
          fileCount,
          ...(sourceAvailable ? { sourceDir } : {}),
          destinationDir,
          ...(registryHash === undefined ? {} : { registryHash }),
          nextEntry: previousEntry,
          previousEntry,
        },
      };
    }
    if (shape === 'other') {
      return {
        record: {
          name,
          state: 'drifted',
          reason: 'emitted_path_not_managed_directory',
          fileCount,
          ...(sourceAvailable ? { sourceDir } : {}),
          destinationDir,
          ...(registryHash === undefined ? {} : { registryHash }),
          nextEntry: previousEntry,
          previousEntry,
        },
      };
    }
    const currentHash = hashSkillDir(destinationDir);
    return {
      record: {
        name,
        state: 'override',
        fileCount: walkFiles(destinationDir).length,
        ...(sourceAvailable ? { sourceDir } : {}),
        destinationDir,
        ...(registryHash === undefined ? {} : { registryHash }),
        currentHash,
        nextEntry: previousEntry,
        previousEntry,
        registryState,
      },
      description: {
        name,
        description: readSkillDescription(destinationDir),
        localOverride: true,
      },
    };
  }

  if (!sourceAvailable || registryHash === undefined || canonicalEntry === undefined) {
    throw new Error(`internal error: desired registry source for ${name} is missing`);
  }

  if (previousEntry === undefined && shape !== 'missing') {
    return {
      record: {
        name,
        state: 'blocked',
        reason: 'unmanaged_destination',
        fileCount,
        sourceDir,
        destinationDir,
        registryHash,
      },
    };
  }

  if (shape === 'missing') {
    return {
      record: {
        name,
        state: 'add',
        fileCount,
        sourceDir,
        destinationDir,
        registryHash,
        nextEntry: canonicalEntry,
        ...(previousEntry === undefined ? {} : { previousEntry }),
      },
      description: { name, description: readSkillDescription(sourceDir) },
    };
  }

  if (shape === 'other') {
    if (previousEntry === undefined) {
      throw new Error(`internal error: blocked destination for ${name} lost its classification`);
    }
    return {
      record: {
        name,
        state: 'drifted',
        reason: 'emitted_path_not_managed_directory',
        fileCount,
        sourceDir,
        destinationDir,
        registryHash,
        nextEntry: previousEntry,
        previousEntry,
      },
      description: { name, description: '' },
    };
  }

  if (previousEntry === undefined) {
    throw new Error(`internal error: managed directory for ${name} has no baseline`);
  }

  const destinationHash = hashSkillDir(destinationDir);
  if (destinationHash === registryHash) {
    const state: SkillState =
      previousEntry.hash === registryHash && previousEntry.source === configuredSource
        ? 'unchanged'
        : 'lock_update';
    return {
      record: {
        name,
        state,
        fileCount,
        sourceDir,
        destinationDir,
        registryHash,
        currentHash: destinationHash,
        nextEntry: canonicalEntry,
        previousEntry,
      },
      description: { name, description: readSkillDescription(sourceDir) },
    };
  }

  if (destinationHash === previousEntry.hash) {
    return {
      record: {
        name,
        state: 'update',
        fileCount,
        sourceDir,
        destinationDir,
        registryHash,
        currentHash: destinationHash,
        nextEntry: canonicalEntry,
        previousEntry,
      },
      description: { name, description: readSkillDescription(sourceDir) },
    };
  }

  return {
    record: {
      name,
      state: 'drifted',
      reason: 'local_changes',
      fileCount,
      sourceDir,
      destinationDir,
      registryHash,
      currentHash: destinationHash,
      nextEntry: previousEntry,
      previousEntry,
    },
    description: { name, description: readSkillDescription(destinationDir) },
  };
}

export function planReconciliation(cwd: string, options: PlanOptions = {}): ReconciliationPlan {
  const config = options.config ?? loadConfig(cwd);
  const registryOptions = {
    ...(options.registryReporter === undefined ? {} : { reporter: options.registryReporter }),
    ...(options.registryCacheRoot === undefined ? {} : { cacheRoot: options.registryCacheRoot }),
  };
  const catalog =
    options.registryCatalog ?? resolveRegistryCatalog(config.registry, cwd, registryOptions);
  if (catalog.spec !== config.registry) {
    throw new Error('internal error: prepared registry does not match project configuration');
  }
  const registryDir = catalog.directory;
  const available = [...catalog.skills];
  const lock = options.lock ?? readLock(cwd);
  for (const name of Object.keys(lock.skills)) assertSafeSkillName(name, 'lock');

  const overrideNames = Object.keys(config.overrides);
  if (config.skills !== null) {
    const selected = new Set(normalizeDesiredNames(config.skills));
    const deselectedOverrides = overrideNames.filter((name) => !selected.has(name));
    if (deselectedOverrides.length > 0) {
      throw new Error(
        `${CONFIG_NAME} override must also be selected in "skills:": ${deselectedOverrides.join(', ')}`,
      );
    }
  }
  const unownedOverrides = overrideNames.filter((name) => !Object.hasOwn(lock.skills, name));
  if (unownedOverrides.length > 0) {
    throw new Error(
      `${CONFIG_NAME} override has no Managed ownership in .skillfoo.lock: ${unownedOverrides.join(', ')}`,
    );
  }

  const wanted = normalizeDesiredNames(
    config.skills ?? [...available, ...overrideNames.filter((name) => !available.includes(name))],
  );
  const missing = wanted.filter(
    (name) => !available.includes(name) && !Object.hasOwn(config.overrides, name),
  );
  if (missing.length > 0) {
    throw new Error(
      `not in the registry: ${missing.join(', ')}\n` +
        `available: ${available.join(', ') || '(none)'}`,
    );
  }

  const emitRoot = resolve(cwd, config.emit);
  const skills: SkillPlanRecord[] = [];
  const activeSkills: DescribedSkill[] = [];
  const retainedSkills: DescribedSkill[] = [];
  const preservedSkillNames: string[] = [];
  const nextLock: LockFile = { lockfileVersion: 1, skills: {} };

  for (const name of wanted) {
    const planned = desiredRecord(
      name,
      registryDir,
      emitRoot,
      config.registry,
      Object.hasOwn(lock.skills, name) ? lock.skills[name] : undefined,
      Object.hasOwn(config.overrides, name),
      available.includes(name),
    );
    skills.push(planned.record);
    if (planned.record.nextEntry !== undefined) {
      setLockEntry(nextLock.skills, name, planned.record.nextEntry);
    }
    if (planned.description !== undefined) activeSkills.push(planned.description);
    if (
      planned.record.state === 'drifted' &&
      (planned.record.reason === 'override_content_missing' ||
        (Object.hasOwn(config.overrides, name) &&
          planned.record.reason === 'emitted_path_not_managed_directory'))
    ) {
      preservedSkillNames.push(name);
    }
  }

  const wantedSet = new Set(wanted);
  const removalNames = Object.keys(lock.skills).filter((name) => !wantedSet.has(name));
  const removalCandidates = resolveManagedRemovalCandidates(cwd, config.emit, removalNames);
  for (const candidate of removalCandidates) {
    const previousEntry = lock.skills[candidate.name];
    if (previousEntry === undefined) {
      throw new Error(`internal error: no locked baseline for ${candidate.name}`);
    }
    const inspection = inspectManagedRemoval(candidate, previousEntry.hash);
    if (inspection.status === 'safe') {
      skills.push({
        name: candidate.name,
        state: 'remove',
        fileCount: 0,
        previousEntry,
        removalCandidate: candidate,
      });
    } else {
      skills.push({
        name: candidate.name,
        state: 'removal_blocked',
        reason: inspection.reason,
        fileCount: 0,
        nextEntry: previousEntry,
        previousEntry,
        removalCandidate: candidate,
      });
      setLockEntry(nextLock.skills, candidate.name, previousEntry);
      retainedSkills.push({
        name: candidate.name,
        description: localDescription(candidate.emittedPath),
      });
    }
  }

  const agentsCurrent = currentAgentsMd(cwd);
  const agentsNext = renderAgentsMd(
    agentsCurrent,
    config.emit,
    activeSkills,
    retainedSkills,
    preservedSkillNames,
  );
  const agentsProjection: AgentsMdProjection = {
    kind: 'agents_md',
    state: agentsCurrent === agentsNext ? 'unchanged' : 'update',
    currentContents: agentsCurrent,
    nextContents: agentsNext,
  };

  const adapterProjections: ClaudeAdapterProjection[] = activeSkills.map(({ name }) => {
    const candidate = resolveClaudeAdapterCandidate(cwd, config.emit, name);
    const inspection = inspectClaudeAdapter(cwd, candidate);
    if (inspection.status === 'expected') {
      return { kind: 'claude_adapter', skill: name, state: 'unchanged', candidate };
    }
    if (inspection.status === 'missing') {
      return { kind: 'claude_adapter', skill: name, state: 'update', candidate };
    }
    if (inspection.status === 'unsafe_ancestor') {
      return {
        kind: 'claude_adapter',
        skill: name,
        state: 'blocked',
        reason: 'adapter_ownership_unproven',
        candidate,
      };
    }
    return {
      kind: 'claude_adapter',
      skill: name,
      state: 'blocked',
      reason: 'unmanaged_destination',
      candidate,
    };
  });

  const projections: ProjectionPlanRecord[] = [agentsProjection, ...adapterProjections];
  const summary: ReconciliationSummary = {
    skills: summarizeSkills(skills),
    projections: summarizeProjections(projections),
  };

  return {
    config,
    registryDir,
    outcome: deriveOutcome(summary),
    skills,
    projections,
    summary,
    nextLock,
    activeSkills,
    retainedSkills,
    preservedSkillNames,
  };
}
