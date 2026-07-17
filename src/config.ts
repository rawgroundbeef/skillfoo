import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export const CONFIG_NAME = '.skillfoo.yml';

export interface SkillfooConfig {
  registry: string;
  emit: string;
  skills: string[] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadConfig(dir: string): SkillfooConfig {
  const path = join(dir, CONFIG_NAME);
  if (!existsSync(path)) {
    throw new Error(`no ${CONFIG_NAME} in ${dir} — add one pointing at your skills registry`);
  }

  const parsed: unknown = parse(readFileSync(path, 'utf8'));
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

  if (cfg.emit != null && typeof cfg.emit !== 'string') {
    throw new Error(`${CONFIG_NAME} "emit:" must be a path`);
  }

  return {
    registry: cfg.registry,
    emit: cfg.emit || '.agents/skills',
    skills: Array.isArray(cfg.skills) ? cfg.skills : null,
  };
}
