import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { readLock } from '../src/lockfile.js';
import { hashSkillDir } from '../src/skilldir.js';
import { sync } from '../src/sync.js';

interface SyncFixture {
  root: string;
  registry: string;
  consumer: string;
  output: string[];
}

function writeSkill(registry: string, name: string, description = `${name} guidance.`): void {
  const dir = join(registry, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
  );
}

function configure(
  consumer: string,
  skills: readonly string[] | null,
  emit = '.agents/skills',
): void {
  const selection = skills === null ? '' : `skills: ${JSON.stringify(skills)}\n`;
  writeFileSync(
    join(consumer, '.skillfoo.yml'),
    `registry: ../registry\nemit: ${emit}\n${selection}`,
  );
}

function makeFixture(
  context: TestContext,
  names: readonly string[],
  skills: readonly string[] | null = names,
): SyncFixture {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-sync-'));
  const registry = join(root, 'registry');
  const consumer = join(root, 'consumer');
  const output: string[] = [];
  mkdirSync(registry);
  mkdirSync(consumer);
  for (const name of names) writeSkill(registry, name);
  configure(consumer, skills);
  context.mock.method(console, 'log', (message: unknown) => output.push(String(message)));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, registry, consumer, output };
}

function managedRow(contents: string, name: string): string {
  const row = contents.match(new RegExp(`^- \\[${name}\\].*(?:\\r?\\n|$)`, 'm'))?.[0];
  assert.ok(row, `expected a managed row for ${name}`);
  return row;
}

function removeManagedSpan(contents: string): string {
  const start = contents.indexOf('<!-- skillfoo:start -->');
  assert.notEqual(start, -1);
  const markerEnd = contents.indexOf('<!-- skillfoo:end -->', start);
  assert.notEqual(markerEnd, -1);
  let end = markerEnd + '<!-- skillfoo:end -->'.length;
  if (contents.startsWith('\r\n', end)) end += 2;
  else if (contents.startsWith('\n', end)) end += 1;
  return contents.slice(0, start) + contents.slice(end);
}

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

test('safely removes one unchanged managed skill and ignores bespoke content', async (context) => {
  const state = makeFixture(context, ['alpha', 'beta']);
  const bespoke = join(state.consumer, '.agents', 'skills', 'bespoke', 'SKILL.md');
  mkdirSync(join(state.consumer, '.agents', 'skills', 'bespoke'), { recursive: true });
  writeFileSync(bespoke, 'bespoke bytes\n');
  writeFileSync(join(state.consumer, 'AGENTS.md'), '# Agents\n\nRepository-authored guidance.\n');

  await sync(state.consumer);
  const alphaBefore = readFileSync(
    join(state.consumer, '.agents', 'skills', 'alpha', 'SKILL.md'),
  );
  configure(state.consumer, ['alpha']);
  state.output.length = 0;

  await sync(state.consumer);

  assert.ok(state.output.some((line) => line.includes('- beta')));
  assert.ok(state.output.some((line) => line.includes('1 removed')));
  assert.equal(existsSync(join(state.consumer, '.agents', 'skills', 'beta')), false);
  assert.equal(existsSync(join(state.consumer, '.claude', 'skills', 'beta')), false);
  assert.deepEqual(Object.keys(readLock(state.consumer).skills), ['alpha']);
  const agents = readFileSync(join(state.consumer, 'AGENTS.md'), 'utf8');
  assert.match(agents, /\[alpha\]/);
  assert.doesNotMatch(agents, /\[beta\]/);
  assert.match(agents, /Repository-authored guidance\./);
  assert.equal(readFileSync(bespoke, 'utf8'), 'bespoke bytes\n');
  assert.deepEqual(
    readFileSync(join(state.consumer, '.agents', 'skills', 'alpha', 'SKILL.md')),
    alphaBefore,
  );

  const stable = {
    agents: readFileSync(join(state.consumer, 'AGENTS.md')),
    lock: readFileSync(join(state.consumer, '.skillfoo.lock')),
    alpha: readFileSync(join(state.consumer, '.agents', 'skills', 'alpha', 'SKILL.md')),
    bespoke: readFileSync(bespoke),
  };
  state.output.length = 0;
  await sync(state.consumer);
  assert.equal(state.output.some((line) => line.includes('- beta')), false);
  assert.deepEqual(readFileSync(join(state.consumer, 'AGENTS.md')), stable.agents);
  assert.deepEqual(readFileSync(join(state.consumer, '.skillfoo.lock')), stable.lock);
  assert.deepEqual(
    readFileSync(join(state.consumer, '.agents', 'skills', 'alpha', 'SKILL.md')),
    stable.alpha,
  );
  assert.deepEqual(readFileSync(bespoke), stable.bespoke);
});

