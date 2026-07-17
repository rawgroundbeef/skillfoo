import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const START = '<!-- skillfoo:start -->';
const END = '<!-- skillfoo:end -->';

function frontmatter(skillMdPath) {
  if (!existsSync(skillMdPath)) return {};
  const m = readFileSync(skillMdPath, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  try {
    return parse(m[1]) || {};
  } catch {
    return {};
  }
}

function firstSentence(s) {
  if (!s) return '';
  const i = s.indexOf('. ');
  return (i === -1 ? s : s.slice(0, i + 1)).trim();
}

function buildBlock(emitRel, skills) {
  const lines = [
    START,
    '## Skills',
    '',
    `Shared agent skills live in \`${emitRel}/\` (synced by skillfoo — edit them in the source registry, not here):`,
    '',
  ];
  for (const s of skills) {
    lines.push(`- [${s.name}](${emitRel}/${s.name}/SKILL.md) — ${firstSentence(s.description)}`);
  }
  lines.push(END);
  return lines.join('\n');
}

/**
 * Create or update the AGENTS.md "## Skills" block that points agents at the
 * synced skills. The block is fenced by markers so the user's own AGENTS.md
 * prose around it is preserved.
 */
export function updateAgentsMd(cwd, emitRel, skillNames) {
  const skills = skillNames.map((name) => ({
    name,
    description: frontmatter(join(cwd, emitRel, name, 'SKILL.md')).description || '',
  }));
  const block = buildBlock(emitRel, skills);
  const path = join(cwd, 'AGENTS.md');

  let next;
  if (existsSync(path)) {
    const cur = readFileSync(path, 'utf8');
    if (cur.includes(START) && cur.includes(END)) {
      next = cur.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
    } else {
      next = `${cur.trimEnd()}\n\n${block}\n`;
    }
  } else {
    next = `# Agents\n\n${block}\n`;
  }
  writeFileSync(path, next);
}

/**
 * Claude Code discovers skills in .claude/skills/. Symlink each synced skill
 * there so it points back at the canonical copy in the neutral emit dir.
 */
export function linkClaudeAdapter(cwd, emitRel, skillNames) {
  const claudeDir = join(cwd, '.claude', 'skills');
  mkdirSync(claudeDir, { recursive: true });
  for (const name of skillNames) {
    const link = join(claudeDir, name);
    rmSync(link, { recursive: true, force: true });
    // relative to .claude/skills/ (two levels below the repo root)
    symlinkSync(`../../${emitRel}/${name}`, link);
  }
}
