import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
import { relative, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createLineReader, run, type CliIO } from '../src/cli.js';

function capture(cwd = process.cwd()): {
  io: CliIO;
  stdout: string[];
  stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      cwd: () => cwd,
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
    },
    stdout,
    stderr,
  };
}

function writeSkill(registry: string, name: string): void {
  const skill = resolve(registry, name);
  mkdirSync(skill, { recursive: true });
  writeFileSync(
    resolve(skill, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name} guidance.\n---\n\n# ${name}\n`,
  );
}

function interactiveCapture(cwd: string, answers: Array<string | null>): {
  io: CliIO;
  stdout: string[];
  stderr: string[];
  prompts: string[];
} {
  const output = capture(cwd);
  const prompts: string[] = [];
  output.io.isInputTTY = () => true;
  output.io.openLineReader = () => ({
    readLine: async (prompt) => {
      prompts.push(prompt);
      return answers.shift() ?? null;
    },
    close: () => undefined,
  });
  return { ...output, prompts };
}

test('line reader preserves type-ahead input delivered in one stream chunk', async () => {
  const input = new PassThrough();
  const prompts: string[] = [];
  const reader = createLineReader(input, (prompt) => prompts.push(prompt));
  const first = reader.readLine('First: ');
  input.write('missing\nalpha\n');

  assert.equal(await first, 'missing');
  assert.equal(await reader.readLine('Retry: '), 'alpha');
  assert.deepEqual(prompts, ['First: ', 'Retry: ']);
  reader.close();
});

test('prints version successfully', async () => {
  const output = capture();
  assert.equal(await run(['--version'], output.io), 0);
  assert.deepEqual(output.stdout, ['0.0.1']);
  assert.deepEqual(output.stderr, []);
});

test('rejects an unknown command without mixing streams', async () => {
  const output = capture();
  assert.equal(await run(['wat'], output.io), 1);
  assert.match(output.stderr[0] ?? '', /unknown command "wat"/);
  assert.match(output.stdout[0] ?? '', /^skillfoo — keep your agent skills in sync/);
});