test('removes the final managed skill and only the owned AGENTS.md span', async (context) => {
  const state = makeFixture(context, ['alpha'], ['alpha']);
  const bespoke = join(state.consumer, '.agents', 'skills', 'bespoke', 'SKILL.md');
  mkdirSync(join(state.consumer, '.agents', 'skills', 'bespoke'), { recursive: true });
  writeFileSync(bespoke, 'bespoke bytes\n');
  writeFileSync(
    join(state.consumer, 'AGENTS.md'),
    '# Agents\n\n## Skills\n\n- [local](local/SKILL.md) — Keep.\n\n## Workflow\n\nKeep this.\n',
  );
  await sync(state.consumer);
  const before = readFileSync(join(state.consumer, 'AGENTS.md'), 'utf8');
  const expected = removeManagedSpan(before);
  configure(state.consumer, []);

  await sync(state.consumer);

  assert.equal(existsSync(join(state.consumer, '.agents', 'skills', 'alpha')), false);
  assert.equal(existsSync(join(state.consumer, '.claude', 'skills', 'alpha')), false);
  assert.deepEqual(readLock(state.consumer), { lockfileVersion: 1, skills: {} });
  assert.equal(readFileSync(join(state.consumer, 'AGENTS.md'), 'utf8'), expected);
  assert.equal(readFileSync(bespoke, 'utf8'), 'bespoke bytes\n');

  const stableLock = readFileSync(join(state.consumer, '.skillfoo.lock'));
  await sync(state.consumer);
  assert.equal(readFileSync(join(state.consumer, 'AGENTS.md'), 'utf8'), expected);
  assert.deepEqual(readFileSync(join(state.consumer, '.skillfoo.lock')), stableLock);
});

test('removes managed projections from a stable custom emit root', async (context) => {
  const state = makeFixture(context, ['alpha'], ['alpha']);
  configure(state.consumer, ['alpha'], 'generated/shared-skills');
  await sync(state.consumer);
  const emitted = join(state.consumer, 'generated', 'shared-skills', 'alpha');
  const adapter = join(state.consumer, '.claude', 'skills', 'alpha');
  assert.equal(realpathSync(adapter), realpathSync(emitted));
  configure(state.consumer, [], 'generated/shared-skills');

  await sync(state.consumer);

  assert.equal(existsSync(emitted), false);
  assert.equal(existsSync(adapter), false);
  assert.deepEqual(readLock(state.consumer).skills, {});
});

test('retains every projection and prior row when local edits block removal', async (context) => {
  const state = makeFixture(context, ['beta'], ['beta']);
  await sync(state.consumer);
  const emitted = join(state.consumer, '.agents', 'skills', 'beta', 'SKILL.md');
  const adapter = join(state.consumer, '.claude', 'skills', 'beta');
  const previousEntry = readLock(state.consumer).skills.beta;
  const previousLock = readFileSync(join(state.consumer, '.skillfoo.lock'));
  const previousAgents = readFileSync(join(state.consumer, 'AGENTS.md'), 'utf8');
  const previousRow = managedRow(previousAgents, 'beta');
  const previousPosition = previousAgents.indexOf(previousRow);
  const adapterTarget = readlinkSync(adapter);
  writeFileSync(
    emitted,
    '---\nname: beta\ndescription: Locally changed description.\n---\n\n# Local beta\n',
  );
  const editedBytes = readFileSync(emitted);
  configure(state.consumer, []);

  for (const force of [false, false, true]) {
    state.output.length = 0;
    await sync(state.consumer, { force });
    assert.ok(
      state.output.some((line) =>
        line.includes('⊘ beta  (removal blocked — local changes)'),
      ),
    );
    assert.deepEqual(readFileSync(emitted), editedBytes);
    assert.equal(readlinkSync(adapter), adapterTarget);
    assert.deepEqual(readLock(state.consumer).skills.beta, previousEntry);
    assert.deepEqual(readFileSync(join(state.consumer, '.skillfoo.lock')), previousLock);
    const agents = readFileSync(join(state.consumer, 'AGENTS.md'), 'utf8');
    assert.equal(managedRow(agents, 'beta'), previousRow);
    assert.equal(agents.indexOf(previousRow), previousPosition);
  }
});

