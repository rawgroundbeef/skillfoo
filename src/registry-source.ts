import { posix, win32 } from 'node:path';

export const REGISTRY_DIAGNOSTICS = {
  unsafeComponents:
    'skillfoo: registry source contains unsupported credentials or URL components; use out-of-band Git authentication',
  unsafeControls: 'skillfoo: registry source contains unsupported control characters',
  cloning: 'skillfoo: cloning configured Git registry',
  updating: 'skillfoo: updating configured Git registry',
  recloning: 'skillfoo: re-cloning configured Git registry',
  fetchFailure:
    'skillfoo: could not fetch configured Git registry; verify .skillfoo.yml and out-of-band Git authentication',
  localMissing:
    'skillfoo: configured local registry not found; verify .skillfoo.yml and filesystem access',
} as const;

export type RegistryDiagnostic =
  (typeof REGISTRY_DIAGNOSTICS)[keyof typeof REGISTRY_DIAGNOSTICS];

const CLI_PREFIX = 'skillfoo: ';
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const URL_SOURCE = /^([a-z][a-z\d+.-]*):\/\//iu;
const HOSTED_SHORTHAND = /^(github\.com|gitlab\.com|bitbucket\.org)(?:\/|[?#])/iu;
const SCP_STYLE_SSH = /^git@(\[[^\]]+\]|[^/:?#\s]+):(.+)$/iu;

interface RemoteRegistrySource {
  cloneUrl: string;
  validationUrl: string;
}

function sourceError(message: RegistryDiagnostic): Error {
  return new Error(message.slice(CLI_PREFIX.length));
}

function authority(spec: string): string {
  const start = spec.indexOf('//') + 2;
  const end = spec.slice(start).search(/[/?#]/u);
  return end === -1 ? spec.slice(start) : spec.slice(start, start + end);
}

function hasComponentMarker(spec: string, marker: '?' | '#'): boolean {
  const start = spec.indexOf('//') + 2;
  return spec.indexOf(marker, start) !== -1;
}

export function isExplicitLocalRegistryPath(spec: string): boolean {
  return (
    spec === '.' ||
    spec === '..' ||
    spec.startsWith('./') ||
    spec.startsWith('../') ||
    spec.startsWith('.\\') ||
    spec.startsWith('..\\') ||
    posix.isAbsolute(spec) ||
    win32.isAbsolute(spec)
  );
}

function expandHttpsShorthand(spec: string): string {
  const componentStart = spec.search(/[?#]/u);
  const path = componentStart === -1 ? spec : spec.slice(0, componentStart);
  const components = componentStart === -1 ? '' : spec.slice(componentStart);
  return `https://${path.replace(/\.git$/u, '')}.git${components}`;
}

function isGenericGitShorthand(spec: string): boolean {
  const componentStart = spec.search(/[?#]/u);
  const path = componentStart === -1 ? spec : spec.slice(0, componentStart);
  return path.endsWith('.git') || spec.endsWith('.git');
}

function remoteRegistrySource(spec: string): RemoteRegistrySource | null {
  if (isExplicitLocalRegistryPath(spec)) return null;
  if (URL_SOURCE.test(spec)) return { cloneUrl: spec, validationUrl: spec };
  if (spec.toLowerCase().startsWith('git@')) {
    const match = SCP_STYLE_SSH.exec(spec);
    if (match === null) throw sourceError(REGISTRY_DIAGNOSTICS.unsafeComponents);
    return {
      cloneUrl: spec,
      validationUrl: `ssh://git@${match[1]}/${match[2]}`,
    };
  }
  if (HOSTED_SHORTHAND.test(spec) || isGenericGitShorthand(spec)) {
    const cloneUrl = expandHttpsShorthand(spec);
    return { cloneUrl, validationUrl: cloneUrl };
  }
  return null;
}

function validateRemoteSource(source: RemoteRegistrySource): void {
  const match = URL_SOURCE.exec(source.validationUrl);
  if (match === null) throw sourceError(REGISTRY_DIAGNOSTICS.unsafeComponents);

  const scheme = match[1]?.toLowerCase();
  if (scheme !== 'http' && scheme !== 'https' && scheme !== 'file' && scheme !== 'ssh') {
    throw sourceError(REGISTRY_DIAGNOSTICS.unsafeComponents);
  }

  let parsed: URL;
  try {
    parsed = new URL(source.validationUrl);
  } catch {
    throw sourceError(REGISTRY_DIAGNOSTICS.unsafeComponents);
  }

  const rawAuthority = authority(source.validationUrl);
  const userInfoEnd = rawAuthority.lastIndexOf('@');
  const rawUserInfo = userInfoEnd === -1 ? '' : rawAuthority.slice(0, userInfoEnd);
  const hasQueryOrFragment =
    hasComponentMarker(source.validationUrl, '?') ||
    hasComponentMarker(source.validationUrl, '#');

  const hasForbiddenAuthentication =
    scheme === 'ssh'
      ? parsed.password.length > 0 || (userInfoEnd !== -1 && rawUserInfo.includes(':'))
      : userInfoEnd !== -1 || parsed.username.length > 0 || parsed.password.length > 0;

  if (hasForbiddenAuthentication || hasQueryOrFragment) {
    throw sourceError(REGISTRY_DIAGNOSTICS.unsafeComponents);
  }
}

/**
 * Reject registry values that could disclose secrets or inject terminal data
 * before the value is rendered, accessed, cached, or written to config.
 */
export function validateRegistrySource(spec: string): string {
  if (CONTROL_CHARACTERS.test(spec)) {
    throw sourceError(REGISTRY_DIAGNOSTICS.unsafeControls);
  }

  const source = remoteRegistrySource(spec);
  if (source !== null) validateRemoteSource(source);

  return spec;
}

export function isRemoteRegistrySource(spec: string): boolean {
  return remoteRegistrySource(spec) !== null;
}

export function normalizeRegistryCloneUrl(spec: string): string {
  validateRegistrySource(spec);
  const source = remoteRegistrySource(spec);
  if (source === null) throw sourceError(REGISTRY_DIAGNOSTICS.unsafeComponents);
  return source.cloneUrl;
}

export function registryFailure(message: RegistryDiagnostic): Error {
  return sourceError(message);
}
