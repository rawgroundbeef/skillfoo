import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { createClaudeAdapter } from './adapter.js';
import { writeAgentsMd } from './emit.js';
import { writeLock } from './lockfile.js';
import {
  planReconciliation,
  type ConflictReason,
  type PlanOptions,
  type ReconciliationPlan,
  type SkillState,
} from './plan.js';
import { executeManagedRemoval } from './removal.js';
import { walkFiles } from './skilldir.js';

function removeEmptyDirs(dir: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = join(dir, entry.name);
    removeEmptyDirs(child);
    if (readdirSync(child).length === 0) rmdirSync(child);
  }
}

function mirrorSkillDir(srcDir: string, destDir: string): void {
  const files = walkFiles(srcDir);

  if (existsSync(destDir)) {
    const wanted = new Set(files);
    for (const relativePath of walkFiles(destDir)) {
      if (!wanted.has(relativePath)) rmSync(join(destDir, relativePath), { force: true });
    }
    removeEmptyDirs(destDir);
  }

  for (const relativePath of files) {
    const next = readFileSync(join(srcDir, relativePath));
    const destFile = join(destDir, relativePath);
    const previous = existsSync(destFile) ? readFileSync(destFile) : null;
    if (previous === null || !previous.equals(next)) {
      mkdirSync(dirname(destFile), { recursive: true });
      writeFileSync(destFile, next);
    }
  }
}

export interface SyncOptions extends PlanOptions {
  output?: (message: string) => void;
}

export interface SyncResult {
  plan: ReconciliationPlan;
  outcome: 'converged' | 'attention_required';
}

const REASON_TEXT: Record<ConflictReason, string> = {
  local_changes: 'local changes',
  unmanaged_destination: 'unmanaged destination',
  unrepresented_local_structure: 'unrepresented local structure',
  emitted_path_not_managed_directory: 'emitted path is not a managed directory',
  adapter_ownership_unproven: 'adapter ownership cannot be proven',
};

export async function sync(cwd: string, options: SyncOptions = {}): Promise<SyncResult> {
  const output = options.output ?? ((message: string) => console.log(message));
  const plan = planReconciliation(cwd, {
    registryReporter: options.registryReporter ?? output,
    ...(options.registryCacheRoot === undefined
      ? {}
      : { registryCacheRoot: options.registryCacheRoot }),
    ...(options.registryCatalog === undefined
      ? {}
      : { registryCatalog: options.registryCatalog }),
  });

  const tally: Record<'added' | 'updated' | 'unchanged' | 'drifted' | 'blocked', number> = {
    added: 0,
    updated: 0,
    unchanged: 0,
    drifted: 0,
    blocked: 0,
  };
  let removed = 0;
  let removalBlocked = 0;

  for (const record of plan.skills) {
    if (record.state === 'remove') {
      if (record.removalCandidate === undefined) {
        throw new Error(`internal error: no removal candidate for ${record.name}`);
      }
      executeManagedRemoval(record.removalCandidate);
      removed++;
      output(`  - ${record.name}`);
      continue;
    }

    if (record.state === 'removal_blocked') {
      removalBlocked++;
      const reason = record.reason === undefined ? 'ownership cannot be proven' : REASON_TEXT[record.reason];
      output(`  ⊘ ${record.name}  (removal blocked — ${reason})`);
      continue;
    }

    if (record.state === 'add' || record.state === 'update') {
      if (record.sourceDir === undefined || record.destinationDir === undefined) {
        throw new Error(`internal error: no content action paths for ${record.name}`);
      }
      mirrorSkillDir(record.sourceDir, record.destinationDir);
    }

    const presentation = skillPresentation(record.state);
    tally[presentation.tally]++;
    const files = record.fileCount > 1 ? ` (${record.fileCount} files)` : '';
    let note = '';
    if (record.state === 'drifted') {
      note =
        record.reason === 'emitted_path_not_managed_directory'
          ? '  (drifted — emitted path is not a managed directory; local content kept)'
          : `  (drifted — local edits kept; run skillfoo resolve ${record.name} --take-registry to discard them)`;
    } else if (record.state === 'blocked') {
      note = '  (unowned content is here; remove it to let skillfoo manage this skill)';
    } else if (record.state === 'lock_update') {
      note = '  (updated lock metadata)';
    }
    output(`  ${presentation.mark} ${record.name}${files}${note}`);
  }

  writeLock(cwd, plan.nextLock);

  const agentsProjection = plan.projections[0];
  if (agentsProjection?.kind !== 'agents_md') {
    throw new Error('internal error: AGENTS.md projection is missing');
  }
  if (agentsProjection.state === 'update' && agentsProjection.nextContents !== null) {
    writeAgentsMd(cwd, agentsProjection.nextContents);
  }

  for (const projection of plan.projections.slice(1)) {
    if (projection.kind !== 'claude_adapter') continue;
    if (projection.state === 'update') {
      createClaudeAdapter(projection.candidate);
    } else if (projection.state === 'blocked') {
      const reason =
        projection.reason === undefined ? 'ownership cannot be proven' : REASON_TEXT[projection.reason];
      output(`  ⊘ ${projection.skill} adapter  (blocked — ${reason})`);
    }
  }

  const count = plan.activeSkills.length;
  output(
    `\nsynced ${count} skill${count === 1 ? '' : 's'} from ${plan.config.registry} → ${plan.config.emit}`,
  );
  let summary = `${tally.added} added · ${tally.updated} updated · ${tally.unchanged} unchanged`;
  if (tally.drifted > 0) summary += ` · ${tally.drifted} drifted`;
  if (tally.blocked > 0) summary += ` · ${tally.blocked} blocked`;
  if (removed > 0) summary += ` · ${removed} removed`;
  if (removalBlocked > 0) summary += ` · ${removalBlocked} removal blocked`;
  output(summary);

  if (count > 0) {
    const blockedAdapters = plan.projections.filter(
      (projection) => projection.kind === 'claude_adapter' && projection.state === 'blocked',
    ).length;
    if (blockedAdapters === 0) {
      output(`updated AGENTS.md · linked .claude/skills/ → ${plan.config.emit}/ (Claude adapter)`);
    } else {
      output(
        `updated AGENTS.md · reconciled .claude/skills/ → ${plan.config.emit}/ ` +
          `(${blockedAdapters} blocked adapter${blockedAdapters === 1 ? '' : 's'} preserved)`,
      );
    }
  }

  return {
    plan,
    outcome: plan.outcome === 'attention_required' ? 'attention_required' : 'converged',
  };
}

function skillPresentation(state: SkillState): {
  tally: 'added' | 'updated' | 'unchanged' | 'drifted' | 'blocked';
  mark: string;
} {
  switch (state) {
    case 'add':
      return { tally: 'added', mark: '+' };
    case 'update':
    case 'lock_update':
      return { tally: 'updated', mark: '~' };
    case 'unchanged':
      return { tally: 'unchanged', mark: '=' };
    case 'drifted':
      return { tally: 'drifted', mark: '!' };
    case 'blocked':
      return { tally: 'blocked', mark: '⊘' };
    case 'remove':
    case 'removal_blocked':
      throw new Error(`internal error: removal state ${state} used as active presentation`);
  }
}