test('foreign adapter content blocks removal before the emitted directory is touched', async (context) => {
  const state = makeFixture(context, ['beta'], ['beta']);
  await sync(state.consumer);
  const emitted = join(state.consumer, '.agents', 'skills', 'beta');
  const adapter = join(state.consumer, '.claude', 'skills', 'beta');
  const emittedBytes = readFileSync(join(emitted, 'SKILL.md'));
  const previousAgents = readFileSync(join(state.consumer, 'AGENTS.md'));
  const previousEntry = readLock(state.consumer).skills.beta;
  rmSync(adapter);
  writeFileSync(adapter, 'foreign adapter\n');
  configure(state.consumer, []);
  state.output.length = 0;

  await sync(state.consumer);

  assert.ok(state.output.some((line) => line.includes('adapter ownership cannot be proven')));
  assert.deepEqual(readFileSync(join(emitted, 'SKILL.md')), emittedBytes);
  assert.equal(readFileSync(adapter, 'utf8'), 'foreign adapter\n');
  assert.deepEqual(readFileSync(join(state.consumer, 'AGENTS.md')), previousAgents);
  assert.deepEqual(readLock(state.consumer).skills.beta, previousEntry);
});

test('implicitly removes a vanished registry skill but validates explicit names before mutation', async (context) => {
  const state = makeFixture(context, ['alpha', 'beta'], null);
  await sync(state.consumer);
  rmSync(join(state.registry, 'beta'), { recursive: true });
  state.output.length = 0;

  await sync(state.consumer);

  assert.ok(state.output.some((line) => line.includes('- beta')));
  assert.equal(existsSync(join(state.consumer, '.agents', 'skills', 'beta')), false);
  assert.deepEqual(Object.keys(readLock(state.consumer).skills), ['alpha']);

  configure(state.consumer, ['beta']);
  const stable = {
    emitted: readFileSync(join(state.consumer, '.agents', 'skills', 'alpha', 'SKILL.md')),
    adapter: readlinkSync(join(state.consumer, '.claude', 'skills', 'alpha')),
    agents: readFileSync(join(state.consumer, 'AGENTS.md')),
    lock: readFileSync(join(state.consumer, '.skillfoo.lock')),
  };
  await assert.rejects(sync(state.consumer), /not in the registry: beta/);
  assert.deepEqual(
    readFileSync(join(state.consumer, '.agents', 'skills', 'alpha', 'SKILL.md')),
    stable.emitted,
  );
  assert.equal(readlinkSync(join(state.consumer, '.claude', 'skills', 'alpha')), stable.adapter);
  assert.deepEqual(readFileSync(join(state.consumer, 'AGENTS.md')), stable.agents);
  assert.deepEqual(readFileSync(join(state.consumer, '.skillfoo.lock')), stable.lock);
});

test('rejects an unsafe removal name before desired-skill or removal mutation', async (context) => {
  const state = makeFixture(context, ['alpha'], ['alpha']);
  await sync(state.consumer);
  const emitted = join(state.consumer, '.agents', 'skills', 'alpha', 'SKILL.md');
  const oldEmitted = readFileSync(emitted);
  writeSkill(state.registry, 'alpha', 'New registry description.');
  const lock = readLock(state.consumer);
  writeFileSync(
    join(state.consumer, '.skillfoo.lock'),
    `${JSON.stringify(
      {
        ...lock,
        skills: {
          ...lock.skills,
          '../outside': { source: 'malicious', hash: 'sha256:not-owned' },
        },
      },
      null,
      2,
    )}\n`,
  );
  const stable = {
    adapter: readlinkSync(join(state.consumer, '.claude', 'skills', 'alpha')),
    agents: readFileSync(join(state.consumer, 'AGENTS.md')),
    lock: readFileSync(join(state.consumer, '.skillfoo.lock')),
  };

  await assert.rejects(sync(state.consumer), /lock is corrupt: unsafe managed skill name/);

  assert.deepEqual(readFileSync(emitted), oldEmitted);
  assert.equal(readlinkSync(join(state.consumer, '.claude', 'skills', 'alpha')), stable.adapter);
  assert.deepEqual(readFileSync(join(state.consumer, 'AGENTS.md')), stable.agents);
  assert.deepEqual(readFileSync(join(state.consumer, '.skillfoo.lock')), stable.lock);
});

