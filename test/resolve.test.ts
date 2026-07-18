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
import {
  resolveSkill,
  ResolutionRefusalError,
  type ResolutionHookStep,
} from '../src/resolve.js';
import { hashSkillDir } from '../src/skilldir.js';
import { sync } from '../src/sync.js';

interface Fixture {
  root: string;
  registry: string;
  consumer: string;
}

function writeSkill(
  registry: string,
  name: string,
  description = `${name} registry guidance.`,
  body = `# ${name} registry`,
): void {
  const dir = join(registry, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`,
  );
}

function fixture(context: TestContext, names: readonly string[] = ['alpha']): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-resolve-'));
  const registry = join(root, 'registry');
  const consumer = join(root, 'consumer');
  mkdirSync(registry);
  mkdirSync(consumer);
  for (const name of names) writeSkill(registry, name);
  writeFileSync(
    join(consumer, '.skillfoo.yml'),
    `registry: ../registry\nskills: ${JSON.stringify(names)}\n`,
  );
  context.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, registry, consumer };
}

async function converge(state: Fixture): Promise<void> {
  await sync(state.consumer, { output: () => undefined });
}

function editLocal(state: Fixture, name: string, description = `${name} local guidance.`): void {
  writeFileSync(
    join(state.consumer, '.agents', 'skills', name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name} local\n`,
  );
}

function configure(state: Fixture, names: readonly string[]): void {
  writeFileSync(
    join(state.consumer, '.skillfoo.yml'),
    `registry: ../registry\nskills: ${JSON.stringify(names)}\n`,
  );
}

function managedRow(contents: string, name: string): string {
  const row = contents.match(new RegExp(`^[\\t ]*- \\[${name}\\].*(?:\\r?\\n|$)`, 'm'))?.[0];
  assert.ok(row, `expected managed row for ${name}`);
  return row;
}

function snapshotTree(root: string): string[] {
  const entries: string[] = [];
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const key = relative(root, path).split('\\').join('/');
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) entries.push(`link ${key} -> ${readlinkSync(path)}`);
      else if (stat.isDirectory()) {
        entries.push(`dir ${key}`);
        visit(path);
      } else if (stat.isFile()) {
        entries.push(`file ${key} ${readFileSync(path).toString('base64')}`);
      } else entries.push(`special ${key}`);
    }
  };
  visit(root);
  return entries;
}

function transactionArtifacts(state: Fixture): string[] {
  return readdirSync(join(state.consumer, '.agents', 'skills')).filter((name) =>
    name.startsWith('.skillfoo-resolve-'),
  );
}

test('takes the registry for one conflict and leaves another conflict byte-for-byte untouched', async (context) => {
  const state = fixture(context, ['alpha', 'beta']);
  await converge(state);
  editLocal(state, 'alpha');
  editLocal(state, 'beta');
  writeFileSync(join(state.consumer, '.agents', 'skills', 'alpha', 'local-only.txt'), 'discard\n');
  await sync(state.consumer, { output: () => undefined });
  rmSync(join(state.consumer, '.claude', 'skills', 'alpha'));

  const agentsBefore = readFileSync(join(state.consumer, 'AGENTS.md'), 'utf8');
  const betaBefore = {
    tree: snapshotTree(join(state.consumer, '.agents', 'skills', 'beta')),
    entry: readLock(state.consumer).skills.beta,
    row: managedRow(agentsBefore, 'beta'),
    adapter: readlinkSync(join(state.consumer, '.claude', 'skills', 'beta')),
  };

  const result = resolveSkill(state.consumer, 'alpha');

  assert.equal(result.action, 'replaced');
  assert.equal(result.exitCode, 3);
  assert.equal(
    hashSkillDir(join(state.consumer, '.agents', 'skills', 'alpha')),
    hashSkillDir(join(state.registry, 'alpha')),
  );
  assert.equal(existsSync(join(state.consumer, '.agents', 'skills', 'alpha', 'local-only.txt')), false);
  assert.deepEqual(readLock(state.consumer).skills.alpha, {
    source: '../registry',
    hash: hashSkillDir(join(state.registry, 'alpha')),
  });
  assert.equal(lstatSync(join(state.consumer, '.claude', 'skills', 'alpha')).isSymbolicLink(), true);
  const agentsAfter = readFileSync(join(state.consumer, 'AGENTS.md'), 'utf8');
  assert.match(managedRow(agentsAfter, 'alpha'), /alpha registry guidance\./);
  assert.deepEqual(snapshotTree(join(state.consumer, '.agents', 'skills', 'beta')), betaBefore.tree);
  assert.deepEqual(readLock(state.consumer).skills.beta, betaBefore.entry);
  assert.equal(managedRow(agentsAfter, 'beta'), betaBefore.row);
  assert.equal(readlinkSync(join(state.consumer, '.claude', 'skills', 'beta')), betaBefore.adapter);
  assert.deepEqual(transactionArtifacts(state), []);
});

