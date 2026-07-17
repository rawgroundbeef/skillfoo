import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export const CONFIG_NAME = '.skillfoo.yml';

/**
 * Load and validate a repo's .skillfoo.yml.
 * @returns {{ registry: string, emit: string, skills: string[] | null }}
 *   skills === null means "sync everything in the registry".
 */
export function loadConfig(dir) {
  const path = join(dir, CONFIG_NAME);
  if (!existsSync(path)) {
    throw new Error(`no ${CONFIG_NAME} in ${dir} — add one pointing at your skills registry`);
  }

  const cfg = parse(readFileSync(path, 'utf8')) || {};

  if (!cfg.registry) {
    throw new Error(`${CONFIG_NAME} is missing "registry:" (path to your skills repo)`);
  }
  if (cfg.skills != null && !Array.isArray(cfg.skills)) {
    throw new Error(`${CONFIG_NAME} "skills:" must be a list, or omit it to sync everything`);
  }

  return {
    registry: cfg.registry,
    emit: cfg.emit || '.agents/skills',
    skills: Array.isArray(cfg.skills) ? cfg.skills : null,
  };
}