test('unrepresented local structure blocks removal across repeated syncs', async (context) => {
  const state = makeFixture(context, ['beta'], ['beta']);
  await sync(state.consumer);
  const emitted = join(state.consumer, '.agents', 'skills', 'beta');
  const lockedHash = readLock(state.consumer).skills.beta?.hash;
  assert.ok(lockedHash);
  mkdirSync(join(emitted, 'empty-local-directory'));
  assert.equal(hashSkillDir(emitted), lockedHash);
  const adapter = join(state.consumer, '.claude', 'skills', 'beta');
  const adapterTarget = readlinkSync(adapter);
  const previousAgents = readFileSync(join(state.consumer, 'AGENTS.md'));
  const previousEntry = readLock(state.consumer).skills.beta;
  configure(state.consumer, []);

  for (let run = 0; run < 2; run++) {
    state.output.length = 0;
    await sync(state.consumer);
    assert.ok(state.output.some((line) => line.includes('unrepresented local structure')));
    assert.equal(lstatSync(join(emitted, 'empty-local-directory')).isDirectory(), true);
    assert.equal(readlinkSync(adapter), adapterTarget);
    assert.deepEqual(readFileSync(join(state.consumer, 'AGENTS.md')), previousAgents);
    assert.deepEqual(readLock(state.consumer).skills.beta, previousEntry);
  }
});

test('reconciles active, removed, and retained-blocked rows as distinct sets', async (context) => {
  const state = makeFixture(context, ['alpha', 'beta', 'gamma']);
  await sync(state.consumer);
  const agentsBefore = readFileSync(join(state.consumer, 'AGENTS.md'), 'utf8');
  const retainedRow = managedRow(agentsBefore, 'gamma');
  const retainedEntry = readLock(state.consumer).skills.gamma;
  writeSkill(state.registry, 'alpha', 'Refreshed alpha guidance. More detail.');
  writeFileSync(
    join(state.consumer, '.agents', 'skills', 'gamma', 'SKILL.md'),
    '---\nname: gamma\ndescription: Locally changed gamma metadata.\n---\n\n# gamma\n',
  );
  configure(state.consumer, ['alpha']);
  state.output.length = 0;

  await sync(state.consumer);

  assert.ok(state.output.some((line) => line.includes('- beta')));
  assert.ok(state.output.some((line) => line.includes('⊘ gamma')));
  assert.equal(existsSync(join(state.consumer, '.agents', 'skills', 'beta')), false);
  assert.equal(existsSync(join(state.consumer, '.claude', 'skills', 'beta')), false);
  assert.ok(existsSync(join(state.consumer, '.claude', 'skills', 'gamma')));
  const agents = readFileSync(join(state.consumer, 'AGENTS.md'), 'utf8');
  assert.match(agents, /\[alpha\].*Refreshed alpha guidance\./);
  assert.doesNotMatch(agents, /\[beta\]/);
  assert.equal(managedRow(agents, 'gamma'), retainedRow);
  assert.ok(agents.indexOf('[alpha]') < agents.indexOf('[gamma]'));
  assert.deepEqual(Object.keys(readLock(state.consumer).skills), ['alpha', 'gamma']);
  assert.deepEqual(readLock(state.consumer).skills.gamma, retainedEntry);

  state.output.length = 0;
  await sync(state.consumer);
  assert.equal(state.output.some((line) => line.includes('- beta')), false);
  assert.ok(state.output.some((line) => line.includes('⊘ gamma')));
  assert.equal(managedRow(readFileSync(join(state.consumer, 'AGENTS.md'), 'utf8'), 'gamma'), retainedRow);
});