test('returns changes-available without applying an unrelated safe update', async (context) => {
  const state = fixture(context, ['alpha', 'beta']);
  await converge(state);
  editLocal(state, 'alpha');
  await sync(state.consumer, { output: () => undefined });
  writeSkill(state.registry, 'beta', 'beta refreshed registry guidance.');
  const agentsBefore = readFileSync(join(state.consumer, 'AGENTS.md'), 'utf8');
  const betaBefore = {
    tree: snapshotTree(join(state.consumer, '.agents', 'skills', 'beta')),
    entry: readLock(state.consumer).skills.beta,
    row: managedRow(agentsBefore, 'beta'),
    adapter: readlinkSync(join(state.consumer, '.claude', 'skills', 'beta')),
  };

  const result = resolveSkill(state.consumer, 'alpha');

  assert.equal(result.exitCode, 2);
  assert.equal(result.plan.skills.find(({ name }) => name === 'beta')?.state, 'update');
  const agentsAfter = readFileSync(join(state.consumer, 'AGENTS.md'), 'utf8');
  assert.deepEqual(snapshotTree(join(state.consumer, '.agents', 'skills', 'beta')), betaBefore.tree);
  assert.deepEqual(readLock(state.consumer).skills.beta, betaBefore.entry);
  assert.equal(managedRow(agentsAfter, 'beta'), betaBefore.row);
  assert.equal(readlinkSync(join(state.consumer, '.claude', 'skills', 'beta')), betaBefore.adapter);
});

test('preserves a foreign target adapter as a residual conflict', async (context) => {
  const state = fixture(context);
  await converge(state);
  editLocal(state, 'alpha');
  await sync(state.consumer, { output: () => undefined });
  const adapter = join(state.consumer, '.claude', 'skills', 'alpha');
  rmSync(adapter);
  writeFileSync(adapter, 'foreign adapter\n');

  const result = resolveSkill(state.consumer, 'alpha');

  assert.equal(result.exitCode, 3);
  assert.equal(readFileSync(adapter, 'utf8'), 'foreign adapter\n');
  assert.equal(result.plan.skills[0]?.state, 'unchanged');
  const projection = result.plan.projections.find(
    (record) => record.kind === 'claude_adapter' && record.skill === 'alpha',
  );
  assert.equal(projection?.state, 'blocked');
  assert.equal(
    projection?.kind === 'claude_adapter' ? projection.reason : undefined,
    'unmanaged_destination',
  );
});

