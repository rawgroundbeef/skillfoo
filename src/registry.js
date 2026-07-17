import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

const GIT_PREFIXES = ['http://', 'https://', 'git@', 'ssh://', 'github.com/', 'gitlab.com/', 'bitbucket.org/'];

// A registry spec is a git registry if it looks like a URL or host/owner/repo,
// otherwise it's treated as a local path (resolved relative to the consumer).
export function isGitRegistry(spec) {
  return GIT_PREFIXES.some((p) => spec.startsWith(p)) || spec.endsWith('.git');
}

function toCloneUrl(spec) {
  if (/^(https?:\/\/|git@|ssh:\/\/)/.test(spec)) return spec;
  // bare host/owner/repo, e.g. github.com/owner/repo
  return 'https://' + spec.replace(/\.git$/, '') + '.git';
}

function cacheDirFor(url) {
  const slug = url
    .replace(/^\w+:\/\//, '')
    .replace(/^git@/, '')
    .replace(/[:]/g, '-')
    .replace(/\.git$/, '')
    .replace(/[^\w.-]+/g, '-');
  return join(homedir(), '.skillfoo', 'registries', slug);
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
}

function freshClone(url, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dirname(dir), { recursive: true });
  git(['clone', '--depth', '1', url, dir]);
}

/**
 * Resolve a registry spec to a local directory of skills.
 * Local path -> returned as-is. Git URL -> cloned/updated in a cache under ~/.skillfoo.
 */
export function resolveRegistry(spec, cwd) {
  if (!isGitRegistry(spec)) {
    return resolve(cwd, spec);
  }

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
    // Any git hiccup (shallow history, missing upstream, corruption) -> clean clone.
    try {
      console.log(`  re-cloning registry ${url}`);
      freshClone(url, dir);
    } catch (err) {
      throw new Error(`could not fetch registry ${url}: ${String(err.stderr || err.message).trim()}`);
    }
  }

  return dir;
}
