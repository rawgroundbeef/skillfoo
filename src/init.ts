import {
  assertConfigAbsent,
  CONFIG_NAME,
  createConfigExclusive,
  DEFAULT_EMIT,
  validateEmitPath,
} from './config.js';
import {
  resolveRegistryCatalog,
  type RegistryCatalog,
  type RegistryOptions,
} from './registry.js';
import { normalizeDesiredNames } from './skill-name.js';
import { sync, type SyncResult } from './sync.js';

export type InitSelection =
  | { kind: 'all' }
  | { kind: 'named'; names: readonly string[] };

export type InitSelectionProvider = (
  available: readonly string[],
) => InitSelection | Promise<InitSelection>;

export interface InitRequest {
  registry: string;
  emit?: string;
  selection: InitSelection | InitSelectionProvider;
}

export interface InitOptions extends RegistryOptions {
  output?: (message: string) => void;
}

export interface InitResult {
  configPath: string;
  catalog: RegistryCatalog;
  selection: InitSelection;
  reconciliation: SyncResult;
}

export class InitReconciliationError extends Error {
  readonly configPath: string;

  constructor(configPath: string, cause: unknown) {
    super(
      `created ${CONFIG_NAME}, but first reconciliation failed: ${errorMessage(cause)}`,
      { cause },
    );
    this.name = 'InitReconciliationError';
    this.configPath = configPath;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateSelection(
  selection: InitSelection,
  available: readonly string[],
): InitSelection {
  if (selection.kind === 'all') {
    // Dynamic all makes every catalog entry desired, so validate every name now.
    normalizeDesiredNames(available);
    return selection;
  }

  if (selection.names.length === 0) {
    throw new Error('choose at least one skill with --skill, or use --all');
  }
  const names = normalizeDesiredNames(selection.names);
  const missing = names.filter((name) => !available.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `not in the registry: ${missing.join(', ')}\n` +
        `available: ${available.join(', ') || '(none)'}`,
    );
  }
  return { kind: 'named', names };
}

export async function initializeProject(
  cwd: string,
  request: InitRequest,
  options: InitOptions = {},
): Promise<InitResult> {
  assertConfigAbsent(cwd);

  if (request.registry.length === 0) {
    throw new Error('registry must be a non-empty source');
  }
  const emit = request.emit ?? DEFAULT_EMIT;
  validateEmitPath(cwd, emit);

  let staticSelection = request.selection;
  if (typeof staticSelection !== 'function' && staticSelection.kind === 'named') {
    if (staticSelection.names.length === 0) {
      throw new Error('choose at least one skill with --skill, or use --all');
    }
    staticSelection = {
      kind: 'named',
      names: normalizeDesiredNames(staticSelection.names),
    };
  }

  const registryOptions = {
    ...(options.reporter === undefined ? {} : { reporter: options.reporter }),
    ...(options.cacheRoot === undefined ? {} : { cacheRoot: options.cacheRoot }),
  };
  const catalog = resolveRegistryCatalog(request.registry, cwd, registryOptions);
  const requestedSelection =
    typeof staticSelection === 'function'
      ? await staticSelection(catalog.skills)
      : staticSelection;
  const selection = validateSelection(requestedSelection, catalog.skills);

  const configPath = createConfigExclusive(cwd, {
    registry: request.registry,
    emit,
    skills: selection.kind === 'all' ? null : selection.names,
  });

  try {
    const reconciliation = await sync(cwd, {
      registryCatalog: catalog,
      ...(options.output === undefined ? {} : { output: options.output }),
    });
    return { configPath, catalog, selection, reconciliation };
  } catch (error) {
    throw new InitReconciliationError(configPath, error);
  }
}
