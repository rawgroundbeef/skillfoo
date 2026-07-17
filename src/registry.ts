import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const GIT_PREFIXES = [
  'http://',
  'https://',
  'git@',
  'ssh://',
  'github.com/',
  'gitlab.com/',
  'bitbucket.org/',
];

export function isGitRegistry(spec: string): boolean {
  return GIT_PREFIXES.some((prefix) => spec.startsWith(prefix)) || spec.endsWith('.git');
}

function toCloneUrl(spec: string): string {
  if (/^(https?:\/\/|git@|ssh:\/\/)/.test(spec)) return spec;
  return `https://${spec.replace(/\.git$/, '')}.git`;
}

function cacheDirFor(url: string): string {
  const slug = url
    .replace(/^\w+:\/\//, '')
    .replace(/^git@/, '')
    .replace(/[:]/g, '-')
    .replace(/\.git$/, '')
    .replace(/[^\w.-]+/g, '-');
  return join(homedir(), '.skillfoo', 'registries', slug);
}

function git(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
}

function freshClone(url: string, dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dirname(dir), { recursive: true });
  git(['clone', '--depth', '1', url, dir], dirname(dir));
}

function registryErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'stderr' in error) {
    const stderr = error.stderr;
    if (Buffer.isBuffer(stderr)) return stderr.toString().trim();
    if (stderr != null) return String(stderr).trim();
  }
  return error instanceof Error ? error.message : String(error);
}

export function resolveRegistry(spec: string, cwd: string): string {
  if (!isGitRegistry(spec)) return resolve(cwd, spec);

  const url = toCloneUrl(spec);
  const dir = cacheDirFor(url);

  try {
    if (existsSync(join(dir, '.git'))) {
      console.log(`  updating registry ${url}`);
      git(['fetch', '--depth', '1', 'origin'], dir);
      git(['reset', '--hard', '@{upstream}'], dir);
    } else {
      console.log(`  cloning registry ${url}`);
      freshClone(url, dir);
    }
  } catch {
    try {
      console.log(`  re-cloning registry ${url}`);
      freshClone(url, dir);
    } catch (error) {
      throw new Error(`could not fetch registry ${url}: ${registryErrorMessage(error)}`);
    }
  }

  return dir;
}
