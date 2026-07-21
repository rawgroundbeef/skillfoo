import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  REGISTRY_DIAGNOSTICS,
  isExplicitLocalRegistryPath,
  isRemoteRegistrySource,
  normalizeRegistryCloneUrl,
  registryFailure,
  validateRegistrySource,
} from './registry-source.js';

export function isGitRegistry(spec: string): boolean {
  return isRemoteRegistrySource(spec);
}

export function normalizeCloneUrl(spec: string): string {
  return normalizeRegistryCloneUrl(spec);
}

export function cacheDirFor(url: string, cacheRoot: string): string {
  const digest = createHash('sha256').update(url, 'utf8').digest('hex');
  return join(cacheRoot, digest);
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function freshClone(url: string, dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dirname(dir), { recursive: true });
  git(['clone', '--depth', '1', url, dir], dirname(dir));
}

function cachedOriginMatches(dir: string, url: string): boolean {
  try {
    const output = git(['remote', 'get-url', 'origin'], dir).replace(/\r?\n$/u, '');
    return normalizeCloneUrl(output) === url;
  } catch {
    return false;
  }
}

function cloneAndVerify(url: string, dir: string): void {
  freshClone(url, dir);
  if (!cachedOriginMatches(dir, url)) throw registryFailure(REGISTRY_DIAGNOSTICS.fetchFailure);
}

export interface RegistryOptions {
  reporter?: (message: string) => void;
  cacheRoot?: string;
}

export interface RegistryCatalog {
  spec: string;
  directory: string;
  skills: readonly string[];
}

export function resolveRegistry(spec: string, cwd: string, options: RegistryOptions = {}): string {
  validateRegistrySource(spec);
  if (isExplicitLocalRegistryPath(spec) || !isGitRegistry(spec)) return resolve(cwd, spec);

  const url = normalizeCloneUrl(spec);
  const cacheRoot = options.cacheRoot ?? join(homedir(), '.skillfoo', 'registries');
  const dir = cacheDirFor(url, cacheRoot);
  const report = options.reporter ?? ((message: string) => console.error(message));

  if (!existsSync(dir)) {
    report(REGISTRY_DIAGNOSTICS.cloning);
    try {
      cloneAndVerify(url, dir);
    } catch {
      throw registryFailure(REGISTRY_DIAGNOSTICS.fetchFailure);
    }
    return dir;
  }

  if (!existsSync(join(dir, '.git')) || !cachedOriginMatches(dir, url)) {
    report(REGISTRY_DIAGNOSTICS.recloning);
    try {
      cloneAndVerify(url, dir);
    } catch {
      throw registryFailure(REGISTRY_DIAGNOSTICS.fetchFailure);
    }
    return dir;
  }

  report(REGISTRY_DIAGNOSTICS.updating);
  try {
      git(['fetch', '--depth', '1', 'origin'], dir);
      git(['reset', '--hard', '@{upstream}'], dir);
  } catch {
    report(REGISTRY_DIAGNOSTICS.recloning);
    try {
      cloneAndVerify(url, dir);
    } catch {
      throw registryFailure(REGISTRY_DIAGNOSTICS.fetchFailure);
    }
  }

  return dir;
}

export function listRegistrySkills(registryDir: string): string[] {
  return readdirSync(registryDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(registryDir, name, 'SKILL.md')))
    .sort();
}

export function resolveRegistryCatalog(
  spec: string,
  cwd: string,
  options: RegistryOptions = {},
): RegistryCatalog {
  const directory = resolveRegistry(spec, cwd, options);
  if (!existsSync(directory)) {
    throw registryFailure(REGISTRY_DIAGNOSTICS.localMissing);
  }
  let skills: string[];
  try {
    skills = listRegistrySkills(directory);
  } catch {
    throw registryFailure(
      isGitRegistry(spec) && !isExplicitLocalRegistryPath(spec)
        ? REGISTRY_DIAGNOSTICS.fetchFailure
        : REGISTRY_DIAGNOSTICS.localMissing,
    );
  }
  return {
    spec,
    directory,
    skills,
  };
}