test('accepts only the exact unchanged Managed retry and refuses lock-update or Bespoke states', async (context) => {
  const state = fixture(context);
  await converge(state);
  const stable = snapshotTree(state.consumer);

  const noOp = resolveSkill(state.consumer, 'alpha');
  assert.equal(noOp.action, 'already_current');
  assert.equal(noOp.exitCode, 0);
  assert.deepEqual(snapshotTree(state.consumer), stable);

  const lock = readLock(state.consumer);
  const alpha = lock.skills.alpha;
  assert.ok(alpha);
  writeLock(state.consumer, {
    ...lock,
    skills: { ...lock.skills, alpha: { ...alpha, source: 'old-registry' } },
  });
  const lockUpdateBefore = snapshotTree(state.consumer);
  assert.throws(
    () => resolveSkill(state.consumer, 'alpha'),
    (error: unknown) =>
      error instanceof ResolutionRefusalError && error.state === 'lock_update',
  );
  assert.deepEqual(snapshotTree(state.consumer), lockUpdateBefore);

  const bespoke = fixture(context);
  mkdirSync(join(bespoke.consumer, '.agents', 'skills', 'alpha'), { recursive: true });
  writeFileSync(join(bespoke.consumer, '.agents', 'skills', 'alpha', 'SKILL.md'), 'bespoke\n');
  const bespokeBefore = snapshotTree(bespoke.consumer);
  assert.throws(
    () => resolveSkill(bespoke.consumer, 'alpha'),
    (error: unknown) =>
      error instanceof ResolutionRefusalError && error.state === 'blocked',
  );
  assert.deepEqual(snapshotTree(bespoke.consumer), bespokeBefore);
});

for (const staleKind of ['local', 'registry', 'lock'] as const) {
  test(`stale ${staleKind} evidence aborts before replacement and cleans staging`, async (context) => {
    const state = fixture(context);
    await converge(state);
    editLocal(state, 'alpha');
    await sync(state.consumer, { output: () => undefined });
    const emitted = join(state.consumer, '.agents', 'skills', 'alpha', 'SKILL.md');
    const previousEntry = readLock(state.consumer).skills.alpha;
    assert.ok(previousEntry);

    assert.throws(
      () =>
        resolveSkill(state.consumer, 'alpha', {
          hooks: {
            beforeRevalidation: () => {
              if (staleKind === 'local') writeFileSync(emitted, 'newer local edit\n');
              else if (staleKind === 'registry') writeSkill(state.registry, 'alpha', 'new registry evidence.');
              else {
                writeLock(state.consumer, {
                  lockfileVersion: 1,
                  skills: {
                    alpha: { ...previousEntry, source: 'concurrently-changed' },
                  },
                });
              }
            },
          },
        }),
      /stale evidence/,
    );

    assert.notEqual(readFileSync(emitted, 'utf8'), readFileSync(join(state.registry, 'alpha', 'SKILL.md'), 'utf8'));
    assert.deepEqual(transactionArtifacts(state), []);
  });
}

for (const boundaryKind of ['local', 'registry'] as const) {
  test(`${boundaryKind} evidence changed after revalidation is refused at the swap boundary`, async (context) => {
    const state = fixture(context);
    await converge(state);
    editLocal(state, 'alpha');
    await sync(state.consumer, { output: () => undefined });
    const emitted = join(state.consumer, '.agents', 'skills', 'alpha', 'SKILL.md');
    const localBefore = readFileSync(emitted);
    const consumerBefore = snapshotTree(state.consumer);
    const newerLocal = 'newer local edit at replacement boundary\n';

    assert.throws(
      () =>
        resolveSkill(state.consumer, 'alpha', {
          hooks: {
            afterStep: (step) => {
              if (step !== 'revalidated') return;
              if (boundaryKind === 'local') writeFileSync(emitted, newerLocal);
              else writeSkill(state.registry, 'alpha', 'new registry at replacement boundary.');
            },
          },
        }),
      /stale evidence.*replacement boundary.*previous state restored/,
    );

    if (boundaryKind === 'local') {
      assert.equal(readFileSync(emitted, 'utf8'), newerLocal);
    } else {
      assert.deepEqual(readFileSync(emitted), localBefore);
      assert.deepEqual(snapshotTree(state.consumer), consumerBefore);
    }
    assert.deepEqual(transactionArtifacts(state), []);
  });
}

