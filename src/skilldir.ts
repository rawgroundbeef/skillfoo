import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const SKIP = new Set(['.git', '.DS_Store']);

export function walkFiles(dir: string, base = dir): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full, base));
    else if (entry.isFile()) files.push(relative(base, full));
  }
  return files;
}

export function hashSkillDir(dir: string): string {
  const files = walkFiles(dir)
    .map((path) => path.split(sep).join('/'))
    .sort();

  const manifest = files
    .map((path) => {
      const fileHash = createHash('sha256').update(readFileSync(join(dir, path))).digest('hex');
      return `${path}\n${fileHash}`;
    })
    .join('\n');

  return `sha256:${createHash('sha256').update(manifest).digest('hex')}`;
}
