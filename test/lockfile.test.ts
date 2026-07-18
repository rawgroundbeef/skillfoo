import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  compareAndSetLockEntry,
  LOCK_NAME,
  readLock,
  writeLock,
} from '../src/lockfile.js';

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

test('preserves prototype-shaped lock keys as own entries', () => {
  withTempDir((dir) => {
    writeFileSync(
      join(dir, LOCK_NAME),
      '{"lockfileVersion":1,"skills":{' +
        '"__proto__":{"source":"registry","hash":"sha256:proto"},' +
        '"safe":{"source":"registry","hash":"sha256:safe"}}}',
    );

    const lock = readLock(dir);
    assert.equal(Object.hasOwn(lock.skills, '__proto__'), true);
    assert.equal(lock.skills.__proto__?.hash, 'sha256:proto');
    writeLock(dir, lock);
    assert.equal(Object.hasOwn(readLock(dir).skills, '__proto__'), true);
  });
});

test('compare-and-set updates one target while preserving unrelated entries', () => {
  withTempDir((dir) => {
    const alpha = { source: 'old', hash: 'sha256:alpha-old' };
    const beta = { source: 'registry', hash: 'sha256:beta' };
    writeLock(dir, { lockfileVersion: 1, skills: { alpha, beta } });

    compareAndSetLockEntry(dir, 'alpha', alpha, {
      source: 'registry',
      hash: 'sha256:alpha-new',
    });

    assert.deepEqual(readLock(dir), {
      lockfileVersion: 1,
      skills: {
        alpha: { source: 'registry', hash: 'sha256:alpha-new' },
        beta,
      },
    });
  });
});

test('compare-and-set refuses stale target evidence without changing the lock', () => {
  withTempDir((dir) => {
    writeLock(dir, {
      lockfileVersion: 1,
      skills: { alpha: { source: 'registry', hash: 'sha256:current' } },
    });
    const before = readFileSync(join(dir, LOCK_NAME));
    assert.throws(
      () =>
        compareAndSetLockEntry(
          dir,
          'alpha',
          { source: 'registry', hash: 'sha256:stale' },
          { source: 'registry', hash: 'sha256:new' },
        ),
      /stale lock evidence/,
    );
    assert.deepEqual(readFileSync(join(dir, LOCK_NAME)), before);
  });
});