for (const shape of ['file', 'symlink'] as const) {
  test(`a target changed to a ${shape} after revalidation is moved back exactly`, async (context) => {
    const state = fixture(context);
    await converge(state);
    editLocal(state, 'alpha');
    await sync(state.consumer, { output: () => undefined });
    const destination = join(state.consumer, '.agents', 'skills', 'alpha');
    const foreign = join(state.root, 'foreign-target');
    mkdirSync(foreign);
    writeFileSync(join(foreign, 'marker'), 'foreign marker\n');

    assert.throws(
      () =>
        resolveSkill(state.consumer, 'alpha', {
          hooks: {
            afterStep: (step) => {
              if (step !== 'revalidated') return;
              rmSync(destination, { recursive: true });
              if (shape === 'file') writeFileSync(destination, 'new target file\n');
              else {
                symlinkSync(
                  foreign,
                  destination,
                  process.platform === 'win32' ? 'junction' : 'dir',
                );
              }
            },
          },
        }),
      /stale evidence.*replacement boundary.*previous state restored/,
    );

    if (shape === 'file') {
      assert.equal(lstatSync(destination).isFile(), true);
      assert.equal(readFileSync(destination, 'utf8'), 'new target file\n');
    } else {
      assert.equal(lstatSync(destination).isSymbolicLink(), true);
      assert.equal(readFileSync(join(destination, 'marker'), 'utf8'), 'foreign marker\n');
    }
    assert.deepEqual(transactionArtifacts(state), []);
  });
}

type RefusalCase = {
  label: string;
  target?: string;
  state: 'not_managed' | 'add' | 'update' | 'remove' | 'removal_blocked' | 'blocked' | 'drifted';
  reason?: 'emitted_path_not_managed_directory';
  prepare(state: Fixture): Promise<void>;
};

const refusalCases: readonly RefusalCase[] = [
  {
    label: 'missing target ownership',
    target: 'beta',
    state: 'not_managed',
    prepare: async () => undefined,
  },
  {
    label: 'safe add',
    state: 'add',
    prepare: async () => undefined,
  },
  {
    label: 'safe update',
    state: 'update',
    prepare: async (state) => {
      await converge(state);
      writeSkill(state.registry, 'alpha', 'refreshed alpha guidance.');
    },
  },
  {
    label: 'safe removal',
    state: 'remove',
    prepare: async (state) => {
      await converge(state);
      configure(state, []);
    },
  },
  {
    label: 'blocked removal',
    state: 'removal_blocked',
    prepare: async (state) => {
      await converge(state);
      editLocal(state, 'alpha');
      configure(state, []);
    },
  },
  {
    label: 'missing ownership at a Desired path',
    state: 'blocked',
    prepare: async (state) => {
      mkdirSync(join(state.consumer, '.agents', 'skills', 'alpha'), { recursive: true });
      writeFileSync(join(state.consumer, '.agents', 'skills', 'alpha', 'SKILL.md'), 'bespoke\n');
    },
  },
  {
    label: 'non-local-change drift',
    state: 'drifted',
    reason: 'emitted_path_not_managed_directory',
    prepare: async (state) => {
      await converge(state);
      const destination = join(state.consumer, '.agents', 'skills', 'alpha');
      rmSync(destination, { recursive: true });
      writeFileSync(destination, 'unsafe managed shape\n');
    },
  },
];

for (const refusal of refusalCases) {
  test(`refuses ${refusal.label} without writing consumer state`, async (context) => {
    const state = fixture(context);
    await refusal.prepare(state);
    const before = snapshotTree(state.consumer);
    assert.throws(
      () => resolveSkill(state.consumer, refusal.target ?? 'alpha'),
      (error: unknown) =>
        error instanceof ResolutionRefusalError &&
        error.state === refusal.state &&
        (refusal.reason === undefined || error.reason === refusal.reason),
    );
    assert.deepEqual(snapshotTree(state.consumer), before);
  });
}

