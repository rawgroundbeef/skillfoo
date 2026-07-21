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
import {
  cacheDirFor,
  listRegistrySkills,
  normalizeCloneUrl,
  resolveRegistryCatalog,
} from '../src/registry.js';
import { REGISTRY_DIAGNOSTICS } from '../src/registry-source.js';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function writeSkill(registry: string, description: string): void {
  const skill = join(registry, 'alpha');
  mkdirSync(skill, { recursive: true });
  writeFileSync(
    join(skill, 'SKILL.md'),
    `---\nname: alpha\ndescription: ${description}\n---\n\n# Alpha\n`,
  );
}

test('catalogs only skill directories in deterministic name order', () => {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-registry-catalog-'));
  try {
    for (const name of ['beta', 'alpha', 'gamma', '.hidden']) {
      mkdirSync(join(root, name));
    }
    writeFileSync(join(root, 'beta', 'SKILL.md'), 'beta\n');
    writeFileSync(join(root, 'alpha', 'SKILL.md'), 'alpha\n');
    writeFileSync(join(root, '.hidden', 'SKILL.md'), 'hidden\n');
    writeFileSync(join(root, 'file'), 'not a skill directory\n');

    assert.deepEqual(listRegistrySkills(root), ['alpha', 'beta']);
    assert.deepEqual(resolveRegistryCatalog('.', root), {
      spec: '.',
      directory: root,
      skills: ['alpha', 'beta'],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('treats explicit local paths ending in .git as filesystem registries', () => {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-local-dot-git-'));
  const registry = join(root, 'registry.git');
  try {
    mkdirSync(registry);
    writeNamedSkill(registry, 'local-source');
    assert.deepEqual(resolveRegistryCatalog('./registry.git', root), {
      spec: './registry.git',
      directory: registry,
      skills: ['local-source'],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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
    assert.deepEqual([...progress], [REGISTRY_DIAGNOSTICS.cloning]);
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
    assert.deepEqual([...progress], [REGISTRY_DIAGNOSTICS.updating]);
    assert.deepEqual(readdirSync(consumer), consumerBefore.entries);
    assert.deepEqual(readFileSync(join(consumer, '.skillfoo.yml')), consumerBefore.config);

    rmSync(registry, { recursive: true });
    assert.throws(
      () =>
        planReconciliation(consumer, {
          registryCacheRoot: cacheRoot,
          registryReporter: () => undefined,
        }),
      /could not fetch configured Git registry/,
    );
    assert.deepEqual(readdirSync(consumer), consumerBefore.entries);
    assert.deepEqual(readFileSync(join(consumer, '.skillfoo.yml')), consumerBefore.config);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeNamedSkill(registry: string, name: string): void {
  const skill = join(registry, name);
  mkdirSync(skill, { recursive: true });
  writeFileSync(
    join(skill, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name} guidance.\n---\n\n# ${name}\n`,
  );
}

function initializeRegistry(registry: string, name: string): void {
  mkdirSync(registry, { recursive: true });
  git(registry, 'init');
  git(registry, 'config', 'user.email', 'tests@skillfoo.local');
  git(registry, 'config', 'user.name', 'Skillfoo Tests');
  writeNamedSkill(registry, name);
  git(registry, 'add', '.');
  git(registry, 'commit', '-m', name);
}

test('separates colliding legacy slugs and re-clones a retargeted hashed cache', () => {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-cache-identity-'));
  const firstRegistry = join(root, 'a-b');
  const secondRegistry = join(root, 'a', 'b');
  const legacyRegistry = join(root, 'legacy');
  const cacheRoot = join(root, 'cache');
  const progress: string[] = [];

  try {
    initializeRegistry(firstRegistry, 'first-source');
    initializeRegistry(secondRegistry, 'second-source');
    initializeRegistry(legacyRegistry, 'legacy-source');

    const firstUrl = pathToFileURL(firstRegistry).href;
    const secondUrl = pathToFileURL(secondRegistry).href;
    const oldSlug = firstUrl
      .replace(/^\w+:\/\//u, '')
      .replace(/^git@/u, '')
      .replace(/[:]/gu, '-')
      .replace(/\.git$/u, '')
      .replace(/[^\w.-]+/gu, '-');
    const secondOldSlug = secondUrl
      .replace(/^\w+:\/\//u, '')
      .replace(/^git@/u, '')
      .replace(/[:]/gu, '-')
      .replace(/\.git$/u, '')
      .replace(/[^\w.-]+/gu, '-');
    assert.equal(oldSlug, secondOldSlug);

    const legacyDir = join(cacheRoot, oldSlug);
    mkdirSync(cacheRoot, { recursive: true });
    git(cacheRoot, 'clone', pathToFileURL(legacyRegistry).href, legacyDir);
    const legacyHeadBefore = git(legacyDir, 'rev-parse', 'HEAD');

    const first = resolveRegistryCatalog(firstUrl, root, {
      cacheRoot,
      reporter: (message) => progress.push(message),
    });
    const second = resolveRegistryCatalog(secondUrl, root, {
      cacheRoot,
      reporter: (message) => progress.push(message),
    });
    assert.deepEqual(first.skills, ['first-source']);
    assert.deepEqual(second.skills, ['second-source']);
    assert.deepEqual([...progress], [
      REGISTRY_DIAGNOSTICS.cloning,
      REGISTRY_DIAGNOSTICS.cloning,
    ]);

    const firstCache = cacheDirFor(normalizeCloneUrl(firstUrl), cacheRoot);
    const secondCache = cacheDirFor(normalizeCloneUrl(secondUrl), cacheRoot);
    assert.notEqual(firstCache, secondCache);
    assert.match(firstCache.slice(cacheRoot.length + 1), /^[a-f0-9]{64}$/u);
    assert.match(secondCache.slice(cacheRoot.length + 1), /^[a-f0-9]{64}$/u);

    git(secondCache, 'remote', 'set-url', 'origin', firstUrl);
    progress.length = 0;
    const recovered = resolveRegistryCatalog(secondUrl, root, {
      cacheRoot,
      reporter: (message) => progress.push(message),
    });
    assert.deepEqual(recovered.skills, ['second-source']);
    assert.deepEqual([...progress], [REGISTRY_DIAGNOSTICS.recloning]);
    assert.equal(git(secondCache, 'remote', 'get-url', 'origin').trim(), secondUrl);
    assert.equal(git(legacyDir, 'rev-parse', 'HEAD'), legacyHeadBefore);
    assert.deepEqual(listRegistrySkills(legacyDir), ['legacy-source']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
