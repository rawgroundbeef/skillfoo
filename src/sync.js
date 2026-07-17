import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  rmSync,
  rmdirSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { loadConfig } from './config.js';
import { resolveRegistry } from './registry.js';
import { updateAgentsMd, linkClaudeAdapter } from './emit.js';
import { walkFiles, hashSkillDir } from './skilldir.js';
import { readLock, writeLock } from './lockfile.js';

// A skill is any top-level directory in the registry that holds a SKILL.md.
function listRegistrySkills(registryDir) {
  return readdirSync(registryDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .filter((name) => existsSync(join(registryDir, name, 'SKILL.md')));
}

// Remove empty subdirectories without ever removing the skill root itself.
function removeEmptyDirs(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = join(dir, entry.name);
    removeEmptyDirs(child);
    if (readdirSync(child).length === 0) rmdirSync(child);
  }
}

// Mirror a whole managed skill directory into the consumer. Byte-compare so any
// file type is handled without mtime churn, and remove files dropped upstream.
function mirrorSkillDir(srcDir, destDir) {
  const files = walkFiles(srcDir);

  if (existsSync(destDir)) {
    const wanted = new Set(files);
    for (const rel of walkFiles(destDir)) {
      if (!wanted.has(rel)) rmSync(join(destDir, rel), { force: true });
    }
    removeEmptyDirs(destDir);
  }

  for (const rel of files) {
    const next = readFileSync(join(srcDir, rel));
    const destFile = join(destDir, rel);
    const prev = existsSync(destFile) ? readFileSync(destFile) : null;
    if (prev === null || !prev.equals(next)) {
      mkdirSync(dirname(destFile), { recursive: true });
      writeFileSync(destFile, next);
    }
  }

  return { fileCount: files.length };
}

/**
 * Pull the skills named in .skillfoo.yml out of the registry and mirror each
 * skill's whole directory into this repo's emit dir. Reports what changed.
 */
export async function sync(cwd, { force = false } = {}) {
  const cfg = loadConfig(cwd);

  const registryDir = resolveRegistry(cfg.registry, cwd);
  if (!existsSync(registryDir)) {
    throw new Error(`registry not found: ${registryDir} (registry: ${cfg.registry})`);
  }

  const available = listRegistrySkills(registryDir);
  const wanted = cfg.skills ?? available;

  const missing = wanted.filter((name) => !available.includes(name));
  if (missing.length) {
    throw new Error(
      `not in the registry: ${missing.join(', ')}\n` +
        `available: ${available.join(', ') || '(none)'}`,
    );
  }

  const emitRoot = resolve(cwd, cfg.emit);
  const lock = readLock(cwd);
  const newLock = { lockfileVersion: 1, skills: {} };
  const managed = [];
  const mark = { added: '+', updated: '~', unchanged: '=', drifted: '!', blocked: '⊘' };
  const tally = { added: 0, updated: 0, unchanged: 0, drifted: 0, blocked: 0 };

  for (const name of wanted) {
    const srcDir = join(registryDir, name);
    const destDir = join(emitRoot, name);
    const registryHash = hashSkillDir(srcDir);
    const lockHash = lock.skills[name]?.hash;
    const destExists = existsSync(destDir) && walkFiles(destDir).length > 0;
    const destHash = destExists ? hashSkillDir(destDir) : null;
    const fileCount = walkFiles(srcDir).length;

    let status;
    let nextHash;
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
      newLock.skills[name] = { source: cfg.registry, hash: nextHash };
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

  const n = managed.length;
  console.log(`\nsynced ${n} skill${n === 1 ? '' : 's'} from ${cfg.registry} → ${cfg.emit}`);
  let summary = `${tally.added} added · ${tally.updated} updated · ${tally.unchanged} unchanged`;
  if (tally.drifted) summary += ` · ${tally.drifted} drifted`;
  if (tally.blocked) summary += ` · ${tally.blocked} blocked`;
  console.log(summary);

  if (n) {
    updateAgentsMd(cwd, cfg.emit, managed);
    linkClaudeAdapter(cwd, cfg.emit, managed);
    console.log(`updated AGENTS.md · linked .claude/skills/ → ${cfg.emit}/ (Claude adapter)`);
  }
}
