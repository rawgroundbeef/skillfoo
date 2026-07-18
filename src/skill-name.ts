import { dirname, normalize, posix, resolve, win32 } from 'node:path';

export function isSafeSkillName(name: string): boolean {
  if (
    name.length === 0 ||
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes(':') ||
    /[<>"|?*]/.test(name) ||
    /[\u0000-\u001f\u007f]/.test(name) ||
    /[. ]$/.test(name)
  ) {
    return false;
  }

  if (posix.basename(name) !== name || win32.basename(name) !== name) return false;

  const windowsStem = name.split('.')[0]?.trimEnd().toUpperCase();
  return !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(windowsStem ?? '');
}

export function assertSafeSkillName(name: string, source: 'desired' | 'lock'): void {
  if (isSafeSkillName(name)) return;

  const prefix = source === 'lock' ? '.skillfoo.lock is corrupt: unsafe managed' : 'unsafe desired';
  throw new Error(`${prefix} skill name ${JSON.stringify(name)}; expected one path segment`);
}

export function directChild(root: string, name: string): string {
  const normalizedRoot = normalize(resolve(root));
  const candidate = normalize(resolve(normalizedRoot, name));
  if (dirname(candidate) !== normalizedRoot) {
    throw new Error(`unsafe skill path for ${JSON.stringify(name)}; expected one path segment`);
  }
  return candidate;
}

export function normalizeDesiredNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const name of names) {
    assertSafeSkillName(name, 'desired');
    if (!seen.has(name)) {
      seen.add(name);
      normalized.push(name);
    }
  }
  return normalized;
}
