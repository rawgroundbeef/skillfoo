import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import {
  createClaudeAdapter,
  inspectClaudeAdapter,
  resolveClaudeAdapterCandidate,
} from './adapter.js';

const START = '<!-- skillfoo:start -->';
const END = '<!-- skillfoo:end -->';

export interface DescribedSkill {
  name: string;
  description: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function frontmatter(skillMdPath: string): Record<string, unknown> {
  let stat;
  try {
    stat = lstatSync(skillMdPath);
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return {};
    }
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return {};

  const match = readFileSync(skillMdPath, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
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

export function readSkillDescription(skillDir: string): string {
  return firstSentence(frontmatter(join(skillDir, 'SKILL.md')).description);
}

function buildBlock(
  emitRel: string,
  skills: readonly DescribedSkill[],
  includeHeading = true,
): string {
  const lines = [START];
  if (includeHeading) lines.push('## Skills', '');
  lines.push(
    `Shared agent skills live in \`${emitRel}/\` (synced by skillfoo — edit them in the source registry, not here):`,
    '',
  );
  for (const skill of skills) {
    lines.push(canonicalRow(emitRel, skill));
  }
  lines.push(END);
  return lines.join('\n');
}

function canonicalRow(emitRel: string, skill: DescribedSkill): string {
  return `- [${skill.name}](${emitRel}/${skill.name}/SKILL.md) — ${skill.description}`;
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
  emitRel: string,
  currentBlock: string,
  activeSkills: readonly DescribedSkill[],
  retainedSkills: readonly DescribedSkill[],
): string {
  const active = new Map(activeSkills.map((skill) => [skill.name, skill]));
  const retained = new Map(retainedSkills.map((skill) => [skill.name, skill]));
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
    } else if (name !== undefined) {
      const activeSkill = active.get(name);
      if (activeSkill !== undefined) {
        rows.push(`${canonicalRow(emitRel, activeSkill)}${ending || lineEnding}`);
        represented.add(name);
      }
    }
  }

  for (const skill of [...activeSkills, ...retainedSkills]) {
    if (!represented.has(skill.name)) {
      rows.push(`${canonicalRow(emitRel, skill)}${lineEnding}`);
      represented.add(skill.name);
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

export function renderAgentsMd(
  current: string | null,
  emitRel: string,
  activeSkills: readonly DescribedSkill[],
  retainedSkills: readonly DescribedSkill[] = [],
): string | null {
  const skillNames = [...activeSkills, ...retainedSkills];

  if (skillNames.length === 0) {
    if (current === null) return null;
    const span = managedSpan(current);
    if (span === null) return current;
    let end = span.end;
    if (current.startsWith('\r\n', end)) end += 2;
    else if (current.startsWith('\n', end)) end += 1;
    return current.slice(0, span.start) + current.slice(end);
  }

  if (current !== null) {
    const span = managedSpan(current);
    if (span !== null) {
      const block = reconcileManagedBlock(emitRel, span.block, activeSkills, retainedSkills);
      return current.slice(0, span.start) + block + current.slice(span.end);
    }

    const block = buildBlock(emitRel, skillNames, false);
    return (
      appendToSkillsSection(current, block) ??
      `${current.trimEnd()}\n\n${buildBlock(emitRel, skillNames)}\n`
    );
  }

  return `# Agents\n\n${buildBlock(emitRel, skillNames)}\n`;
}

export function writeAgentsMd(cwd: string, contents: string): void {
  writeFileSync(join(cwd, 'AGENTS.md'), contents);
}

export function updateAgentsMd(
  cwd: string,
  emitRel: string,
  activeNames: readonly string[],
  retainedNames: readonly string[] = [],
): void {
  const path = join(cwd, 'AGENTS.md');
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  const describe = (name: string): DescribedSkill => ({
    name,
    description: readSkillDescription(join(cwd, emitRel, name)),
  });
  const next = renderAgentsMd(
    current,
    emitRel,
    activeNames.map(describe),
    retainedNames.map(describe),
  );
  if (next !== null && next !== current) writeAgentsMd(cwd, next);
}

/** Compatibility helper for callers that want to create missing safe adapters. */
export function linkClaudeAdapter(
  cwd: string,
  emitRel: string,
  skillNames: readonly string[],
): void {
  for (const name of skillNames) {
    const candidate = resolveClaudeAdapterCandidate(cwd, emitRel, name);
    if (inspectClaudeAdapter(cwd, candidate).status === 'missing') {
      createClaudeAdapter(candidate);
    }
  }
}
