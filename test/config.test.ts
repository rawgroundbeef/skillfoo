import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadConfig } from '../src/config.js';

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'skillfoo-config-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('loads defaults and named skills', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, '.skillfoo.yml'), 'registry: ../skills\nskills: [slice, pr]\n');
    assert.deepEqual(loadConfig(dir), {
      registry: '../skills',
      emit: '.agents/skills',
      skills: ['slice', 'pr'],
    });
  });
});

test('rejects non-string skill names at the config boundary', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, '.skillfoo.yml'), 'registry: ../skills\nskills: [slice, 42]\n');
    assert.throws(() => loadConfig(dir), /skills.*list of names/);
  });
});
