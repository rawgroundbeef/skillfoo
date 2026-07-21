import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test, { type TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';
import { initializeProject, InitReconciliationError } from '../src/init.js';
import { planReconciliation } from '../src/plan.js';
import { sync } from '../src/sync.js';

interface Fixture {
  root: string;
  registry: string;
  consumer: string;
}

function writeSkill(registry: string, name: string): void {
  const dir = join(registry, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name} guidance.\n---\n\n# ${name}\n`,
  );
}

function fixture(context: TestContext): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-init-'));
  const registry = join(root, 'registry');
  const consumer = join(root, 'consumer');
  mkdirSync(registry);
  mkdirSync(consumer);
  writeSkill(registry, 'beta');
  writeSkill(registry, 'alpha');
  context.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, registry, consumer };
}

function snapshot(root: string): string[] {
  const result: string[] = [];
  function visit(dir: string): void {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const key = relative(root, path).split('\\').join('/');
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) result.push(`link ${key} -> ${readlinkSync(path)}`);
      else if (stat.isDirectory()) {
        result.push(`dir ${key}`);
        visit(path);
      } else result.push(`file ${key} ${readFileSync(path).toString('base64')}`);
    }
  }
  visit(root);
  return result;
}

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
}

test('initializes a normalized explicit selection and finishes converged', async (context) => {
  const state = fixture(context);
  const output: string[] = [];

  const result = await initializeProject(
    state.consumer,
    {
      registry: '../registry',
      selection: { kind: 'named', names: ['beta', 'alpha', 'beta'] },
    },
    { output: (message) => output.push(message) },
  );

  assert.equal(result.reconciliation.outcome, 'converged');
  assert.deepEqual(result.selection, { kind: 'named', names: ['beta', 'alpha'] });
  assert.equal(
    readFileSync(join(state.consumer, '.skillfoo.yml'), 'utf8'),
    'registry: ../registry\nskills:\n  - beta\n  - alpha\n',
  );
  assert.equal(existsSync(join(state.consumer, '.agents', 'skills', 'alpha', 'SKILL.md')), true);
  assert.equal(existsSync(join(state.consumer, '.agents', 'skills', 'beta', 'SKILL.md')), true);
  assert.equal(planReconciliation(state.consumer).outcome, 'converged');
  assert.ok(output.some((message) => message.includes('2 added')));
});

test('initializes a dynamic all-skills policy and reuses it for future additions', async (context) => {
  const state = fixture(context);
  await initializeProject(
    state.consumer,
    { registry: '../registry', selection: { kind: 'all' } },
    { output: () => undefined },
  );
  assert.equal(readFileSync(join(state.consumer, '.skillfoo.yml'), 'utf8'), 'registry: ../registry\n');

  writeSkill(state.registry, 'gamma');
  const pending = planReconciliation(state.consumer);
  assert.equal(pending.outcome, 'changes_available');
  assert.equal(pending.skills.find(({ name }) => name === 'gamma')?.state, 'add');
});

test('validates selection and emit before creating consumer state', async (context) => {
  const state = fixture(context);
  const empty = snapshot(state.consumer);

  await assert.rejects(
    initializeProject(state.consumer, {
      registry: '../registry',
      selection: { kind: 'named', names: ['missing'] },
    }),
    /not in the registry: missing.*available: alpha, beta/s,
  );
  assert.deepEqual(snapshot(state.consumer), empty);

  const progress: string[] = [];
  await assert.rejects(
    initializeProject(
      state.consumer,
      {
        registry: 'https://example.invalid/registry.git',
        emit: '../outside',
        selection: { kind: 'all' },
      },
      { reporter: (message) => progress.push(message) },
    ),
    /emit.*escape/,
  );
  assert.deepEqual(progress, []);
  assert.deepEqual(snapshot(state.consumer), empty);
});

test('refuses existing configuration before registry or cache access', async (context) => {
  const state = fixture(context);
  const path = join(state.consumer, '.skillfoo.yml');
  const contents = '# distinctive bytes\nregistry: unavailable\n';
  writeFileSync(path, contents);
  const before = snapshot(state.consumer);
  const progress: string[] = [];

  await assert.rejects(
    initializeProject(
      state.consumer,
      {
        registry: 'https://example.invalid/registry.git',
        selection: { kind: 'all' },
      },
      { reporter: (message) => progress.push(message) },
    ),
    /already exists.*status.*sync/,
  );

  assert.deepEqual(progress, []);
  assert.equal(readFileSync(path, 'utf8'), contents);
  assert.deepEqual(snapshot(state.consumer), before);
});

test('retains config and bespoke content when first reconciliation needs attention', async (context) => {
  const state = fixture(context);
  const bespoke = join(state.consumer, '.agents', 'skills', 'alpha', 'SKILL.md');
  mkdirSync(join(state.consumer, '.agents', 'skills', 'alpha'), { recursive: true });
  writeFileSync(bespoke, 'bespoke alpha bytes\n');

  const result = await initializeProject(
    state.consumer,
    { registry: '../registry', selection: { kind: 'named', names: ['alpha'] } },
    { output: () => undefined },
  );

  assert.equal(result.reconciliation.outcome, 'attention_required');
  assert.equal(readFileSync(bespoke, 'utf8'), 'bespoke alpha bytes\n');
  assert.equal(existsSync(join(state.consumer, '.skillfoo.yml')), true);
  assert.equal(planReconciliation(state.consumer).outcome, 'attention_required');
});

test('retains valid config after an operational reconciliation failure', async (context) => {
  const state = fixture(context);
  const lock = join(state.consumer, '.skillfoo.lock');
  writeFileSync(lock, 'not json\n');

  await assert.rejects(
    initializeProject(state.consumer, {
      registry: '../registry',
      selection: { kind: 'named', names: ['alpha'] },
    }),
    (error: unknown) => {
      assert.ok(error instanceof InitReconciliationError);
      assert.match(error.message, /created \.skillfoo\.yml.*first reconciliation failed/s);
      return true;
    },
  );

  assert.equal(
    readFileSync(join(state.consumer, '.skillfoo.yml'), 'utf8'),
    'registry: ../registry\nskills:\n  - alpha\n',
  );
  assert.equal(readFileSync(lock, 'utf8'), 'not json\n');
  rmSync(lock);
  assert.equal(planReconciliation(state.consumer).outcome, 'changes_available');
  await sync(state.consumer, { output: () => undefined });
  assert.equal(planReconciliation(state.consumer).outcome, 'converged');
});

test('resolves and catalogs a Git registry once during initialization', async (context) => {
  const state = fixture(context);
  git(state.registry, 'init');
  git(state.registry, 'config', 'user.email', 'tests@skillfoo.local');
  git(state.registry, 'config', 'user.name', 'Skillfoo Tests');
  git(state.registry, 'add', '.');
  git(state.registry, 'commit', '-m', 'registry');
  const progress: string[] = [];

  await initializeProject(
    state.consumer,
    {
      registry: pathToFileURL(state.registry).href,
      selection: { kind: 'named', names: ['alpha'] },
    },
    {
      cacheRoot: join(state.root, 'cache'),
      reporter: (message) => progress.push(message),
      output: () => undefined,
    },
  );

  assert.equal(progress.filter((message) => message.includes('cloning configured Git registry')).length, 1);
  assert.equal(progress.some((message) => message.includes('updating configured Git registry')), false);
});
