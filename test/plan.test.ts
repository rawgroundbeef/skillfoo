import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test, { type TestContext } from 'node:test';
import { readLock, writeLock } from '../src/lockfile.js';
import { planReconciliation, type ReconciliationPlan } from '../src/plan.js';
import { sync } from '../src/sync.js';

interface Fixture {
  root: string;
  registry: string;
  consumer: string;
}

function writeSkill(registry: string, name: string, description = `${name} guidance.`): void {
  const dir = join(registry, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
  );
}

function configure(consumer: string, skills: readonly string[]): void {
  writeFileSync(
    join(consumer, '.skillfoo.yml'),
    `registry: ../registry\nskills: ${JSON.stringify(skills)}\n`,
  );
}

function fixture(context: TestContext, names: readonly string[] = ['alpha', 'beta']): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-plan-'));
  const registry = join(root, 'registry');
  const consumer = join(root, 'consumer');
  mkdirSync(registry);
  mkdirSync(consumer);
  for (const name of names) writeSkill(registry, name);
  configure(consumer, names);
  context.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, registry, consumer };
}

function record(plan: ReconciliationPlan, name: string) {
  const result = plan.skills.find((skill) => skill.name === name);
  assert.ok(result, `expected a plan record for ${name}`);
  return result;
}

function adapter(plan: ReconciliationPlan, name: string) {
  const result = plan.projections.find(
    (projection) => projection.kind === 'claude_adapter' && projection.skill === name,
  );
  assert.ok(result?.kind === 'claude_adapter', `expected an adapter record for ${name}`);
  return result;
}

function snapshot(root: string): string[] {
  const result: string[] = [];
  function visit(dir: string): void {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const key = relative(root, path).split('\\').join('/');
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        result.push(`link ${key} -> ${readlinkSync(path)}`);
      } else if (stat.isDirectory()) {
        result.push(`dir ${key}`);
        visit(path);
      } else if (stat.isFile()) {
        result.push(`file ${key} ${readFileSync(path).toString('base64')}`);
      } else {
        result.push(`special ${key}`);
      }
    }
  }
  visit(root);
  return result;
}

async function converge(state: Fixture): Promise<void> {
  await sync(state.consumer, { output: () => undefined });
}

test('plans a fresh consumer completely without mutating it', (context) => {
  const state = fixture(context);
  const before = snapshot(state.consumer);

  const plan = planReconciliation(state.consumer);

  assert.deepEqual(plan.skills.map(({ name, state: skillState }) => [name, skillState]), [
    ['alpha', 'add'],
    ['beta', 'add'],
  ]);
  assert.equal(plan.projections[0]?.state, 'update');
  assert.equal(adapter(plan, 'alpha').state, 'update');
  assert.equal(adapter(plan, 'beta').state, 'update');
  assert.equal(plan.outcome, 'changes_available');
  assert.deepEqual(plan.summary, {
    skills: { unchanged: 0, overrides: 0, changes: 2, conflicts: 0 },
    projections: { unchanged: 0, changes: 3, conflicts: 0 },
  });
  assert.deepEqual(snapshot(state.consumer), before);
});

test('plans convergence and a registry update with its post-sync description', async (context) => {
  const state = fixture(context);
  await converge(state);
  const stable = planReconciliation(state.consumer);
  assert.equal(stable.outcome, 'converged');
  assert.ok(stable.skills.every((skill) => skill.state === 'unchanged'));
  assert.ok(stable.projections.every((projection) => projection.state === 'unchanged'));

  writeSkill(state.registry, 'alpha', 'Refreshed alpha guidance. More detail.');
  const before = snapshot(state.consumer);
  const changed = planReconciliation(state.consumer);
  assert.equal(record(changed, 'alpha').state, 'update');
  assert.equal(record(changed, 'beta').state, 'unchanged');
  assert.equal(changed.projections[0]?.state, 'update');
  assert.match(
    changed.projections[0]?.kind === 'agents_md'
      ? (changed.projections[0].nextContents ?? '')
      : '',
    /Refreshed alpha guidance\./,
  );
  assert.equal(adapter(changed, 'alpha').state, 'unchanged');
  assert.equal(changed.outcome, 'changes_available');
  assert.deepEqual(snapshot(state.consumer), before);
});

