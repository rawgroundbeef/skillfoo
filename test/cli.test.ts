import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { run, type CliIO } from '../src/cli.js';

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

test('the compiled entrypoint is executable by Node', () => {
  const entrypoint = resolve('dist/entrypoint.js');
  const result = spawnSync(process.execPath, [entrypoint, '--version'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '0.0.1\n');
  assert.equal(result.stderr, '');
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
