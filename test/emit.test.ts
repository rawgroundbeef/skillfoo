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
      '# Agents\n\n<!-- skillfoo:start -->\nold content\n<!-- skillfoo:end -->\n',
    );

    updateAgentsMd(root, '.agents/skills', ['billing']);

    const agentsMd = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    assert.match(agentsMd, /Handles \$& billing workflows\./);
    assert.doesNotMatch(agentsMd, /old content/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