test('reports stale hash and source metadata as lock updates', async (context) => {
  const state = fixture(context, ['alpha']);
  await converge(state);
  const canonical = readLock(state.consumer).skills.alpha;
  assert.ok(canonical);

  for (const entry of [
    { source: canonical.source, hash: 'sha256:stale' },
    { source: 'old-registry', hash: canonical.hash },
  ]) {
    writeLock(state.consumer, { lockfileVersion: 1, skills: { alpha: entry } });
    const before = readFileSync(join(state.consumer, '.skillfoo.lock'));
    const plan = planReconciliation(state.consumer);
    assert.equal(record(plan, 'alpha').state, 'lock_update');
    assert.equal(plan.outcome, 'changes_available');
    assert.deepEqual(readFileSync(join(state.consumer, '.skillfoo.lock')), before);
    await sync(state.consumer, { output: () => undefined });
    assert.deepEqual(readLock(state.consumer).skills.alpha, canonical);
  }
});

test('preserves the complete prior lock entry while desired content is drifted', async (context) => {
  const state = fixture(context, ['alpha']);
  await converge(state);
  const prior = { source: 'old-registry', hash: readLock(state.consumer).skills.alpha?.hash ?? '' };
  writeLock(state.consumer, { lockfileVersion: 1, skills: { alpha: prior } });
  writeFileSync(
    join(state.consumer, '.agents', 'skills', 'alpha', 'SKILL.md'),
    '---\nname: alpha\ndescription: Local alpha guidance. More detail.\n---\n\n# local\n',
  );

  const plan = planReconciliation(state.consumer);
  assert.deepEqual(
    { state: record(plan, 'alpha').state, reason: record(plan, 'alpha').reason },
    { state: 'drifted', reason: 'local_changes' },
  );
  assert.deepEqual(plan.nextLock.skills.alpha, prior);
  assert.match(
    plan.projections[0]?.kind === 'agents_md'
      ? (plan.projections[0].nextContents ?? '')
      : '',
    /Local alpha guidance\./,
  );
  await sync(state.consumer, { output: () => undefined });
  assert.deepEqual(readLock(state.consumer).skills.alpha, prior);
});

for (const shape of ['empty directory', 'file', 'symlink'] as const) {
  test(`blocks an unlocked desired ${shape} without traversal`, (context) => {
    const state = fixture(context, ['alpha']);
    const destination = join(state.consumer, '.agents', 'skills', 'alpha');
    mkdirSync(join(state.consumer, '.agents', 'skills'), { recursive: true });
    if (shape === 'empty directory') mkdirSync(destination);
    else if (shape === 'file') writeFileSync(destination, 'foreign\n');
    else {
      const foreign = join(state.root, 'foreign');
      mkdirSync(foreign);
      writeFileSync(join(foreign, 'SKILL.md'), readFileSync(join(state.registry, 'alpha', 'SKILL.md')));
      symlinkSync(foreign, destination, process.platform === 'win32' ? 'junction' : 'dir');
    }
    const before = snapshot(state.consumer);

    const plan = planReconciliation(state.consumer);
    assert.deepEqual(
      { state: record(plan, 'alpha').state, reason: record(plan, 'alpha').reason },
      { state: 'blocked', reason: 'unmanaged_destination' },
    );
    assert.equal(
      plan.projections.some(
        (projection) => projection.kind === 'claude_adapter' && projection.skill === 'alpha',
      ),
      false,
    );
    assert.equal(plan.outcome, 'attention_required');
    assert.deepEqual(snapshot(state.consumer), before);
  });
}

