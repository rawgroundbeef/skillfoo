import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { updateAgentsMd } from '../src/emit.js';

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
