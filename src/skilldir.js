import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const SKIP = new Set(['.git', '.DS_Store']);

// Every file under a skill dir, as paths relative to that dir (recursive).
export function walkFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, base));
    else if (entry.isFile()) out.push(relative(base, full));
  }
  return out;
}

export function hashSkillDir(dir) {
  const files = walkFiles(dir)
    .map((rel) => rel.split(sep).join('/'))
    .sort();

  const manifest = files
    .map((rel) => {
      const fileHash = createHash('sha256')
        .update(readFileSync(join(dir, rel)))
        .digest('hex');
      return `${rel}\n${fileHash}`;
    })
    .join('\n');

  return `sha256:${createHash('sha256').update(manifest).digest('hex')}`;
}