test('treats a substituted locked top-level symlink as drift without following it', async (context) => {
  const state = fixture(context, ['alpha']);
  await converge(state);
  const destination = join(state.consumer, '.agents', 'skills', 'alpha');
  const foreign = join(state.root, 'foreign');
  mkdirSync(foreign);
  writeFileSync(join(foreign, 'SKILL.md'), readFileSync(join(state.registry, 'alpha', 'SKILL.md')));
  rmSync(destination, { recursive: true });
  symlinkSync(foreign, destination, process.platform === 'win32' ? 'junction' : 'dir');

  const plan = planReconciliation(state.consumer);
  assert.deepEqual(
    { state: record(plan, 'alpha').state, reason: record(plan, 'alpha').reason },
    { state: 'drifted', reason: 'emitted_path_not_managed_directory' },
  );
  assert.equal(lstatSync(destination).isSymbolicLink(), true);
});

test('normalizes duplicate desired names and rejects unsafe names', (context) => {
  const state = fixture(context, ['alpha']);
  configure(state.consumer, ['alpha', 'alpha']);
  const plan = planReconciliation(state.consumer);
  assert.equal(plan.skills.length, 1);
  assert.equal(
    plan.projections.filter((projection) => projection.kind === 'claude_adapter').length,
    1,
  );

  configure(state.consumer, ['../alpha']);
  const before = snapshot(state.consumer);
  assert.throws(() => planReconciliation(state.consumer), /unsafe desired skill name/);
  assert.deepEqual(snapshot(state.consumer), before);
});

test('plans safe and blocked removals without executing either', async (context) => {
  const state = fixture(context);
  await converge(state);
  configure(state.consumer, ['alpha']);
  const before = snapshot(state.consumer);
  const safe = planReconciliation(state.consumer);
  assert.equal(record(safe, 'beta').state, 'remove');
  assert.equal(safe.outcome, 'changes_available');
  assert.deepEqual(snapshot(state.consumer), before);

  writeFileSync(join(state.consumer, '.agents', 'skills', 'beta', 'SKILL.md'), 'local edit\n');
  const blockedBefore = snapshot(state.consumer);
  const blocked = planReconciliation(state.consumer);
  assert.deepEqual(
    { state: record(blocked, 'beta').state, reason: record(blocked, 'beta').reason },
    { state: 'removal_blocked', reason: 'local_changes' },
  );
  assert.equal(blocked.outcome, 'attention_required');
  assert.deepEqual(snapshot(state.consumer), blockedBefore);
});

test('reports active adapter conflicts, preserves them in sync, and skips correct adapters', async (context) => {
  const state = fixture(context, ['alpha']);
  await converge(state);
  const adapterPath = join(state.consumer, '.claude', 'skills', 'alpha');

  rmSync(join(state.consumer, 'AGENTS.md'));
  rmSync(adapterPath);
  const missing = planReconciliation(state.consumer);
  assert.equal(missing.projections[0]?.state, 'update');
  assert.equal(adapter(missing, 'alpha').state, 'update');
  await sync(state.consumer, { output: () => undefined });
  assert.equal(existsSync(join(state.consumer, 'AGENTS.md')), true);
  assert.equal(lstatSync(adapterPath).isSymbolicLink(), true);
  assert.equal(planReconciliation(state.consumer).outcome, 'converged');

  const originalInode = lstatSync(adapterPath).ino;
  await sync(state.consumer, { output: () => undefined });
  assert.equal(lstatSync(adapterPath).ino, originalInode);

  rmSync(adapterPath);
  writeFileSync(adapterPath, 'foreign adapter\n');
  const plan = planReconciliation(state.consumer);
  assert.deepEqual(
    { state: adapter(plan, 'alpha').state, reason: adapter(plan, 'alpha').reason },
    { state: 'blocked', reason: 'unmanaged_destination' },
  );
  assert.equal(plan.outcome, 'attention_required');
  await sync(state.consumer, { output: () => undefined });
  assert.equal(readFileSync(adapterPath, 'utf8'), 'foreign adapter\n');
});

