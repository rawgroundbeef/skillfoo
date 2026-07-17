import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { LOCK_NAME, readLock, writeLock } from '../src/lockfile.js';

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'skillfoo-lock-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('writes lock entries in stable name order and reads them back', () => {
  withTempDir((dir) => {
    const lock = {
      lockfileVersion: 1,
      skills: {
        zed: { source: 'registry', hash: 'sha256:zed' },
        alpha: { source: 'registry', hash: 'sha256:alpha' },
      },
    };
    writeLock(dir, lock);
    assert.deepEqual(readLock(dir), lock);
    const contents = readFileSync(join(dir, LOCK_NAME), 'utf8');
    assert.ok(contents.indexOf('alpha') < contents.indexOf('zed'));
  });
});

test('fails closed when a managed entry has no hash', () => {
  withTempDir((dir) => {
    writeFileSync(
      join(dir, LOCK_NAME),
      JSON.stringify({ lockfileVersion: 1, skills: { slice: { source: 'registry' } } }),
    );
    assert.throws(() => readLock(dir), /hash is missing or empty/);
  });
});
