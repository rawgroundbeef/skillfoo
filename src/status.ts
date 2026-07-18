import {
  type ConflictReason,
  type ProjectionPlanRecord,
  type ReconciliationPlan,
  type SkillPlanRecord,
} from './plan.js';

const REASON_TEXT: Record<ConflictReason, string> = {
  local_changes: 'local changes are preserved',
  unmanaged_destination: 'the destination is not owned by skillfoo',
  unrepresented_local_structure: 'local structure is not represented by the managed manifest',
  emitted_path_not_managed_directory: 'the emitted path is not a managed directory',
  adapter_ownership_unproven: 'adapter ownership cannot be proven',
};

function compareNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function publicSkill(record: SkillPlanRecord): Record<string, string> {
  return {
    name: record.name,
    state: record.state,
    ...(record.reason === undefined ? {} : { reason: record.reason }),
  };
}

function publicProjection(record: ProjectionPlanRecord): Record<string, string> {
  if (record.kind === 'agents_md') return { kind: record.kind, state: record.state };
  return {
    kind: record.kind,
    skill: record.skill,
    state: record.state,
    ...(record.reason === undefined ? {} : { reason: record.reason }),
  };
}

function orderedProjections(plan: ReconciliationPlan): ProjectionPlanRecord[] {
  const agents = plan.projections.filter((record) => record.kind === 'agents_md');
  const adapters = plan.projections
    .filter((record) => record.kind === 'claude_adapter')
    .sort((left, right) => compareNames(left.skill, right.skill));
  return [...agents, ...adapters];
}

export function renderStatusJson(plan: ReconciliationPlan): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      outcome: plan.outcome,
      registry: plan.config.registry,
      emit: plan.config.emit,
      skills: [...plan.skills]
        .sort((left, right) => compareNames(left.name, right.name))
        .map(publicSkill),
      projections: orderedProjections(plan).map(publicProjection),
      summary: plan.summary,
    },
    null,
    2,
  );
}

function skillLine(record: SkillPlanRecord): string {
  const reason = record.reason === undefined ? '' : ` — ${REASON_TEXT[record.reason]}`;
  return `  ${mark(record.state)} ${record.name}: ${record.state}${reason}`;
}

function projectionLine(record: ProjectionPlanRecord): string {
  const label = record.kind === 'agents_md' ? 'AGENTS.md' : `.claude/skills/${record.skill}`;
  const reason =
    record.kind === 'claude_adapter' && record.reason !== undefined
      ? ` — ${REASON_TEXT[record.reason]}`
      : '';
  return `  ${mark(record.state)} ${label}: ${record.state}${reason}`;
}

function mark(state: SkillPlanRecord['state'] | ProjectionPlanRecord['state']): string {
  if (state === 'unchanged') return '=';
  if (state === 'drifted' || state === 'blocked' || state === 'removal_blocked') return '!';
  if (state === 'remove') return '-';
  return '~';
}

export function renderStatusHuman(plan: ReconciliationPlan): string {
  const skillLines = [...plan.skills]
    .sort((left, right) => compareNames(left.name, right.name))
    .map(skillLine);
  const projectionLines = orderedProjections(plan).map(projectionLine);

  let conclusion: string;
  if (plan.outcome === 'converged') {
    conclusion = 'Repository is converged. No sync is needed.';
  } else if (plan.outcome === 'changes_available') {
    conclusion = 'Changes are available. Run skillfoo sync to apply them.';
  } else {
    conclusion =
      plan.summary.skills.changes + plan.summary.projections.changes > 0
        ? 'Attention is required. Ordinary sync can apply safe changes, but it will preserve conflicts.'
        : 'Attention is required. Ordinary sync will preserve these conflicts; resolve them explicitly.';
  }

  return [
    `skillfoo status: ${plan.outcome}`,
    '',
    'Skills:',
    ...skillLines,
    '',
    'Projections:',
    ...projectionLines,
    '',
    conclusion,
  ].join('\n');
}

export function statusExitCode(plan: ReconciliationPlan): 0 | 2 | 3 {
  if (plan.outcome === 'converged') return 0;
  return plan.outcome === 'changes_available' ? 2 : 3;
}