test('unsafe adapter ancestors block active work and managed removal', async (context) => {
  const state = fixture(context, ['alpha']);
  await converge(state);
  const foreign = join(state.root, 'foreign-claude');
  mkdirSync(join(foreign, 'skills'), { recursive: true });
  writeFileSync(join(foreign, 'marker'), 'preserve\n');
  rmSync(join(state.consumer, '.claude'), { recursive: true });
  symlinkSync(foreign, join(state.consumer, '.claude'), process.platform === 'win32' ? 'junction' : 'dir');

  const active = planReconciliation(state.consumer);
  assert.deepEqual(
    { state: adapter(active, 'alpha').state, reason: adapter(active, 'alpha').reason },
    { state: 'blocked', reason: 'adapter_ownership_unproven' },
  );
  await sync(state.consumer, { output: () => undefined });
  assert.equal(readFileSync(join(foreign, 'marker'), 'utf8'), 'preserve\n');
  assert.equal(lstatSync(join(state.consumer, '.claude')).isSymbolicLink(), true);

  configure(state.consumer, []);
  const removal = planReconciliation(state.consumer);
  assert.deepEqual(
    { state: record(removal, 'alpha').state, reason: record(removal, 'alpha').reason },
    { state: 'removal_blocked', reason: 'adapter_ownership_unproven' },
  );
});

test('keeps a live Override healthy across local edits and registry evolution', async (context) => {
  const state = fixture(context, ['alpha']);
  await converge(state);
  const previousEntry = readLock(state.consumer).skills.alpha;
  assert.ok(previousEntry);
  const emitted = join(state.consumer, '.agents', 'skills', 'alpha');
  writeFileSync(
    join(emitted, 'SKILL.md'),
    '---\nname: alpha\ndescription: Local alpha guidance. More detail.\n---\n\n# local\n',
  );
  writeFileSync(
    join(state.consumer, '.skillfoo.yml'),
    'registry: ../registry\nskills: [alpha]\noverrides: { alpha: local }\n',
  );

  const unchangedRegistry = planReconciliation(state.consumer);
  assert.deepEqual(
    {
      state: record(unchangedRegistry, 'alpha').state,
      registryState: record(unchangedRegistry, 'alpha').registryState,
    },
    { state: 'override', registryState: 'unchanged' },
  );
  assert.deepEqual(unchangedRegistry.summary.skills, {
    unchanged: 0,
    overrides: 1,
    changes: 0,
    conflicts: 0,
  });
  assert.deepEqual(unchangedRegistry.nextLock.skills.alpha, previousEntry);
  assert.match(
    unchangedRegistry.projections[0]?.kind === 'agents_md'
      ? (unchangedRegistry.projections[0].nextContents ?? '')
      : '',
    /Local alpha guidance\. \(local override; edit in this repository\)/,
  );

  await sync(state.consumer, { output: () => undefined });
  writeSkill(state.registry, 'alpha', 'New registry alpha guidance.');
  const changedRegistry = planReconciliation(state.consumer);
  assert.equal(record(changedRegistry, 'alpha').state, 'override');
  assert.equal(record(changedRegistry, 'alpha').registryState, 'changed');
  assert.equal(changedRegistry.outcome, 'converged');
  assert.deepEqual(changedRegistry.nextLock.skills.alpha, previousEntry);

  rmSync(join(state.registry, 'alpha'), { recursive: true });
  const missingRegistry = planReconciliation(state.consumer);
  assert.equal(record(missingRegistry, 'alpha').state, 'override');
  assert.equal(record(missingRegistry, 'alpha').registryState, 'missing');
  assert.equal(missingRegistry.outcome, 'converged');
  assert.deepEqual(missingRegistry.nextLock.skills.alpha, previousEntry);
  assert.equal(readFileSync(join(emitted, 'SKILL.md'), 'utf8').includes('# local'), true);
});

test('honors ownership-consistent manual Override policy when content matches the registry', async (context) => {
  const state = fixture(context, ['alpha']);
  await converge(state);
  writeFileSync(
    join(state.consumer, '.skillfoo.yml'),
    'registry: ../registry\nskills: [alpha]\noverrides: { alpha: local }\n',
  );
  const plan = planReconciliation(state.consumer);
  assert.equal(record(plan, 'alpha').state, 'override');
  assert.equal(record(plan, 'alpha').registryState, 'unchanged');
});

