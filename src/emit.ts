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

function canonicalRow(cwd: string, emitRel: string, name: string): string {
  const description = firstSentence(frontmatter(join(cwd, emitRel, name, 'SKILL.md')).description);
  return `- [${name}](${emitRel}/${name}/SKILL.md) — ${description}`;
}

function managedSpan(current: string): { start: number; end: number; block: string } | null {
  const start = current.indexOf(START);
  if (start === -1) return null;
  const endMarker = current.indexOf(END, start + START.length);
  if (endMarker === -1) return null;
  const end = endMarker + END.length;
  return { start, end, block: current.slice(start, end) };
}

function reconcileManagedBlock(
  cwd: string,
  emitRel: string,
  currentBlock: string,
  activeNames: readonly string[],
  retainedNames: readonly string[],
): string {
  const active = new Set(activeNames);
  const retained = new Set(retainedNames);
  const represented = new Set<string>();
  const lineEnding = currentBlock.includes('\r\n') ? '\r\n' : '\n';
  const segments = currentBlock.match(/[^\r\n]*(?:\r\n|\n|$)/g)?.filter(Boolean) ?? [];
  const rows: string[] = [];

  for (const segment of segments) {
    const ending = segment.endsWith('\r\n') ? '\r\n' : segment.endsWith('\n') ? '\n' : '';
    const line = ending.length > 0 ? segment.slice(0, -ending.length) : segment;
    const row = /^[\t ]*- \[([^\]\r\n]+)\]\(/.exec(line);
    const name = row?.[1];
    if (name !== undefined && retained.has(name)) {
      rows.push(segment);
      represented.add(name);
    } else if (name !== undefined && active.has(name)) {
      rows.push(`${canonicalRow(cwd, emitRel, name)}${ending || lineEnding}`);
      represented.add(name);
    }
  }

  for (const missing of activeNames) {
    if (!represented.has(missing)) {
      rows.push(`${canonicalRow(cwd, emitRel, missing)}${lineEnding}`);
      represented.add(missing);
    }
  }
  for (const missing of retainedNames) {
    if (!represented.has(missing)) {
      rows.push(`${canonicalRow(cwd, emitRel, missing)}${lineEnding}`);
      represented.add(missing);
    }
  }

  const lines = [START];
  if (/^##[\t ]+Skills[\t ]*\r?$/m.test(currentBlock)) lines.push('## Skills', '');
  lines.push(
    `Shared agent skills live in \`${emitRel}/\` (synced by skillfoo — edit them in the source registry, not here):`,
    '',
  );
  return `${lines.join(lineEnding)}${lineEnding}${rows.join('')}${END}`;
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

export function updateAgentsMd(
  cwd: string,
  emitRel: string,
  activeNames: readonly string[],
  retainedNames: readonly string[] = [],
): void {
  const skillNames = [...activeNames, ...retainedNames];
  const path = join(cwd, 'AGENTS.md');

  if (skillNames.length === 0) {
    if (!existsSync(path)) return;
    const current = readFileSync(path, 'utf8');
    const span = managedSpan(current);
    if (span === null) return;
    let end = span.end;
    if (current.startsWith('\r\n', end)) end += 2;
    else if (current.startsWith('\n', end)) end += 1;
    writeFileSync(path, current.slice(0, span.start) + current.slice(end));
    return;
  }

  const skills = skillNames.map((name) => ({
    name,
    description: firstSentence(frontmatter(join(cwd, emitRel, name, 'SKILL.md')).description),
  }));

  let next: string;
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8');
    const span = managedSpan(current);
    if (span !== null) {
      const block = reconcileManagedBlock(cwd, emitRel, span.block, activeNames, retainedNames);
      next = current.slice(0, span.start) + block + current.slice(span.end);
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
