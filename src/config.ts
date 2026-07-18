import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import {
  isAbsolute,
  join,
  normalize,
  posix,
  relative,
  resolve,
  sep,
  win32,
} from 'node:path';
import { parse, stringify } from 'yaml';
import { normalizeDesiredNames } from './skill-name.js';

export const CONFIG_NAME = '.skillfoo.yml';
export const DEFAULT_EMIT = '.agents/skills';

export interface SkillfooConfig {
  registry: string;
  emit: string;
  skills: string[] | null;
}

export interface NewSkillfooConfig {
  registry: string;
  emit?: string;
  skills: readonly string[] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function isExistingConfig(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EEXIST'
  );
}

function existingConfigError(dir: string): Error {
  return new Error(
    `${CONFIG_NAME} already exists in ${dir}; use skillfoo status or skillfoo sync instead`,
  );
}

export function assertConfigAbsent(dir: string): void {
  try {
    lstatSync(join(dir, CONFIG_NAME));
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  throw existingConfigError(dir);
}

/**
 * Validate the repository-relative emit root without following an existing
 * path component that could redirect reconciliation outside the consumer.
 */
export function validateEmitPath(dir: string, emit: string): string {
  if (emit.length === 0) {
    throw new Error(`${CONFIG_NAME} "emit:" must be a non-empty relative path`);
  }
  if (posix.isAbsolute(emit) || win32.isAbsolute(emit) || win32.parse(emit).root.length > 0) {
    throw new Error(`${CONFIG_NAME} "emit:" must be a relative path inside the project`);
  }

  const normalized = normalize(emit);
  const posixNormalized = posix.normalize(emit);
  const windowsNormalized = win32.normalize(emit);
  if (
    normalized === '..' ||
    normalized.startsWith(`..${sep}`) ||
    posixNormalized === '..' ||
    posixNormalized.startsWith('../') ||
    windowsNormalized === '..' ||
    windowsNormalized.startsWith('..\\')
  ) {
    throw new Error(`${CONFIG_NAME} "emit:" must not escape the project`);
  }

  const consumerRoot = resolve(dir);
  const emitRoot = resolve(consumerRoot, emit);
  const contained = relative(consumerRoot, emitRoot);
  if (contained === '..' || contained.startsWith(`..${sep}`) || isAbsolute(contained)) {
    throw new Error(`${CONFIG_NAME} "emit:" must not escape the project`);
  }

  if (contained.length === 0) return emitRoot;

  let ancestor = consumerRoot;
  for (const segment of contained.split(sep)) {
    ancestor = join(ancestor, segment);
    try {
      const stat = lstatSync(ancestor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(
          `${CONFIG_NAME} "emit:" has an unsafe existing ancestor: ${relative(consumerRoot, ancestor)}`,
        );
      }
    } catch (error) {
      if (isMissing(error)) break;
      throw error;
    }
  }

  return emitRoot;
}

export function renderConfig(config: NewSkillfooConfig): string {
  if (config.registry.length === 0) {
    throw new Error(`${CONFIG_NAME} "registry:" must be a non-empty registry source`);
  }

  const emit = config.emit ?? DEFAULT_EMIT;
  const skills = config.skills === null ? null : normalizeDesiredNames(config.skills);
  return stringify({
    registry: config.registry,
    ...(emit === DEFAULT_EMIT ? {} : { emit }),
    ...(skills === null ? {} : { skills }),
  });
}

export function createConfigExclusive(dir: string, config: NewSkillfooConfig): string {
  const emit = config.emit ?? DEFAULT_EMIT;
  validateEmitPath(dir, emit);
  const contents = renderConfig({ ...config, emit });
  const path = join(dir, CONFIG_NAME);
  try {
    writeFileSync(path, contents, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (isExistingConfig(error)) throw existingConfigError(dir);
    throw error;
  }
  return path;
}

export function loadConfig(dir: string): SkillfooConfig {
  const path = join(dir, CONFIG_NAME);
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch (error) {
    if (isMissing(error)) {
      throw new Error(`no ${CONFIG_NAME} in ${dir} — add one pointing at your skills registry`);
    }
    throw error;
  }

  const parsed: unknown = parse(contents);
  const cfg = isRecord(parsed) ? parsed : {};

  if (typeof cfg.registry !== 'string' || !cfg.registry) {
    throw new Error(`${CONFIG_NAME} is missing "registry:" (path to your skills repo)`);
  }

  if (
    cfg.skills != null &&
    (!Array.isArray(cfg.skills) || !cfg.skills.every((skill) => typeof skill === 'string'))
  ) {
    throw new Error(`${CONFIG_NAME} "skills:" must be a list of names, or omit it to sync everything`);
  }

  if (cfg.emit !== undefined && typeof cfg.emit !== 'string') {
    throw new Error(`${CONFIG_NAME} "emit:" must be a path`);
  }

  const emit = typeof cfg.emit === 'string' ? cfg.emit : DEFAULT_EMIT;
  validateEmitPath(dir, emit);

  return {
    registry: cfg.registry,
    emit,
    skills: Array.isArray(cfg.skills) ? cfg.skills : null,
  };
}