test('degrades missing Override content without recreating its row or adapter', async (context) => {
  const state = fixture(context, ['alpha']);
  await converge(state);
  writeFileSync(
    join(state.consumer, '.skillfoo.yml'),
    'registry: ../registry\nskills: [alpha]\noverrides:\n  alpha: local\n',
  );
  const emitted = join(state.consumer, '.agents', 'skills', 'alpha');
  const adapterPath = join(state.consumer, '.claude', 'skills', 'alpha');
  rmSync(emitted, { recursive: true });

  const degraded = planReconciliation(state.consumer);
  assert.deepEqual(
    { state: record(degraded, 'alpha').state, reason: record(degraded, 'alpha').reason },
    { state: 'drifted', reason: 'override_content_missing' },
  );
  assert.equal(
    degraded.projections.some(
      (projection) => projection.kind === 'claude_adapter' && projection.skill === 'alpha',
    ),
    false,
  );

  const agentsPath = join(state.consumer, 'AGENTS.md');
  const withoutRow = readFileSync(agentsPath, 'utf8').replace(/^.*\[alpha\].*\n/m, '');
  writeFileSync(agentsPath, withoutRow);
  rmSync(adapterPath);
  await sync(state.consumer, { output: () => undefined });
  assert.equal(existsSync(emitted), false);
  assert.doesNotMatch(readFileSync(agentsPath, 'utf8'), /\[alpha\]/);
  assert.equal(existsSync(adapterPath), false);
});

test('preserves an unsafe Override path and suppresses target projection synthesis', async (context) => {
  const state = fixture(context, ['alpha']);
  await converge(state);
  writeFileSync(
    join(state.consumer, '.skillfoo.yml'),
    'registry: ../registry\nskills: [alpha]\noverrides: { alpha: local }\n',
  );
  const emitted = join(state.consumer, '.agents', 'skills', 'alpha');
  const adapterPath = join(state.consumer, '.claude', 'skills', 'alpha');
  rmSync(emitted, { recursive: true });
  writeFileSync(emitted, 'unsafe Override shape\n');
  const agentsPath = join(state.consumer, 'AGENTS.md');
  writeFileSync(agentsPath, readFileSync(agentsPath, 'utf8').replace(/^.*\[alpha\].*\n/m, ''));
  rmSync(adapterPath);

  const plan = planReconciliation(state.consumer);
  assert.deepEqual(
    { state: record(plan, 'alpha').state, reason: record(plan, 'alpha').reason },
    { state: 'drifted', reason: 'emitted_path_not_managed_directory' },
  );
  assert.equal(
    plan.projections.some(
      (projection) => projection.kind === 'claude_adapter' && projection.skill === 'alpha',
    ),
    false,
  );
  await sync(state.consumer, { output: () => undefined });
  assert.equal(readFileSync(emitted, 'utf8'), 'unsafe Override shape\n');
  assert.doesNotMatch(readFileSync(agentsPath, 'utf8'), /\[alpha\]/);
  assert.equal(existsSync(adapterPath), false);
});

test('rejects contradictory or unowned Override policy before planning mutations', async (context) => {
  const state = fixture(context, ['alpha', 'beta']);
  await converge(state);
  writeFileSync(
    join(state.consumer, '.skillfoo.yml'),
    'registry: ../registry\nskills: [beta]\noverrides: { alpha: local }\n',
  );
  assert.throws(() => planReconciliation(state.consumer), /override must also be selected.*alpha/);

  writeFileSync(
    join(state.consumer, '.skillfoo.yml'),
    'registry: ../registry\nskills: [alpha]\noverrides: { alpha: local }\n',
  );
  const lock = readLock(state.consumer);
  delete lock.skills.alpha;
  writeLock(state.consumer, lock);
  assert.throws(() => planReconciliation(state.consumer), /override has no Managed ownership.*alpha/);
});
