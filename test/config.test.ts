import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createConfigExclusive,
  editOverridePolicy,
  loadConfig,
  renderConfig,
  validateEmitPath,
} from '../src/config.js';

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
      overrides: {},
    });
  });
});

test('rejects non-string skill names at the config boundary', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, '.skillfoo.yml'), 'registry: ../skills\nskills: [slice, 42]\n');
    assert.throws(() => loadConfig(dir), /skills.*list of names/);
  });
});

test('renders minimal deterministic configs and normalizes named selections', () => {
  assert.equal(
    renderConfig({ registry: '../registry', skills: ['beta', 'alpha', 'beta'] }),
    'registry: ../registry\nskills:\n  - beta\n  - alpha\n',
  );
  assert.equal(
    renderConfig({ registry: '../registry', emit: 'tools/agent-skills', skills: null }),
    'registry: ../registry\nemit: tools/agent-skills\n',
  );
  assert.equal(renderConfig({ registry: 'path: with # syntax', skills: null }),
    'registry: "path: with # syntax"\n');
});

test('creates config exclusively and preserves every existing byte', () => {
  withTempDir((dir) => {
    createConfigExclusive(dir, {
      registry: '../registry',
      skills: ['alpha'],
    });
    const path = join(dir, '.skillfoo.yml');
    const created = readFileSync(path);
    assert.equal(
      created.toString(),
      'registry: ../registry\nskills:\n  - alpha\n',
    );

    assert.throws(
      () => createConfigExclusive(dir, { registry: '../other', skills: null }),
      /already exists.*status.*sync/,
    );
    assert.deepEqual(readFileSync(path), created);
  });
});

test('validates contained emit paths and rejects redirected existing ancestors', () => {
  withTempDir((root) => {
    const consumer = join(root, 'consumer');
    const outside = join(root, 'outside');
    mkdirSync(consumer);
    mkdirSync(outside);

    assert.equal(validateEmitPath(consumer, 'tools/agent-skills'), join(consumer, 'tools', 'agent-skills'));
    assert.equal(validateEmitPath(consumer, '.'), consumer);
    assert.throws(() => validateEmitPath(consumer, ''), /non-empty relative path/);
    assert.throws(() => validateEmitPath(consumer, outside), /relative path inside/);
    assert.throws(() => validateEmitPath(consumer, '../outside'), /must not escape/);
    assert.throws(() => validateEmitPath(consumer, '..\\outside'), /must not escape/);
    assert.throws(() => validateEmitPath(consumer, 'C:\\outside'), /relative path inside/);

    writeFileSync(join(consumer, 'file-parent'), 'keep\n');
    assert.throws(
      () => validateEmitPath(consumer, 'file-parent/skills'),
      /unsafe existing ancestor: file-parent/,
    );

    symlinkSync(
      outside,
      join(consumer, 'linked-parent'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    assert.throws(
      () => validateEmitPath(consumer, 'linked-parent/skills'),
      /unsafe existing ancestor: linked-parent/,
    );
  });
});

test('manual configs use the same emit safety boundary before returning', () => {
  withTempDir((dir) => {
    for (const emit of ['', '../outside']) {
      writeFileSync(
        join(dir, '.skillfoo.yml'),
        `registry: ../registry\nemit: ${JSON.stringify(emit)}\n`,
      );
      assert.throws(() => loadConfig(dir), /emit/);
    }

    writeFileSync(join(dir, '.skillfoo.yml'), 'registry: ../registry\nemit: null\n');
    assert.throws(() => loadConfig(dir), /emit.*path/);
  });
});

test('loads strict local Override maps with prototype-shaped names as own entries', () => {
  withTempDir((dir) => {
    writeFileSync(
      join(dir, '.skillfoo.yml'),
      'registry: ../skills\nskills: [alpha, __proto__]\noverrides: { alpha: local, __proto__: local }\n',
    );
    const config = loadConfig(dir);
    assert.deepEqual(Object.keys(config.overrides), ['alpha', '__proto__']);
    assert.equal(Object.hasOwn(config.overrides, '__proto__'), true);
    assert.equal(config.overrides.__proto__, 'local');
  });
});

test('rejects every malformed Override mapping shape', () => {
  withTempDir((dir) => {
    const cases: readonly [string, RegExp][] = [
      ['overrides: null\n', /overrides.*mapping/],
      ['overrides: [alpha]\n', /overrides.*mapping/],
      ['overrides: local\n', /overrides.*mapping/],
      ['overrides: { alpha: registry }\n', /overrides\.alpha.*exactly local/],
      ['overrides: { ../alpha: local }\n', /unsafe skill name/],
      ['overrides:\n  42: local\n', /keys must be string/],
      ['overrides:\n  ? [alpha, beta]\n  : local\n', /keys must be string/],
      ['overrides:\n  alpha: local\n  alpha: local\n', /Map keys must be unique/],
    ];
    for (const [overrides, expected] of cases) {
      writeFileSync(join(dir, '.skillfoo.yml'), `registry: ../skills\n${overrides}`);
      assert.throws(() => loadConfig(dir), expected, overrides);
    }
  });
});

test('edits one Override policy document-aware and leaves satisfied policy byte-exact', () => {
  withTempDir((dir) => {
    const before =
      '# consumer policy\n' +
      'registry: ../skills # local source\n' +
      'skills: [alpha, beta]\n' +
      'future-settings:\n' +
      '  reviewer: "keep this" # future key\n';
    const added = editOverridePolicy(dir, before, 'alpha', true);
    assert.match(added, /^# consumer policy/m);
    assert.match(added, /registry: \.\.\/skills # local source/);
    assert.match(added, /reviewer: "keep this" # future key/);
    assert.match(added, /overrides:\n  alpha: local\n$/);
    assert.equal(editOverridePolicy(dir, added, 'alpha', true), added);

    const removed = editOverridePolicy(dir, added, 'alpha', false);
    assert.doesNotMatch(removed, /overrides:/);
    assert.match(removed, /reviewer: "keep this" # future key/);

    const multiple =
      'registry: ../skills\nskills: [alpha, beta]\noverrides:\n  alpha: local\n  beta: local\n';
    const oneLeft = editOverridePolicy(dir, multiple, 'alpha', false);
    assert.doesNotMatch(oneLeft, /alpha: local/);
    assert.match(oneLeft, /overrides:\n  beta: local/);
  });
});
