import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';

const START = '<!-- skillfoo:start -->';
const END = '<!-- skillfoo:end -->';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function frontmatter(skillMdPath: string): Record<string, unknown> {
  if (!existsSync(skillMdPath)) return {};
  const match = readFileSync(skillMdPath, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  const yaml = match?.[1];
  if (yaml === undefined) return {};

  try {
    const parsed: unknown = parse(yaml);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function firstSentence(value: unknown): string {
  if (typeof value !== 'string') return '';
  const index = value.indexOf('. ');
  return (index === -1 ? value : value.slice(0, index + 1)).trim();
}

function buildBlock(
  emitRel: string,
  skills: ReadonlyArray<{ name: string; description: string }>,
  includeHeading = true,
): string {
  const lines = [START];
  if (includeHeading) lines.push('## Skills', '');
  lines.push(
    `Shared agent skills live in \`${emitRel}/\` (synced by skillfoo — edit them in the source registry, not here):`,
    '',
  );
  for (const skill of skills) {
    lines.push(`- [${skill.name}](${emitRel}/${skill.name}/SKILL.md) — ${skill.description}`);
  }
  lines.push(END);
  return lines.join('\n');
}

function appendToSkillsSection(current: string, block: string): string | null {
  const heading = /^##[\t ]+Skills[\t ]*\r?$/m.exec(current);
  if (heading?.index === undefined) return null;

  const sectionBodyStart = heading.index + heading[0].length;
  const followingHeading = /^##[\t ]+/m.exec(current.slice(sectionBodyStart));
  const insertionIndex =
    followingHeading?.index === undefined
      ? current.length
      : sectionBodyStart + followingHeading.index;
  const before = current.slice(0, insertionIndex);
  const after = current.slice(insertionIndex);
  const beforeSeparator = before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const afterSeparator = after.length > 0 ? '\n\n' : '\n';

  return `${before}${beforeSeparator}${block}${afterSeparator}${after}`;
}

export function updateAgentsMd(cwd: string, emitRel: string, skillNames: readonly string[]): void {
  const skills = skillNames.map((name) => ({
    name,
    description: firstSentence(frontmatter(join(cwd, emitRel, name, 'SKILL.md')).description),
  }));
  const path = join(cwd, 'AGENTS.md');

  let next: string;
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8');
    if (current.includes(START) && current.includes(END)) {
      const managed = current.match(new RegExp(`${START}[\\s\\S]*?${END}`))?.[0] ?? '';
      const block = buildBlock(emitRel, skills, /^##[\t ]+Skills[\t ]*\r?$/m.test(managed));
      next = current.replace(new RegExp(`${START}[\\s\\S]*?${END}`), () => block);
    } else {
      const block = buildBlock(emitRel, skills, false);
      next = appendToSkillsSection(current, block) ?? `${current.trimEnd()}\n\n${buildBlock(emitRel, skills)}\n`;
    }
  } else {
    next = `# Agents\n\n${buildBlock(emitRel, skills)}\n`;
  }
  writeFileSync(path, next);
}

export function linkClaudeAdapter(
  cwd: string,
  emitRel: string,
  skillNames: readonly string[],
): void {
  const claudeDir = join(cwd, '.claude', 'skills');
  mkdirSync(claudeDir, { recursive: true });
  for (const name of skillNames) {
    const link = join(claudeDir, name);
    rmSync(link, { recursive: true, force: true });
    const relativeTarget = `../../${emitRel}/${name}`;
    const target = process.platform === 'win32' ? resolve(claudeDir, relativeTarget) : relativeTarget;
    symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  }
}
