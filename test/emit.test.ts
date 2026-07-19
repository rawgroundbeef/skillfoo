import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { renderAgentsMd, renderTargetAgentsMd, updateAgentsMd } from '../src/emit.js';

test('preserves replacement patterns when updating the managed AGENTS.md block', () => {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-emit-'));
  const skillDir = join(root, '.agents', 'skills', 'billing');

  try {
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: billing\ndescription: Handles $& billing workflows. More detail.\n---\n',
    );
    writeFileSync(
      join(root, 'AGENTS.md'),
      '# Agents\n\n<!-- skillfoo:start -->\n## Skills\n\nold content\n<!-- skillfoo:end -->\n',
    );

    updateAgentsMd(root, '.agents/skills', ['billing']);

    const agentsMd = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    assert.equal(agentsMd.match(/^## Skills$/gm)?.length, 1);
    assert.match(agentsMd, /Handles \$& billing workflows\./);
    assert.doesNotMatch(agentsMd, /old content/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adds managed skills inside an existing skills section without changing local skills', () => {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-existing-skills-'));
  const skillDir = join(root, '.agents', 'skills', 'shared');
  const original = [
    '# Agents',
    '',
    '## Skills',
    '',
    '- [local](.agents/skills/local/SKILL.md) — Repo-specific guidance.',
    '',
    '## Workflow',
    '',
    'Keep this section unchanged.',
    '',
  ].join('\n');

  try {
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: shared\ndescription: Shared registry guidance. More detail.\n---\n',
    );
    writeFileSync(join(root, 'AGENTS.md'), original);

    updateAgentsMd(root, '.agents/skills', ['shared']);

    const firstSync = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    assert.equal(firstSync.match(/^## Skills$/gm)?.length, 1);
    assert.match(firstSync, /- \[local\].*Repo-specific guidance\./);
    assert.match(firstSync, /<!-- skillfoo:start -->[\s\S]*- \[shared\]/);
    assert.ok(firstSync.indexOf('<!-- skillfoo:end -->') < firstSync.indexOf('## Workflow'));
    assert.match(firstSync, /## Workflow\n\nKeep this section unchanged\./);

    updateAgentsMd(root, '.agents/skills', ['shared']);
    assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), firstSync);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('appends a managed skills section when the existing file has none', () => {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-no-skills-section-'));
  const skillDir = join(root, '.agents', 'skills', 'shared');

  try {
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: shared\ndescription: Shared registry guidance. More detail.\n---\n',
    );
    writeFileSync(join(root, 'AGENTS.md'), '# Agents\n\n## Workflow\n\nKeep this section.\n');

    updateAgentsMd(root, '.agents/skills', ['shared']);

    const firstSync = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    assert.equal(firstSync.match(/^## Skills$/gm)?.length, 1);
    assert.ok(firstSync.indexOf('## Workflow') < firstSync.indexOf('<!-- skillfoo:start -->'));
    assert.match(firstSync, /## Workflow\n\nKeep this section\./);
    assert.match(firstSync, /<!-- skillfoo:start -->[\s\S]*- \[shared\]/);

    updateAgentsMd(root, '.agents/skills', ['shared']);
    assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), firstSync);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const lineEnding of ['\n', '\r\n']) {
  test(`removes only the final managed marker span and its ${lineEnding === '\n' ? 'LF' : 'CRLF'}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'skillfoo-empty-agents-'));
    const before = `# Agents${lineEnding}${lineEnding}## Skills${lineEnding}${lineEnding}`;
    const block = [
      '<!-- skillfoo:start -->',
      'managed content',
      '<!-- skillfoo:end -->',
      '',
    ].join(lineEnding);
    const after = `${lineEnding}## Workflow${lineEnding}${lineEnding}Keep this.${lineEnding}`;
    try {
      writeFileSync(join(root, 'AGENTS.md'), before + block + after);
      updateAgentsMd(root, '.agents/skills', []);
      assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), before + after);

      updateAgentsMd(root, '.agents/skills', []);
      assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), before + after);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('does not create AGENTS.md for an empty managed set', () => {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-no-agents-'));
  try {
    updateAgentsMd(root, '.agents/skills', []);
    assert.equal(existsSync(join(root, 'AGENTS.md')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('preserves retained rows byte-for-byte while refreshing and removing neighboring rows', () => {
  const root = mkdtempSync(join(tmpdir(), 'skillfoo-retained-row-'));
  const active = join(root, '.agents', 'skills', 'active');
  const retained = join(root, '.agents', 'skills', 'retained');
  const retainedRow = '- [retained](old/location/SKILL.md) — Keep $& this exact description.\r\n';
  try {
    mkdirSync(active, { recursive: true });
    mkdirSync(retained, { recursive: true });
    writeFileSync(
      join(active, 'SKILL.md'),
      '---\nname: active\ndescription: Refreshed active guidance. More detail.\n---\n',
    );
    writeFileSync(
      join(retained, 'SKILL.md'),
      '---\nname: retained\ndescription: Locally changed metadata.\n---\n',
    );
    writeFileSync(
      join(root, 'AGENTS.md'),
      '<!-- skillfoo:start -->\r\n' +
        'Shared agent skills live here:\r\n\r\n' +
        '- [active](old/location/SKILL.md) — Stale.\r\n' +
        '- [removed](old/location/SKILL.md) — Remove me.\r\n' +
        retainedRow +
        '<!-- skillfoo:end -->\r\n',
    );

    updateAgentsMd(root, '.agents/skills', ['active'], ['retained']);

    const next = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    assert.match(next, /- \[active\]\(\.agents\/skills\/active\/SKILL\.md\) — Refreshed active guidance\./);
    assert.doesNotMatch(next, /\[removed\]/);
    assert.ok(next.includes(retainedRow));
    assert.ok(next.indexOf('[active]') < next.indexOf('[retained]'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const lineEnding of ['\n', '\r\n']) {
  test(`targeted rendering changes only the named managed row with ${lineEnding === '\n' ? 'LF' : 'CRLF'}`, () => {
    const alphaBefore = `- [alpha](old/alpha/SKILL.md) — Local alpha.${lineEnding}`;
    const beta = `  - [beta](custom/beta/SKILL.md) — Preserve $& beta.${lineEnding}`;
    const current =
      `# Agents${lineEnding}${lineEnding}` +
      `Bespoke before.${lineEnding}` +
      `<!-- skillfoo:start -->${lineEnding}` +
      `Custom managed introduction.${lineEnding}${lineEnding}` +
      alphaBefore +
      beta +
      `<!-- skillfoo:end -->${lineEnding}` +
      `Bespoke after.${lineEnding}`;

    const next = renderTargetAgentsMd(current, '.agents/skills', {
      name: 'alpha',
      description: 'Registry alpha.',
    });

    assert.equal(
      next,
      current.replace(
        alphaBefore,
        `- [alpha](.agents/skills/alpha/SKILL.md) — Registry alpha.${lineEnding}`,
      ),
    );
    assert.ok(next.includes(beta));
  });
}

test('targeted rendering inserts only a missing target row or target-only block', () => {
  const managed =
    '# Agents\n\n<!-- skillfoo:start -->\nExisting intro.\n' +
    '- [beta](custom/beta/SKILL.md) — Preserve beta.\n<!-- skillfoo:end -->\n';
  const inserted = renderTargetAgentsMd(managed, '.agents/skills', {
    name: 'alpha',
    description: 'Registry alpha.',
  });
  assert.equal(
    inserted,
    managed.replace(
      '<!-- skillfoo:end -->',
      '- [alpha](.agents/skills/alpha/SKILL.md) — Registry alpha.\n<!-- skillfoo:end -->',
    ),
  );

  const bespoke = '# Agents\n\n## Workflow\n\nPreserve this.\n';
  const targetOnly = renderTargetAgentsMd(bespoke, '.agents/skills', {
    name: 'alpha',
    description: 'Registry alpha.',
  });
  assert.match(targetOnly, /## Workflow\n\nPreserve this\./);
  assert.match(targetOnly, /<!-- skillfoo:start -->[\s\S]*\[alpha\]/);
  assert.doesNotMatch(targetOnly, /\[beta\]/);
});

test('renders neutral guidance and labels only local Override rows', () => {
  const rendered = renderAgentsMd(
    null,
    '.agents/skills',
    [
      { name: 'alpha', description: 'Local alpha.', localOverride: true },
      { name: 'beta', description: 'Registry beta.' },
    ],
  );
  assert.ok(rendered);
  assert.match(rendered, /managed by skillfoo/);
  assert.doesNotMatch(rendered, /edit them in the source registry/);
  assert.match(rendered, /\[alpha\].*Local alpha\. \(local override; edit in this repository\)/);
  assert.match(rendered, /\[beta\].*Registry beta\.$/m);
  assert.doesNotMatch(rendered.match(/^.*\[beta\].*$/m)?.[0] ?? '', /local override/);
});

test('targeted Override rendering neutralizes the generated introduction and preserves unrelated rows', () => {
  const beta = '  - [beta](custom/beta/SKILL.md) — Preserve $& beta.\n';
  const current =
    '# Agents\n\n<!-- skillfoo:start -->\n## Skills\n\n' +
    'Shared agent skills live in `.agents/skills/` (synced by skillfoo — edit them in the source registry, not here):\n\n' +
    '- [alpha](.agents/skills/alpha/SKILL.md) — Registry alpha.\n' +
    beta +
    '<!-- skillfoo:end -->\n';
  const next = renderTargetAgentsMd(current, '.agents/skills', {
    name: 'alpha',
    description: 'Local alpha.',
    localOverride: true,
  });
  assert.match(next, /managed by skillfoo/);
  assert.doesNotMatch(next, /edit them in the source registry/);
  assert.ok(next.includes(beta));
  assert.match(next, /Local alpha\. \(local override; edit in this repository\)/);
});
