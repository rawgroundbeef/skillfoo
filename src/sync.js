import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { loadConfig } from './config.js';
import { resolveRegistry } from './registry.js';
import { updateAgentsMd, linkClaudeAdapter } from './emit.js';

const SKIP = new Set(['.git', '.DS_Store']);

// A skill is any top-level directory in the registry that holds a SKILL.md.
function listRegistrySkills(registryDir) {
  return readdirSync(registryDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .filter((name) => existsSync(join(registryDir, name, 'SKILL.md')));
}

// Every file under a skill dir, as paths relative to that dir (recursive).
function walkFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, base));
    else if (entry.isFile()) out.push(relative(base, full));
  }
  return out;
}

// Mirror a whole skill directory into the consumer. Byte-compare so any file
// type (scripts, references) is handled and unchanged files aren't rewritten.
function syncSkillDir(srcDir, destDir) {
  const files = walkFiles(srcDir);
  const existedBefore = existsSync(destDir);
  let changed = false;

  for (const rel of files) {
    const next = readFileSync(join(srcDir, rel));
    const destFile = join(destDir, rel);
    const prev = existsSync(destFile) ? readFileSync(destFile) : null;
    if (prev === null || !prev.equals(next)) {
      mkdirSync(dirname(destFile), { recursive: true });
      writeFileSync(destFile, next);
      changed = true;
    }
  }

  const status = !existedBefore ? 'added' : changed ? 'updated' : 'unchanged';
  return { status, fileCount: files.length };
}

/**
 * Pull the skills named in .skillfoo.yml out of the registry and mirror each
 * skill's whole directory into this repo's emit dir. Reports what changed.
 */
export async function sync(cwd) {
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
  const mark = { added: '+', updated: '~', unchanged: '=' };
  const tally = { added: 0, updated: 0, unchanged: 0 };

  for (const name of wanted) {
    const { status, fileCount } = syncSkillDir(
      join(registryDir, name),
      join(emitRoot, name),
    );
    tally[status]++;
    const files = fileCount > 1 ? ` (${fileCount} files)` : '';
    console.log(`  ${mark[status]} ${name}${files}`);
  }

  const n = wanted.length;
  console.log(`\nsynced ${n} skill${n === 1 ? '' : 's'} from ${cfg.registry} → ${cfg.emit}`);
  console.log(`${tally.added} added · ${tally.updated} updated · ${tally.unchanged} unchanged`);

  if (n) {
    updateAgentsMd(cwd, cfg.emit, wanted);
    linkClaudeAdapter(cwd, cfg.emit, wanted);
    console.log(`updated AGENTS.md · linked .claude/skills/ → ${cfg.emit}/ (Claude adapter)`);
  }
}
