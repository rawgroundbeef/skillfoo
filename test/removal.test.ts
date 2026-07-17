import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { linkClaudeAdapter } from '../src/emit.js';
import {
  removeManagedSkill,
  resolveManagedRemovalCandidates,
} from '../src/removal.js';
import { hashSkillDir } from '../src/skilldir.js';

function fixture(): {
  root: string;
  emitted: string;
  adapter: string;
  hash: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-removal-'));
  const emitted = join(root, '.agents', 'skills', 'beta');
  const adapter = join(root, '.claude', 'skills', 'beta');
  mkdirSync(emitted, { recursive: true });
  writeFileSync(
    join(emitted, 'SKILL.md'),
    '---\nname: beta\ndescription: Beta guidance.\n---\n\n# Beta\n',
  );
  linkClaudeAdapter(root, '.agents/skills', ['beta']);
  return { root, emitted, adapter, hash: hashSkillDir(emitted) };
}

function candidate(root: string) {
  const resolved = resolveManagedRemovalCandidates(root, '.agents/skills', ['beta']);
  const value = resolved[0];
  assert.ok(value);
  return value;
}

test('removes an unchanged emitted directory and its expected adapter', () => {
  const state = fixture();
  try {
    assert.deepEqual(removeManagedSkill(candidate(state.root), state.hash), { status: 'removed' });
    assert.equal(existsSync(state.emitted), false);
    assert.equal(existsSync(state.adapter), false);
  } finally {
    rmSync(state.root, { recursive: true, force: true });
  }
});

test('treats missing managed projections as already clean', () => {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-removal-missing-'));
  try {
    assert.deepEqual(removeManagedSkill(candidate(root), 'sha256:missing'), { status: 'removed' });
    assert.equal(existsSync(join(root, '.claude')), false);
    assert.equal(existsSync(join(root, '.agents')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('removes an expected dangling adapter when the emitted directory is already absent', () => {
  const state = fixture();
  try {
    rmSync(state.emitted, { recursive: true });
    assert.equal(lstatSync(state.adapter).isSymbolicLink(), true);
    assert.deepEqual(removeManagedSkill(candidate(state.root), state.hash), { status: 'removed' });
    assert.throws(() => lstatSync(state.adapter), /ENOENT/);
  } finally {
    rmSync(state.root, { recursive: true, force: true });
  }
});

test('removes an unchanged emitted directory when its adapter is already absent', () => {
  const state = fixture();
  try {
    rmSync(state.adapter);
    assert.deepEqual(removeManagedSkill(candidate(state.root), state.hash), { status: 'removed' });
    assert.equal(existsSync(state.emitted), false);
  } finally {
    rmSync(state.root, { recursive: true, force: true });
  }
});

test('blocks local edits without removing either projection', () => {
  const state = fixture();
  try {
    const adapterTarget = readlinkSync(state.adapter);
    writeFileSync(join(state.emitted, 'SKILL.md'), 'locally edited\n');

    assert.deepEqual(removeManagedSkill(candidate(state.root), state.hash), {
      status: 'blocked',
      reason: 'local changes',
    });
    assert.equal(readFileSync(join(state.emitted, 'SKILL.md'), 'utf8'), 'locally edited\n');
    assert.equal(readlinkSync(state.adapter), adapterTarget);
  } finally {
    rmSync(state.root, { recursive: true, force: true });
  }
});

test('blocks a substituted emitted symlink even when it exposes matching files', () => {
  const state = fixture();
  const foreign = join(state.root, 'foreign');
  try {
    mkdirSync(foreign);
    writeFileSync(join(foreign, 'SKILL.md'), readFileSync(join(state.emitted, 'SKILL.md')));
    rmSync(state.emitted, { recursive: true });
    symlinkSync(foreign, state.emitted, process.platform === 'win32' ? 'junction' : 'dir');

    assert.deepEqual(removeManagedSkill(candidate(state.root), hashSkillDir(foreign)), {
      status: 'blocked',
      reason: 'emitted path is not a managed directory',
    });
    assert.equal(lstatSync(state.emitted).isSymbolicLink(), true);
    assert.ok(existsSync(state.adapter));
  } finally {
    rmSync(state.root, { recursive: true, force: true });
  }
});

for (const variant of ['file', 'directory', 'wrong link'] as const) {
  test(`blocks a foreign adapter ${variant} before deleting the emitted directory`, () => {
    const state = fixture();
    try {
      rmSync(state.adapter, { recursive: true, force: true });
      if (variant === 'file') {
        writeFileSync(state.adapter, 'foreign adapter\n');
      } else if (variant === 'directory') {
        mkdirSync(state.adapter);
        writeFileSync(join(state.adapter, 'note.txt'), 'foreign adapter\n');
      } else {
        symlinkSync(
          join(state.root, 'somewhere-else'),
          state.adapter,
          process.platform === 'win32' ? 'junction' : 'dir',
        );
      }

      assert.deepEqual(removeManagedSkill(candidate(state.root), state.hash), {
        status: 'blocked',
        reason: 'adapter ownership cannot be proven',
      });
      assert.ok(existsSync(state.emitted));
      assert.ok(lstatSync(state.adapter));
    } finally {
      rmSync(state.root, { recursive: true, force: true });
    }
  });
}

for (const variant of ['ignored entry', 'nested link', 'empty directory'] as const) {
  test(`blocks ${variant} that the regular-file hash does not represent`, () => {
    const state = fixture();
    try {
      if (variant === 'ignored entry') {
        mkdirSync(join(state.emitted, '.git'));
        writeFileSync(join(state.emitted, '.git', 'config'), 'local metadata\n');
      } else if (variant === 'nested link') {
        symlinkSync(
          join(state.root, 'foreign'),
          join(state.emitted, 'local-link'),
          process.platform === 'win32' ? 'junction' : 'dir',
        );
      } else {
        mkdirSync(join(state.emitted, 'empty'));
      }
      assert.equal(hashSkillDir(state.emitted), state.hash);

      assert.deepEqual(removeManagedSkill(candidate(state.root), state.hash), {
        status: 'blocked',
        reason: 'unrepresented local structure',
      });
      assert.ok(lstatSync(state.emitted));
      assert.ok(existsSync(state.adapter));
    } finally {
      rmSync(state.root, { recursive: true, force: true });
    }
  });
}

test('validates every lock-derived name as one cross-platform path segment', () => {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-removal-paths-'));
  try {
    for (const unsafe of ['..', '../outside', 'nested/name', 'nested\\name', 'C:', 'CON']) {
      assert.throws(
        () => resolveManagedRemovalCandidates(root, '.agents/skills', ['safe', unsafe]),
        /lock is corrupt: unsafe managed skill name.*expected one path segment/,
      );
    }
    assert.deepEqual(
      resolveManagedRemovalCandidates(root, '.agents/skills', ['safe']).map(({ name }) => name),
      ['safe'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