test('reports a missing config as an expected sync failure', async () => {
  const cwd = mkdtempSync(resolve(tmpdir(), 'skillfoo-cli-'));
  try {
    const output = capture(cwd);
    assert.equal(await run(['sync'], output.io), 1);
    assert.match(output.stderr[0] ?? '', /no \.skillfoo\.yml/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('shows status help without inspecting the project', async () => {
  const cwd = mkdtempSync(resolve(tmpdir(), 'skillfoo-status-help-'));
  try {
    const output = capture(cwd);
    assert.equal(await run(['status', '--help'], output.io), 0);
    assert.match(output.stdout[0] ?? '', /--json/);
    assert.match(output.stdout[0] ?? '', /3  attention required/);
    assert.deepEqual(output.stderr, []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('shows sync and resolve help without project access and never advertises broad force', async () => {
  const cwd = mkdtempSync(resolve(tmpdir(), 'skillfoo-command-help-'));
  try {
    const root = capture(cwd);
    assert.equal(await run(['--help'], root.io), 0);
    assert.match(root.stdout[0] ?? '', /resolve <skill> --take-registry/);
    assert.doesNotMatch(root.stdout[0] ?? '', /--force|sync -f/);

    const syncHelp = capture(cwd);
    assert.equal(await run(['sync', '--help'], syncHelp.io), 0);
    assert.match(syncHelp.stdout[0] ?? '', /Locally edited Managed skills are preserved/);
    assert.doesNotMatch(syncHelp.stdout[0] ?? '', /--force|sync -f/);

    const resolveHelp = capture(cwd);
    assert.equal(await run(['resolve', '--help'], resolveHelp.io), 0);
    assert.match(resolveHelp.stdout[0] ?? '', /permanently discarding its local edits/);
    assert.match(resolveHelp.stdout[0] ?? '', /2  target resolved.*safe changes remain/);
    assert.deepEqual(readdirSync(cwd), []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('strict sync and resolve syntax fails before project or registry access', async () => {
  const cwd = mkdtempSync(resolve(tmpdir(), 'skillfoo-resolve-guardrails-'));
  try {
    const cases: readonly string[][] = [
      ['sync', '--force'],
      ['sync', '-f'],
      ['sync', '--unknown'],
      ['sync', 'alpha'],
      ['resolve', 'alpha'],
      ['resolve', '--take-registry'],
      ['resolve', 'alpha', 'beta', '--take-registry'],
      ['resolve', 'alpha', '--take-registry', '--take-registry'],
      ['resolve', 'alpha', '--take-registry', '--unknown'],
      ['resolve', '../alpha', '--take-registry'],
    ];

    for (const argv of cases) {
      const output = capture(cwd);
      assert.equal(await run(argv, output.io), 1, argv.join(' '));
      assert.deepEqual(output.stdout, [], argv.join(' '));
      assert.equal(output.stderr.length, 1, argv.join(' '));
      assert.deepEqual(readdirSync(cwd), [], argv.join(' '));
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('shows init help without inspecting project or registry state', async () => {
  const cwd = mkdtempSync(resolve(tmpdir(), 'skillfoo-init-help-'));
  try {
    const output = capture(cwd);
    assert.equal(await run(['init', '--help'], output.io), 0);
    assert.match(output.stdout[0] ?? '', /init <registry>/);
    assert.match(output.stdout[0] ?? '', /--skill <name>/);
    assert.match(output.stdout[0] ?? '', /3  project initialized/);
    assert.deepEqual(output.stderr, []);
    assert.deepEqual(readdirSync(cwd), []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('strict init invocation guardrails fail before consumer writes', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'skillfoo-init-guardrails-'));
  const registry = resolve(root, 'registry');
  const consumer = resolve(root, 'consumer');
  try {
    mkdirSync(registry);
    mkdirSync(consumer);
    writeSkill(registry, 'alpha');
    const cases: readonly string[][] = [
      ['init', '../registry'],
      ['init', '../registry', '--all', '--skill', 'alpha'],
      ['init', '../registry', '--unknown'],
      ['init', '../registry', '--skill'],
      ['init', '../registry', 'extra', '--all'],
      ['init', '--all'],
    ];

    for (const argv of cases) {
      const output = capture(consumer);
      assert.equal(await run(argv, output.io), 1, argv.join(' '));
      assert.deepEqual(output.stdout, [], argv.join(' '));
      assert.equal(output.stderr.length, 1, argv.join(' '));
      assert.deepEqual(readdirSync(consumer), [], argv.join(' '));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('initializes explicit selections without prompting', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'skillfoo-init-explicit-'));
  const registry = resolve(root, 'registry');
  const consumer = resolve(root, 'consumer');
  try {
    mkdirSync(registry);
    mkdirSync(consumer);
    writeSkill(registry, 'alpha');
    writeSkill(registry, 'beta');
    const output = capture(consumer);
    output.io.openLineReader = () => assert.fail('explicit init must not prompt');

    assert.equal(
      await run(
        ['init', '../registry', '--skill', 'beta', '--skill', 'alpha', '--emit', 'tools/skills'],
        output.io,
      ),
      0,
    );
    assert.equal(
      readFileSync(resolve(consumer, '.skillfoo.yml'), 'utf8'),
      'registry: ../registry\nemit: tools/skills\nskills:\n  - beta\n  - alpha\n',
    );
    assert.equal(existsSync(resolve(consumer, 'tools', 'skills', 'alpha', 'SKILL.md')), true);
    assert.match(output.stdout.at(-1) ?? '', /created \.skillfoo\.yml.*converged/s);
    assert.deepEqual(output.stderr, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('interactive init retries exact selections and cancellation writes nothing', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'skillfoo-init-interactive-'));
  const registry = resolve(root, 'registry');
  const consumer = resolve(root, 'consumer');
  const cancelled = resolve(root, 'cancelled');
  try {
    mkdirSync(registry);
    mkdirSync(consumer);
    mkdirSync(cancelled);
    writeSkill(registry, 'beta');
    writeSkill(registry, 'alpha');

    const output = interactiveCapture(consumer, ['', 'missing', 'beta, alpha']);
    assert.equal(await run(['init', '../registry'], output.io), 0);
    assert.match(output.stdout[0] ?? '', /Available skills:\n  alpha\n  beta/);
    assert.equal(output.stderr.length, 2);
    assert.equal(output.prompts.length, 3);
    assert.match(
      readFileSync(resolve(consumer, '.skillfoo.yml'), 'utf8'),
      /skills:\n  - beta\n  - alpha\n$/,
    );

    const cancelledOutput = interactiveCapture(cancelled, [null]);
    assert.equal(await run(['init', '../registry'], cancelledOutput.io), 1);
    assert.match(cancelledOutput.stderr.at(-1) ?? '', /cancelled.*no files were written/);
    assert.deepEqual(readdirSync(cancelled), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('init maps a preserved bespoke conflict to attention required', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'skillfoo-init-conflict-'));
  const registry = resolve(root, 'registry');
  const consumer = resolve(root, 'consumer');
  const bespoke = resolve(consumer, '.agents', 'skills', 'alpha', 'SKILL.md');
  try {
    mkdirSync(registry);
    mkdirSync(resolve(consumer, '.agents', 'skills', 'alpha'), { recursive: true });
    writeSkill(registry, 'alpha');
    writeFileSync(bespoke, 'bespoke\n');
    const output = capture(consumer);

    assert.equal(await run(['init', '../registry', '--skill', 'alpha'], output.io), 3);
    assert.equal(readFileSync(bespoke, 'utf8'), 'bespoke\n');
    assert.equal(existsSync(resolve(consumer, '.skillfoo.yml')), true);
    assert.match(output.stdout.at(-1) ?? '', /needs attention.*status.*sync/s);
    assert.deepEqual(output.stderr, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('init reports retained config when first reconciliation fails operationally', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'skillfoo-init-operation-failure-'));
  const registry = resolve(root, 'registry');
  const consumer = resolve(root, 'consumer');
  try {
    mkdirSync(registry);
    mkdirSync(consumer);
    writeSkill(registry, 'alpha');
    writeFileSync(resolve(consumer, '.skillfoo.lock'), 'invalid json\n');
    const output = capture(consumer);

    assert.equal(await run(['init', '../registry', '--skill', 'alpha'], output.io), 1);
    assert.deepEqual(output.stdout, []);
    assert.match(output.stderr[0] ?? '', /created \.skillfoo\.yml.*reconciliation failed/s);
    assert.match(output.stderr[1] ?? '', /configuration was kept.*status.*sync/s);
    assert.equal(existsSync(resolve(consumer, '.skillfoo.yml')), true);
    assert.equal(readFileSync(resolve(consumer, '.skillfoo.lock'), 'utf8'), 'invalid json\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('status failures leave stdout empty, including in JSON mode', async () => {
  const cwd = mkdtempSync(resolve(tmpdir(), 'skillfoo-status-failure-'));
  try {
    const missing = capture(cwd);
    assert.equal(await run(['status', '--json'], missing.io), 1);
    assert.deepEqual(missing.stdout, []);
    assert.match(missing.stderr[0] ?? '', /no \.skillfoo\.yml/);

    const invalid = capture(cwd);
    assert.equal(await run(['status', '--force'], invalid.io), 1);
    assert.deepEqual(invalid.stdout, []);
    assert.match(invalid.stderr[0] ?? '', /--force/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('status and sync reject unsafe manual emit config before registry access', async () => {
  const cwd = mkdtempSync(resolve(tmpdir(), 'skillfoo-unsafe-emit-'));
  try {
    writeFileSync(
      resolve(cwd, '.skillfoo.yml'),
      'registry: https://example.invalid/unreachable.git\nemit: ../outside\n',
    );
    const before = readFileSync(resolve(cwd, '.skillfoo.yml'));

    for (const command of ['status', 'sync']) {
      const output = capture(cwd);
      assert.equal(await run([command], output.io), 1);
      assert.deepEqual(output.stdout, []);
      assert.match(output.stderr[0] ?? '', /emit.*escape/);
      assert.deepEqual(readFileSync(resolve(cwd, '.skillfoo.yml')), before);
      assert.deepEqual(readdirSync(cwd), ['.skillfoo.yml']);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('the compiled entrypoint is executable by Node', () => {
  const entrypoint = resolve('dist/entrypoint.js');
  const result = spawnSync(process.execPath, [entrypoint, '--version'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '0.0.1\n');
  assert.equal(result.stderr, '');
});

test('the compiled CLI initializes a non-ASCII path and keeps failures on stderr', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'skillfoo compiled ünicode '));
  const registry = resolve(root, 'skills registry');
  const consumer = resolve(root, 'consumer project');
  const entrypoint = resolve('dist/entrypoint.js');
  try {
    mkdirSync(registry);
    mkdirSync(consumer);
    writeSkill(registry, 'alpha');

    const initialized = spawnSync(
      process.execPath,
      [entrypoint, 'init', '../skills registry', '--skill', 'alpha'],
      { cwd: consumer, encoding: 'utf8' },
    );
    assert.equal(initialized.status, 0);
    assert.equal(initialized.stderr, '');
    assert.match(initialized.stdout, /Project initialized:.*converged/s);

    const rerun = spawnSync(
      process.execPath,
      [entrypoint, 'init', '../skills registry', '--all'],
      { cwd: consumer, encoding: 'utf8' },
    );
    assert.equal(rerun.status, 1);
    assert.equal(rerun.stdout, '');
    assert.match(rerun.stderr, /already exists.*status.*sync/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the compiled CLI reports a blocked removal without changing the success exit status', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'skillfoo-cli-removal-'));
  const registrySkill = resolve(root, 'registry', 'beta');
  const consumer = resolve(root, 'consumer');
  const entrypoint = resolve('dist/entrypoint.js');
  try {
    mkdirSync(registrySkill, { recursive: true });
    mkdirSync(consumer);
    writeFileSync(
      resolve(registrySkill, 'SKILL.md'),
      '---\nname: beta\ndescription: Beta guidance.\n---\n\n# Beta\n',
    );
    writeFileSync(
      resolve(consumer, '.skillfoo.yml'),
      'registry: ../registry\nskills: [beta]\n',
    );
    assert.equal(
      spawnSync(process.execPath, [entrypoint, 'sync'], { cwd: consumer, encoding: 'utf8' }).status,
      0,
    );
    writeFileSync(resolve(consumer, '.agents', 'skills', 'beta', 'SKILL.md'), 'local edit\n');
    writeFileSync(
      resolve(consumer, '.skillfoo.yml'),
      'registry: ../registry\nskills: []\n',
    );

    const blocked = spawnSync(process.execPath, [entrypoint, 'sync'], {
      cwd: consumer,
      encoding: 'utf8',
    });
    assert.equal(blocked.status, 0);
    assert.match(blocked.stdout, /removal blocked — local changes/);
    assert.equal(blocked.stderr, '');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the compiled status command keeps JSON clean and maps reconciliation outcomes to exits', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'skillfoo-cli-status-'));
  const registrySkill = resolve(root, 'registry', 'alpha');
  const consumer = resolve(root, 'consumer');
  const entrypoint = resolve('dist/entrypoint.js');
  try {
    mkdirSync(registrySkill, { recursive: true });
    mkdirSync(consumer);
    writeFileSync(
      resolve(registrySkill, 'SKILL.md'),
      '---\nname: alpha\ndescription: Alpha guidance.\n---\n\n# Alpha\n',
    );
    writeFileSync(
      resolve(consumer, '.skillfoo.yml'),
      'registry: ../registry\nskills: [alpha]\n',
    );

    const fresh = spawnSync(process.execPath, [entrypoint, 'status', '--json'], {
      cwd: consumer,
      encoding: 'utf8',
    });
    assert.equal(fresh.status, 2);
    assert.equal(fresh.stderr, '');
    const freshJson = JSON.parse(fresh.stdout) as { schemaVersion: number; outcome: string };
    assert.equal(freshJson.schemaVersion, 1);
    assert.equal(freshJson.outcome, 'changes_available');
    assert.equal(readFileSync(resolve(consumer, '.skillfoo.yml'), 'utf8').includes('alpha'), true);
    assert.equal(
      spawnSync(process.execPath, [entrypoint, 'sync'], {
        cwd: consumer,
        encoding: 'utf8',
      }).status,
      0,
    );

    const converged = spawnSync(process.execPath, [entrypoint, 'status'], {
      cwd: consumer,
      encoding: 'utf8',
    });
    assert.equal(converged.status, 0);
    assert.match(converged.stdout, /Repository is converged/);
    assert.equal(converged.stderr, '');

    writeFileSync(
      resolve(consumer, '.agents', 'skills', 'alpha', 'SKILL.md'),
      'local edit\n',
    );
    const drifted = spawnSync(process.execPath, [entrypoint, 'status', '--json'], {
      cwd: consumer,
      encoding: 'utf8',
    });
    assert.equal(drifted.status, 3);
    assert.equal(drifted.stderr, '');
    assert.equal((JSON.parse(drifted.stdout) as { outcome: string }).outcome, 'attention_required');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the compiled resolver keeps streams clean and returns residual exits 0, 2, and 3', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'skillfoo resolver compiled ünicode '));
  const entrypoint = resolve('dist/entrypoint.js');

  const setup = (name: string): { registry: string; consumer: string } => {
    const scenario = resolve(root, name);
    const registry = resolve(scenario, 'skills registry');
    const consumer = resolve(scenario, 'consumer project');
    mkdirSync(registry, { recursive: true });
    mkdirSync(consumer);
    writeSkill(registry, 'alpha');
    writeSkill(registry, 'beta');
    writeFileSync(
      resolve(consumer, '.skillfoo.yml'),
      'registry: ../skills registry\nskills: [alpha, beta]\n',
    );
    const synced = spawnSync(process.execPath, [entrypoint, 'sync'], {
      cwd: consumer,
      encoding: 'utf8',
    });
    assert.equal(synced.status, 0);
    return { registry, consumer };
  };

  const edit = (consumer: string, name: string): void => {
    writeFileSync(
      resolve(consumer, '.agents', 'skills', name, 'SKILL.md'),
      `---\nname: ${name}\ndescription: ${name} local guidance.\n---\n\n# local\n`,
    );
  };

  try {
    const converged = setup('converged');
    edit(converged.consumer, 'alpha');
    const resolved = spawnSync(
      process.execPath,
      [entrypoint, 'resolve', 'alpha', '--take-registry'],
      { cwd: converged.consumer, encoding: 'utf8' },
    );
    assert.equal(resolved.status, 0);
    assert.equal(resolved.stderr, '');
    assert.match(resolved.stdout, /Resolved alpha:.*local edits were discarded.*converged/s);

    const pending = setup('pending');
    edit(pending.consumer, 'alpha');
    writeSkill(pending.registry, 'beta');
    writeFileSync(
      resolve(pending.registry, 'beta', 'SKILL.md'),
      '---\nname: beta\ndescription: refreshed beta guidance.\n---\n\n# refreshed\n',
    );
    const pendingResult = spawnSync(
      process.execPath,
      [entrypoint, 'resolve', 'alpha', '--take-registry'],
      { cwd: pending.consumer, encoding: 'utf8' },
    );
    assert.equal(pendingResult.status, 2);
    assert.equal(pendingResult.stderr, '');
    assert.match(pendingResult.stdout, /Unrelated safe changes remain/);

    const conflicted = setup('conflicted');
    edit(conflicted.consumer, 'alpha');
    edit(conflicted.consumer, 'beta');
    const conflictResult = spawnSync(
      process.execPath,
      [entrypoint, 'resolve', 'alpha', '--take-registry'],
      { cwd: conflicted.consumer, encoding: 'utf8' },
    );
    assert.equal(conflictResult.status, 3);
    assert.equal(conflictResult.stderr, '');
    assert.match(conflictResult.stdout, /Another conflict remains/);

    for (const removedForce of [['sync', '--force'], ['sync', '-f']] as const) {
      const rejected = spawnSync(process.execPath, [entrypoint, ...removedForce], {
        cwd: converged.consumer,
        encoding: 'utf8',
      });
      assert.equal(rejected.status, 1);
      assert.equal(rejected.stdout, '');
      assert.match(rejected.stderr, /Unknown option/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the compiled resolver refuses every unsupported planner state without writes', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'skillfoo-cli-resolve-refusals-'));
  const registry = resolve(root, 'registry');
  const entrypoint = resolve('dist/entrypoint.js');
  mkdirSync(registry);
  writeSkill(registry, 'alpha');

  const tree = (consumer: string): string[] => {
    const result: string[] = [];
    const visit = (dir: string): void => {
      for (const name of readdirSync(dir).sort()) {
        const path = resolve(dir, name);
        const key = relative(consumer, path).split('\\').join('/');
        const stat = lstatSync(path);
        if (stat.isSymbolicLink()) result.push(`link ${key} -> ${readlinkSync(path)}`);
        else if (stat.isDirectory()) {
          result.push(`dir ${key}`);
          visit(path);
        } else result.push(`file ${key} ${readFileSync(path).toString('base64')}`);
      }
    };
    visit(consumer);
    return result;
  };
  const makeConsumer = (name: string): string => {
    const consumer = resolve(root, name);
    mkdirSync(consumer);
    writeFileSync(
      resolve(consumer, '.skillfoo.yml'),
      'registry: ../registry\nskills: [alpha]\n',
    );
    return consumer;
  };
  const converge = (consumer: string): void => {
    const result = spawnSync(process.execPath, [entrypoint, 'sync'], {
      cwd: consumer,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
  };

  try {
    const cases: Array<{ label: string; consumer: string; target?: string }> = [];

    cases.push({ label: 'safe add', consumer: makeConsumer('add') });
    cases.push({ label: 'missing target ownership', consumer: makeConsumer('missing'), target: 'beta' });

    const update = makeConsumer('update');
    converge(update);
    writeFileSync(
      resolve(registry, 'alpha', 'SKILL.md'),
      '---\nname: alpha\ndescription: refreshed alpha guidance.\n---\n\n# refreshed\n',
    );
    cases.push({ label: 'safe update', consumer: update });

    const removal = makeConsumer('remove');
    converge(removal);
    writeFileSync(resolve(removal, '.skillfoo.yml'), 'registry: ../registry\nskills: []\n');
    cases.push({ label: 'safe removal', consumer: removal });

    const removalBlocked = makeConsumer('removal-blocked');
    converge(removalBlocked);
    writeFileSync(
      resolve(removalBlocked, '.agents', 'skills', 'alpha', 'SKILL.md'),
      'local removal edit\n',
    );
    writeFileSync(
      resolve(removalBlocked, '.skillfoo.yml'),
      'registry: ../registry\nskills: []\n',
    );
    cases.push({ label: 'blocked removal', consumer: removalBlocked });

    const bespoke = makeConsumer('bespoke');
    mkdirSync(resolve(bespoke, '.agents', 'skills', 'alpha'), { recursive: true });
    writeFileSync(resolve(bespoke, '.agents', 'skills', 'alpha', 'SKILL.md'), 'bespoke\n');
    cases.push({ label: 'missing ownership at desired path', consumer: bespoke });

    const unsafe = makeConsumer('unsafe-shape');
    converge(unsafe);
    rmSync(resolve(unsafe, '.agents', 'skills', 'alpha'), { recursive: true });
    writeFileSync(resolve(unsafe, '.agents', 'skills', 'alpha'), 'unsafe shape\n');
    cases.push({ label: 'non-local-change drift', consumer: unsafe });

    for (const refusal of cases) {
      const before = tree(refusal.consumer);
      const result = spawnSync(
        process.execPath,
        [entrypoint, 'resolve', refusal.target ?? 'alpha', '--take-registry'],
        { cwd: refusal.consumer, encoding: 'utf8' },
      );
      assert.equal(result.status, 1, refusal.label);
      assert.equal(result.stdout, '', refusal.label);
      assert.notEqual(result.stderr, '', refusal.label);
      assert.deepEqual(tree(refusal.consumer), before, refusal.label);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
