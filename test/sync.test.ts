import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readLock } from '../src/lockfile.js';
import { sync } from '../src/sync.js';

test('syncs a local skill into a consumer and records the managed baseline', async (context) => {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-sync-'));
  const registry = join(root, 'registry');
  const consumer = join(root, 'consumer');
  const skill = join(registry, 'example');
  const output: string[] = [];
  context.mock.method(console, 'log', (message: unknown) => output.push(String(message)));

  try {
    mkdirSync(skill, { recursive: true });
    mkdirSync(consumer);
    writeFileSync(
      join(skill, 'SKILL.md'),
      '---\nname: example\ndescription: Example skill for integration testing.\n---\n\n# Example\n',
    );
    writeFileSync(join(consumer, '.skillfoo.yml'), 'registry: ../registry\nskills: [example]\n');

    await sync(consumer);

    const emittedSkill = join(consumer, '.agents', 'skills', 'example', 'SKILL.md');
    const adapter = join(consumer, '.claude', 'skills', 'example');
    assert.equal(readFileSync(emittedSkill, 'utf8'), readFileSync(join(skill, 'SKILL.md'), 'utf8'));
    assert.ok(readFileSync(join(consumer, 'AGENTS.md'), 'utf8').includes('[example]'));
    assert.ok(existsSync(adapter));
    assert.equal(realpathSync(adapter), realpathSync(join(consumer, '.agents', 'skills', 'example')));
    assert.match(readLock(consumer).skills.example?.hash ?? '', /^sha256:/);
    assert.ok(output.some((line) => line.includes('+ example')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