const failureSteps: readonly ResolutionHookStep[] = [
  'staged',
  'revalidated',
  'target_recovered',
  'target_installed',
  'lock_updated',
  'agents_updated',
  'adapter_reconciled',
  'classified',
];

for (const failureStep of failureSteps) {
  test(`handled failure after ${failureStep} restores the complete prior consumer state`, async (context) => {
    const state = fixture(context);
    await converge(state);
    editLocal(state, 'alpha');
    writeFileSync(join(state.consumer, '.agents', 'skills', 'alpha', 'local-only.txt'), 'preserve\n');
    await sync(state.consumer, { output: () => undefined });
    rmSync(join(state.consumer, '.claude'), { recursive: true });
    const before = snapshotTree(state.consumer);

    assert.throws(
      () =>
        resolveSkill(state.consumer, 'alpha', {
          hooks: {
            afterStep: (step) => {
              if (step === failureStep) throw new Error(`injected ${step} failure`);
            },
          },
        }),
      failureStep === 'staged' || failureStep === 'revalidated'
        ? /injected .* failure/
        : /injected .* failure.*previous state restored/,
    );
    assert.deepEqual(snapshotTree(state.consumer), before);
    assert.deepEqual(transactionArtifacts(state), []);
  });
}

test('an incomplete rollback preserves and reports the exact recovery path', async (context) => {
  const state = fixture(context);
  await converge(state);
  editLocal(state, 'alpha');
  const localContents = readFileSync(
    join(state.consumer, '.agents', 'skills', 'alpha', 'SKILL.md'),
  );

  let thrown: unknown;
  try {
    resolveSkill(state.consumer, 'alpha', {
      hooks: {
        afterStep: (step) => {
          if (step === 'target_installed') {
            writeFileSync(
              join(state.consumer, '.agents', 'skills', 'alpha', 'concurrent.txt'),
              'prevents rollback\n',
            );
            throw new Error('injected rollback failure');
          }
        },
      },
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof Error);
  const match = /recovery data preserved at (.+)$/.exec(thrown.message);
  assert.ok(match?.[1]);
  assert.equal(existsSync(match[1]), true);
  assert.deepEqual(readFileSync(join(match[1], 'SKILL.md')), localContents);
});

test('rollback preserves foreign content that replaces its created adapter', async (context) => {
  const state = fixture(context);
  await converge(state);
  editLocal(state, 'alpha');
  await sync(state.consumer, { output: () => undefined });
  const adapter = join(state.consumer, '.claude', 'skills', 'alpha');
  rmSync(adapter);
  const localBefore = readFileSync(
    join(state.consumer, '.agents', 'skills', 'alpha', 'SKILL.md'),
  );
  const lockBefore = readFileSync(join(state.consumer, '.skillfoo.lock'));
  const agentsBefore = readFileSync(join(state.consumer, 'AGENTS.md'));

  let thrown: unknown;
  try {
    resolveSkill(state.consumer, 'alpha', {
      hooks: {
        afterStep: (step) => {
          if (step !== 'adapter_reconciled') return;
          rmSync(adapter);
          writeFileSync(adapter, 'concurrent foreign adapter\n');
          throw new Error('injected failure after foreign adapter replacement');
        },
      },
    });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof Error);
  assert.match(thrown.message, /rollback incomplete.*foreign adapter content.*recovery data preserved/);
  assert.equal(readFileSync(adapter, 'utf8'), 'concurrent foreign adapter\n');
  assert.deepEqual(
    readFileSync(join(state.consumer, '.agents', 'skills', 'alpha', 'SKILL.md')),
    localBefore,
  );
  assert.deepEqual(readFileSync(join(state.consumer, '.skillfoo.lock')), lockBefore);
  assert.deepEqual(readFileSync(join(state.consumer, 'AGENTS.md')), agentsBefore);
});
