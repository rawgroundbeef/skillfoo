import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { planReconciliation } from '../src/plan.js';

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
}

function writeSkill(registry: string, description: string): void {
  const skill = join(registry, 'alpha');
  mkdirSync(skill, { recursive: true });
  writeFileSync(
    join(skill, 'SKILL.md'),
    `---\nname: alpha\ndescription: ${description}\n---\n\n# Alpha\n`,
  );
}

test('refreshes a Git registry only through an isolated private cache', () => {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-git-registry-'));
  const registry = join(root, 'registry');
  const consumer = join(root, 'consumer');
  const cacheRoot = join(root, 'cache');
  const progress: string[] = [];
  try {
    mkdirSync(registry);
    mkdirSync(consumer);
    git(registry, 'init');
    git(registry, 'config', 'user.email', 'tests@skillfoo.local');
    git(registry, 'config', 'user.name', 'Skillfoo Tests');
    writeSkill(registry, 'First alpha guidance.');
    git(registry, 'add', '.');
    git(registry, 'commit', '-m', 'first');

    const url = pathToFileURL(registry).href;
    writeFileSync(
      join(consumer, '.skillfoo.yml'),
      `registry: ${JSON.stringify(url)}\nskills: [alpha]\n`,
    );
    const consumerBefore = {
      entries: readdirSync(consumer),
      config: readFileSync(join(consumer, '.skillfoo.yml')),
    };

    const first = planReconciliation(consumer, {
      registryCacheRoot: cacheRoot,
      registryReporter: (message) => progress.push(message),
    });
    const firstHash = first.nextLock.skills.alpha?.hash;
    assert.ok(firstHash);
    assert.ok(progress.some((message) => message.includes('cloning registry')));
    assert.deepEqual(readdirSync(consumer), consumerBefore.entries);
    assert.deepEqual(readFileSync(join(consumer, '.skillfoo.yml')), consumerBefore.config);

    writeSkill(registry, 'Second alpha guidance.');
    git(registry, 'add', '.');
    git(registry, 'commit', '-m', 'second');
    progress.length = 0;
    const second = planReconciliation(consumer, {
      registryCacheRoot: cacheRoot,
      registryReporter: (message) => progress.push(message),
    });
    assert.notEqual(second.nextLock.skills.alpha?.hash, firstHash);
    assert.ok(progress.some((message) => message.includes('updating registry')));
    assert.deepEqual(readdirSync(consumer), consumerBefore.entries);
    assert.deepEqual(readFileSync(join(consumer, '.skillfoo.yml')), consumerBefore.config);

    rmSync(registry, { recursive: true });
    assert.throws(
      () =>
        planReconciliation(consumer, {
          registryCacheRoot: cacheRoot,
          registryReporter: () => undefined,
        }),
      /could not fetch registry/,
    );
    assert.deepEqual(readdirSync(consumer), consumerBefore.entries);
    assert.deepEqual(readFileSync(join(consumer, '.skillfoo.yml')), consumerBefore.config);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
