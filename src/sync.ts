import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadConfig } from './config.js';
import { linkClaudeAdapter, updateAgentsMd } from './emit.js';
import type { LockFile } from './lockfile.js';
import { readLock, writeLock } from './lockfile.js';
import { resolveRegistry } from './registry.js';
import { hashSkillDir, walkFiles } from './skilldir.js';

type SyncStatus = 'added' | 'updated' | 'unchanged' | 'drifted' | 'blocked';

function listRegistrySkills(registryDir: string): string[] {
  return readdirSync(registryDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(registryDir, name, 'SKILL.md')));
}

function removeEmptyDirs(dir: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = join(dir, entry.name);
    removeEmptyDirs(child);
    if (readdirSync(child).length === 0) rmdirSync(child);
  }
}

function mirrorSkillDir(srcDir: string, destDir: string): void {
  const files = walkFiles(srcDir);

  if (existsSync(destDir)) {
    const wanted = new Set(files);
    for (const relativePath of walkFiles(destDir)) {
      if (!wanted.has(relativePath)) rmSync(join(destDir, relativePath), { force: true });
    }
    removeEmptyDirs(destDir);
  }

  for (const relativePath of files) {
    const next = readFileSync(join(srcDir, relativePath));
    const destFile = join(destDir, relativePath);
    const previous = existsSync(destFile) ? readFileSync(destFile) : null;
    if (previous === null || !previous.equals(next)) {
      mkdirSync(dirname(destFile), { recursive: true });
      writeFileSync(destFile, next);
    }
  }
}

export async function sync(cwd: string, { force = false } = {}): Promise<void> {
  const config = loadConfig(cwd);
  const registryDir = resolveRegistry(config.registry, cwd);
  if (!existsSync(registryDir)) {
    throw new Error(`registry not found: ${registryDir} (registry: ${config.registry})`);
  }

  const available = listRegistrySkills(registryDir);
  const wanted = config.skills ?? available;
  const missing = wanted.filter((name) => !available.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `not in the registry: ${missing.join(', ')}\n` +
        `available: ${available.join(', ') || '(none)'}`,
    );
  }

  const emitRoot = resolve(cwd, config.emit);
  const lock = readLock(cwd);
  const newLock: LockFile = { lockfileVersion: 1, skills: {} };
  const managed: string[] = [];
  const mark: Record<SyncStatus, string> = {
    added: '+',
    updated: '~',
    unchanged: '=',
    drifted: '!',
    blocked: '⊘',
  };
  const tally: Record<SyncStatus, number> = {
    added: 0,
    updated: 0,
    unchanged: 0,
    drifted: 0,
    blocked: 0,
  };

  for (const name of wanted) {
    const srcDir = join(registryDir, name);
    const destDir = join(emitRoot, name);
    const registryHash = hashSkillDir(srcDir);
    const lockHash = lock.skills[name]?.hash;
    const destExists = existsSync(destDir) && walkFiles(destDir).length > 0;
    const destHash = destExists ? hashSkillDir(destDir) : null;
    const fileCount = walkFiles(srcDir).length;

    let status: SyncStatus;
    let nextHash: string | undefined;
    let overwroteLocalEdits = false;

    if (!lockHash && destExists) {
      status = 'blocked';
    } else if (!destExists) {
      status = 'added';
      mirrorSkillDir(srcDir, destDir);
      nextHash = registryHash;
    } else if (destHash === lockHash && registryHash === lockHash) {
      status = 'unchanged';
      nextHash = lockHash;
    } else if (destHash === lockHash) {
      status = 'updated';
      mirrorSkillDir(srcDir, destDir);
      nextHash = registryHash;
    } else if (destHash === registryHash) {
      status = 'unchanged';
      nextHash = registryHash;
    } else if (force) {
      status = 'updated';
      overwroteLocalEdits = true;
      mirrorSkillDir(srcDir, destDir);
      nextHash = registryHash;
    } else {
      status = 'drifted';
      nextHash = lockHash;
    }

    if (status !== 'blocked') {
      if (nextHash === undefined) {
        throw new Error(`internal error: no baseline hash for ${name}`);
      }
      newLock.skills[name] = { source: config.registry, hash: nextHash };
      managed.push(name);
    }

    tally[status]++;
    const files = fileCount > 1 ? ` (${fileCount} files)` : '';
    let note = '';
    if (status === 'drifted') {
      note = '  (drifted — local edits kept; run with --force to overwrite)';
    } else if (status === 'blocked') {
      note = '  (an untracked directory is here; remove it to let skillfoo manage this skill)';
    } else if (overwroteLocalEdits) {
      note = '  (overwrote local edits)';
    }
    console.log(`  ${mark[status]} ${name}${files}${note}`);
  }

  writeLock(cwd, newLock);

  const count = managed.length;
  console.log(
    `\nsynced ${count} skill${count === 1 ? '' : 's'} from ${config.registry} → ${config.emit}`,
  );
  let summary = `${tally.added} added · ${tally.updated} updated · ${tally.unchanged} unchanged`;
  if (tally.drifted > 0) summary += ` · ${tally.drifted} drifted`;
  if (tally.blocked > 0) summary += ` · ${tally.blocked} blocked`;
  console.log(summary);

  if (count > 0) {
    updateAgentsMd(cwd, config.emit, managed);
    linkClaudeAdapter(cwd, config.emit, managed);
    console.log(`updated AGENTS.md · linked .claude/skills/ → ${config.emit}/ (Claude adapter)`);
  }
}
