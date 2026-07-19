import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { planReconciliation } from '../src/plan.js';
import { renderStatusHuman, renderStatusJson, statusExitCode } from '../src/status.js';
import { sync } from '../src/sync.js';

function fixture(context: TestContext): { registry: string; consumer: string } {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-status-'));
  const registry = join(root, 'registry');
  const consumer = join(root, 'consumer');
  mkdirSync(registry);
  mkdirSync(consumer);
  for (const name of ['alpha', 'beta']) {
    const dir = join(registry, name);
    mkdirSync(dir);
    writeFileSync(
      join(dir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: ${name} guidance.\n---\n\n# ${name}\n`,
    );
  }
  writeFileSync(
    join(consumer, '.skillfoo.yml'),
    'registry: ../registry\nskills: [beta, alpha]\n',
  );
  context.after(() => rmSync(root, { recursive: true, force: true }));
  return { registry, consumer };
}

test('renders stable, sorted JSON with separate section summaries', (context) => {
  const state = fixture(context);
  const plan = planReconciliation(state.consumer);
  const result = JSON.parse(renderStatusJson(plan)) as {
    schemaVersion: number;
    outcome: string;
    registry: string;
    emit: string;
    skills: Array<Record<string, string>>;
    projections: Array<Record<string, string>>;
    summary: unknown;
  };

  assert.equal(result.schemaVersion, 2);
  assert.equal(result.outcome, 'changes_available');
  assert.equal(result.registry, '../registry');
  assert.equal(result.emit, '.agents/skills');
  assert.deepEqual(result.skills, [
    { name: 'alpha', state: 'add' },
    { name: 'beta', state: 'add' },
  ]);
  assert.deepEqual(
    result.projections.map(({ kind, skill, state: projectionState }) => [
      kind,
      skill,
      projectionState,
    ]),
    [
      ['agents_md', undefined, 'update'],
      ['claude_adapter', 'alpha', 'update'],
      ['claude_adapter', 'beta', 'update'],
    ],
  );
  assert.deepEqual(result.summary, {
    skills: { unchanged: 0, overrides: 0, changes: 2, conflicts: 0 },
    projections: { unchanged: 0, changes: 3, conflicts: 0 },
  });
  assert.equal(statusExitCode(plan), 2);
});

test('retains safe findings when a conflict makes attention take precedence', async (context) => {
  const state = fixture(context);
  await sync(state.consumer, { output: () => undefined });
  writeFileSync(
    join(state.registry, 'alpha', 'SKILL.md'),
    '---\nname: alpha\ndescription: Updated alpha guidance.\n---\n\n# alpha update\n',
  );
  writeFileSync(join(state.consumer, '.agents', 'skills', 'beta', 'SKILL.md'), 'local beta\n');

  const plan = planReconciliation(state.consumer);
  assert.equal(plan.outcome, 'attention_required');
  assert.equal(statusExitCode(plan), 3);
  assert.equal(plan.summary.skills.changes, 1);
  assert.equal(plan.summary.skills.conflicts, 1);
  const json = JSON.parse(renderStatusJson(plan)) as {
    skills: Array<Record<string, string>>;
  };
  assert.deepEqual(json.skills, [
    { name: 'alpha', state: 'update' },
    { name: 'beta', state: 'drifted', reason: 'local_changes' },
  ]);

  const human = renderStatusHuman(plan);
  assert.match(human, /alpha: update/);
  assert.match(human, /beta: drifted — local changes are preserved/);
  assert.match(human, /Ordinary sync can apply safe changes, but it will preserve conflicts/);
});

test('publishes a healthy Override and registry state in JSON schema 2', async (context) => {
  const state = fixture(context);
  await sync(state.consumer, { output: () => undefined });
  writeFileSync(
    join(state.consumer, '.agents', 'skills', 'alpha', 'SKILL.md'),
    '---\nname: alpha\ndescription: Local alpha guidance.\n---\n\n# local\n',
  );
  writeFileSync(
    join(state.consumer, '.skillfoo.yml'),
    'registry: ../registry\nskills: [beta, alpha]\noverrides: { alpha: local }\n',
  );
  await sync(state.consumer, { output: () => undefined });
  writeFileSync(
    join(state.registry, 'alpha', 'SKILL.md'),
    '---\nname: alpha\ndescription: Changed registry guidance.\n---\n\n# changed\n',
  );

  const plan = planReconciliation(state.consumer);
  const json = JSON.parse(renderStatusJson(plan)) as {
    schemaVersion: number;
    outcome: string;
    skills: Array<Record<string, string>>;
    summary: { skills: Record<string, number> };
  };
  assert.equal(json.schemaVersion, 2);
  assert.equal(json.outcome, 'converged');
  assert.deepEqual(json.skills[0], {
    name: 'alpha',
    state: 'override',
    registryState: 'changed',
  });
  assert.equal(json.summary.skills.overrides, 1);
  assert.match(renderStatusHuman(plan), /repository version is authoritative; registry baseline changed/);
  assert.equal(statusExitCode(plan), 0);
});
