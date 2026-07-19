import assert from 'node:assert/strict';
import {
  existsSync,
  chmodSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
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

function fixture(
  context: TestContext,
  names: readonly string[] = ['alpha'],
  rootPrefix = 'skillfoo-resolve-',
): Fixture {
  const root = mkdtempSync(join(tmpdir(), rootPrefix));
  const registry = join(root, 'registry');
  const consumer = join(root, 'consumer');
  mkdirSync(registry);
  mkdirSync(consumer);
  for (const name of names) writeSkill(registry, name);
  writeFileSync(
    join(consumer, '.skillfoo.yml'),
    `registry: ../registry\nskills: ${JSON.stringify(names)}\n`,
  );
  writeLock(consumer, { lockfileVersion: 1, skills: {} });
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
  const roots = [state.consumer, join(state.consumer, '.agents', 'skills')];
  return roots.flatMap((root) =>
    existsSync(root)
      ? readdirSync(root)
          .filter((name) => name.startsWith('.skillfoo-resolve-'))
          .map((name) => join(root, name))
      : [],
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
      /stale evidence.*content changed after classification/,
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
      /stale evidence.*no longer a real directory/,
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
  assert.equal(existsSync(join(match[1], 'manifest.json')), true);
  assert.deepEqual(readFileSync(join(match[1], 'target.before', 'SKILL.md')), localContents);
});

test('persists an exact recovery tree under a non-ASCII consumer path', async (context) => {
  const state = fixture(context, ['alpha'], 'skillfoo-resolve-ünicode-');
  await converge(state);
  editLocal(state, 'alpha');
  const target = join(state.consumer, '.agents', 'skills', 'alpha');
  mkdirSync(join(target, 'nested', 'empty'), { recursive: true });
  writeFileSync(join(target, 'nested', 'local.txt'), 'local recovery data\n');
  const before = snapshotTree(target);

  assert.throws(
    () =>
      resolveSkill(state.consumer, 'alpha', {
        direction: 'keep_local',
        hooks: {
          afterStep: (step) => {
            if (step !== 'recovery_persisted') return;
            const transaction = transactionArtifacts(state)[0];
            assert.ok(transaction);
            assert.deepEqual(snapshotTree(join(transaction, 'recovery', 'target.before')), before);
            throw new Error('injected after Unicode recovery snapshot');
          },
        },
      }),
    /injected after Unicode recovery snapshot/,
  );

  assert.deepEqual(snapshotTree(target), before);
  assert.deepEqual(transactionArtifacts(state), []);
});

test('refuses symbolic links in a recovery tree before mutation', async (context) => {
  const state = fixture(context);
  await converge(state);
  editLocal(state, 'alpha');
  const foreign = join(state.root, 'foreign-recovery-target');
  mkdirSync(foreign);
  writeFileSync(join(foreign, 'marker.txt'), 'foreign\n');
  symlinkSync(
    foreign,
    join(state.consumer, '.agents', 'skills', 'alpha', 'nested-link'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const before = snapshotTree(state.consumer);

  assert.throws(
    () => resolveSkill(state.consumer, 'alpha', { direction: 'keep_local' }),
    /unsafe recovery source.*symbolic links are not supported/,
  );

  assert.deepEqual(snapshotTree(state.consumer), before);
  assert.deepEqual(transactionArtifacts(state), []);
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

test('keeps one local Conflict as a live Override and reverses it with take-registry', async (context) => {
  const state = fixture(context, ['alpha', 'beta']);
  await converge(state);
  editLocal(state, 'alpha', 'Alpha customized in this repository. More detail.');
  const localOnly = join(state.consumer, '.agents', 'skills', 'alpha', 'local-only.txt');
  writeFileSync(localOnly, 'keep local\n');
  rmSync(join(state.consumer, '.claude', 'skills', 'alpha'));
  writeFileSync(
    join(state.consumer, '.skillfoo.yml'),
    '# consumer policy\nregistry: ../registry # local source\nskills: [alpha, beta]\n' +
      'future-settings:\n  reviewer: "keep this" # future key\n',
  );
  const localBefore = snapshotTree(join(state.consumer, '.agents', 'skills', 'alpha'));
  const lockBefore = readFileSync(join(state.consumer, '.skillfoo.lock'));
  const alphaEntryBefore = readLock(state.consumer).skills.alpha;

  const kept = resolveSkill(state.consumer, 'alpha', { direction: 'keep_local' });

  assert.equal(kept.action, 'kept_local');
  assert.equal(kept.exitCode, 0);
  assert.deepEqual(snapshotTree(join(state.consumer, '.agents', 'skills', 'alpha')), localBefore);
  assert.deepEqual(readFileSync(join(state.consumer, '.skillfoo.lock')), lockBefore);
  assert.deepEqual(readLock(state.consumer).skills.alpha, alphaEntryBefore);
  const config = readFileSync(join(state.consumer, '.skillfoo.yml'), 'utf8');
  assert.match(config, /^# consumer policy/m);
  assert.match(config, /reviewer: "keep this" # future key/);
  assert.match(config, /overrides:\n  alpha: local/);
  const agents = readFileSync(join(state.consumer, 'AGENTS.md'), 'utf8');
  assert.match(agents, /Alpha customized in this repository\. \(local override; edit in this repository\)/);
  assert.match(agents, /managed by skillfoo/);
  assert.equal(lstatSync(join(state.consumer, '.claude', 'skills', 'alpha')).isSymbolicLink(), true);

  editLocal(state, 'alpha', 'A later local description.');
  const retried = resolveSkill(state.consumer, 'alpha', { direction: 'keep_local' });
  assert.equal(retried.action, 'already_overridden');
  assert.match(readFileSync(join(state.consumer, 'AGENTS.md'), 'utf8'), /A later local description/);
  const stable = snapshotTree(state.consumer);
  const noOp = resolveSkill(state.consumer, 'alpha', { direction: 'keep_local' });
  assert.equal(noOp.action, 'already_overridden');
  assert.deepEqual(snapshotTree(state.consumer), stable);

  writeSkill(state.registry, 'alpha', 'New registry authority.');
  const taken = resolveSkill(state.consumer, 'alpha', { direction: 'take_registry' });
  assert.equal(taken.action, 'replaced');
  assert.equal(taken.exitCode, 0);
  assert.equal(existsSync(localOnly), false);
  assert.equal(
    hashSkillDir(join(state.consumer, '.agents', 'skills', 'alpha')),
    hashSkillDir(join(state.registry, 'alpha')),
  );
  assert.doesNotMatch(readFileSync(join(state.consumer, '.skillfoo.yml'), 'utf8'), /overrides:/);
  assert.match(readFileSync(join(state.consumer, '.skillfoo.yml'), 'utf8'), /reviewer: "keep this"/);
  assert.doesNotMatch(managedRow(readFileSync(join(state.consumer, 'AGENTS.md'), 'utf8'), 'alpha'), /local override/);
});

test('take-registry restores missing Override content but refuses a missing source', async (context) => {
  const state = fixture(context);
  await converge(state);
  editLocal(state, 'alpha');
  resolveSkill(state.consumer, 'alpha', { direction: 'keep_local' });
  const emitted = join(state.consumer, '.agents', 'skills', 'alpha');
  rmSync(join(state.consumer, '.agents'), { recursive: true });

  const restored = resolveSkill(state.consumer, 'alpha', { direction: 'take_registry' });
  assert.equal(restored.action, 'replaced');
  assert.equal(realDirectoryForTest(emitted), true);
  assert.doesNotMatch(readFileSync(join(state.consumer, '.skillfoo.yml'), 'utf8'), /overrides:/);

  editLocal(state, 'alpha');
  resolveSkill(state.consumer, 'alpha', { direction: 'keep_local' });
  rmSync(join(state.registry, 'alpha'), { recursive: true });
  const before = snapshotTree(state.consumer);
  assert.throws(
    () => resolveSkill(state.consumer, 'alpha', { direction: 'take_registry' }),
    (error: unknown) => error instanceof ResolutionRefusalError && error.state === 'override',
  );
  assert.deepEqual(snapshotTree(state.consumer), before);
});

function realDirectoryForTest(path: string): boolean {
  const stat = lstatSync(path);
  return stat.isDirectory() && !stat.isSymbolicLink();
}

test('keep-local records policy while preserving a foreign adapter as residual conflict', async (context) => {
  const state = fixture(context);
  await converge(state);
  editLocal(state, 'alpha');
  const adapter = join(state.consumer, '.claude', 'skills', 'alpha');
  rmSync(adapter);
  writeFileSync(adapter, 'foreign adapter\n');

  const result = resolveSkill(state.consumer, 'alpha', { direction: 'keep_local' });
  assert.equal(result.action, 'kept_local');
  assert.equal(result.exitCode, 3);
  assert.equal(readFileSync(adapter, 'utf8'), 'foreign adapter\n');
  assert.match(readFileSync(join(state.consumer, '.skillfoo.yml'), 'utf8'), /alpha: local/);
});

test('keep-local handled failures restore exact config and AGENTS.md bytes', async (context) => {
  const state = fixture(context);
  await converge(state);
  editLocal(state, 'alpha');
  const before = snapshotTree(state.consumer);

  assert.throws(
    () =>
      resolveSkill(state.consumer, 'alpha', {
        direction: 'keep_local',
        hooks: {
          afterStep: (step) => {
            if (step === 'agents_updated') throw new Error('injected keep-local failure');
          },
        },
      }),
    /injected keep-local failure.*previous state restored/,
  );
  assert.deepEqual(snapshotTree(state.consumer), before);
  assert.deepEqual(transactionArtifacts(state), []);
});

test('resolver refuses redirected root metadata before either direction mutates', async (context) => {
  for (const direction of ['keep_local', 'take_registry'] as const) {
    for (const name of ['.skillfoo.yml', '.skillfoo.lock', 'AGENTS.md'] as const) {
      const state = fixture(context);
      await converge(state);
      editLocal(state, 'alpha');
      const path = join(state.consumer, name);
      const sentinel = join(state.root, `${direction}-${name.replaceAll('.', '_')}.sentinel`);
      renameSync(path, sentinel);
      symlinkSync(sentinel, path, 'file');
      const sentinelBefore = readFileSync(sentinel);
      const before = snapshotTree(state.consumer);

      assert.throws(
        () => resolveSkill(state.consumer, 'alpha', { direction }),
        /unsafe; expected a real regular file/,
      );
      assert.deepEqual(readFileSync(sentinel), sentinelBefore);
      assert.deepEqual(snapshotTree(state.consumer), before);
    }
  }
});

test('resolver refuses root metadata directories before either direction mutates', async (context) => {
  for (const direction of ['keep_local', 'take_registry'] as const) {
    for (const name of ['.skillfoo.yml', '.skillfoo.lock', 'AGENTS.md'] as const) {
      const state = fixture(context);
      await converge(state);
      editLocal(state, 'alpha');
      const path = join(state.consumer, name);
      renameSync(path, join(state.root, `${direction}-${name.replaceAll('.', '_')}.before`));
      mkdirSync(path);
      const before = snapshotTree(state.consumer);

      assert.throws(
        () => resolveSkill(state.consumer, 'alpha', { direction }),
        /unsafe; expected a real regular file/,
      );
      assert.deepEqual(snapshotTree(state.consumer), before);
    }
  }
});

test('stale config evidence aborts before mutation and preserves the concurrent edit', async (context) => {
  const state = fixture(context);
  await converge(state);
  editLocal(state, 'alpha');
  const configPath = join(state.consumer, '.skillfoo.yml');
  const concurrent = 'registry: ../registry\nskills: [alpha]\n# concurrent edit\n';

  assert.throws(
    () =>
      resolveSkill(state.consumer, 'alpha', {
        direction: 'keep_local',
        hooks: {
          beforeRevalidation: () => writeFileSync(configPath, concurrent),
        },
      }),
    /stale evidence.*\.skillfoo\.yml/,
  );
  assert.equal(readFileSync(configPath, 'utf8'), concurrent);
  assert.deepEqual(transactionArtifacts(state), []);
});

test('compare-and-set rollback preserves a concurrent config replacement and durable snapshots', async (context) => {
  const state = fixture(context);
  await converge(state);
  editLocal(state, 'alpha');
  const configPath = join(state.consumer, '.skillfoo.yml');
  const configBefore = readFileSync(configPath);
  const lockBefore = readFileSync(join(state.consumer, '.skillfoo.lock'));
  const agentsBefore = readFileSync(join(state.consumer, 'AGENTS.md'));
  const concurrent =
    'registry: ../registry\nskills: [alpha]\noverrides: { alpha: local }\nconcurrent: true\n';

  let thrown: unknown;
  try {
    resolveSkill(state.consumer, 'alpha', {
      direction: 'keep_local',
      hooks: {
        afterStep: (step) => {
          if (step !== 'config_updated') return;
          writeFileSync(configPath, concurrent);
          throw new Error('injected concurrent config replacement');
        },
      },
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof Error);
  const match = /recovery data preserved at (.+)$/.exec(thrown.message);
  assert.ok(match?.[1]);
  assert.match(thrown.message, /rollback incomplete.*config.*changed/);
  assert.equal(readFileSync(configPath, 'utf8'), concurrent);
  assert.deepEqual(readFileSync(join(match[1], 'config.before')), configBefore);
  assert.deepEqual(readFileSync(join(match[1], 'lock.before')), lockBefore);
  assert.deepEqual(readFileSync(join(match[1], 'AGENTS.before')), agentsBefore);
  assert.equal(existsSync(join(match[1], 'manifest.json')), true);
});

test('atomic resolver metadata writes preserve hardlink sentinels and file modes', {
  skip: process.platform === 'win32',
}, async (context) => {
  const state = fixture(context);
  await converge(state);
  editLocal(state, 'alpha');
  const configPath = join(state.consumer, '.skillfoo.yml');
  const agentsPath = join(state.consumer, 'AGENTS.md');
  const lockPath = join(state.consumer, '.skillfoo.lock');
  chmodSync(configPath, 0o640);
  const configSentinel = join(state.root, 'config.keep.sentinel');
  const agentsSentinel = join(state.root, 'agents.keep.sentinel');
  const lockSentinel = join(state.root, 'lock.keep.sentinel');
  linkSync(configPath, configSentinel);
  linkSync(agentsPath, agentsSentinel);
  linkSync(lockPath, lockSentinel);
  const keepBefore = {
    config: readFileSync(configSentinel),
    agents: readFileSync(agentsSentinel),
    lock: readFileSync(lockSentinel),
    configInode: lstatSync(configSentinel).ino,
    agentsInode: lstatSync(agentsSentinel).ino,
    lockInode: lstatSync(lockSentinel).ino,
  };

  resolveSkill(state.consumer, 'alpha', { direction: 'keep_local' });
  assert.deepEqual(readFileSync(configSentinel), keepBefore.config);
  assert.deepEqual(readFileSync(agentsSentinel), keepBefore.agents);
  assert.deepEqual(readFileSync(lockSentinel), keepBefore.lock);
  assert.notEqual(lstatSync(configPath).ino, keepBefore.configInode);
  assert.notEqual(lstatSync(agentsPath).ino, keepBefore.agentsInode);
  assert.equal(lstatSync(lockPath).ino, keepBefore.lockInode);
  assert.equal(lstatSync(configPath).mode & 0o777, 0o640);

  writeSkill(state.registry, 'alpha', 'Changed registry baseline.');
  const takeConfigSentinel = join(state.root, 'config.take.sentinel');
  const takeAgentsSentinel = join(state.root, 'agents.take.sentinel');
  const takeLockSentinel = join(state.root, 'lock.take.sentinel');
  linkSync(configPath, takeConfigSentinel);
  linkSync(agentsPath, takeAgentsSentinel);
  linkSync(lockPath, takeLockSentinel);
  const takeBefore = {
    config: readFileSync(takeConfigSentinel),
    agents: readFileSync(takeAgentsSentinel),
    lock: readFileSync(takeLockSentinel),
    configInode: lstatSync(takeConfigSentinel).ino,
    agentsInode: lstatSync(takeAgentsSentinel).ino,
    lockInode: lstatSync(takeLockSentinel).ino,
  };

  resolveSkill(state.consumer, 'alpha', { direction: 'take_registry' });
  assert.deepEqual(readFileSync(takeConfigSentinel), takeBefore.config);
  assert.deepEqual(readFileSync(takeAgentsSentinel), takeBefore.agents);
  assert.deepEqual(readFileSync(takeLockSentinel), takeBefore.lock);
  assert.notEqual(lstatSync(configPath).ino, takeBefore.configInode);
  assert.notEqual(lstatSync(agentsPath).ino, takeBefore.agentsInode);
  assert.notEqual(lstatSync(lockPath).ino, takeBefore.lockInode);
  assert.equal(lstatSync(configPath).mode & 0o777, 0o640);
});
