import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
