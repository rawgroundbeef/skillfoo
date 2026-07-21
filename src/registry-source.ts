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

/**
 * Reject registry values that could disclose secrets or inject terminal data
 * before the value is rendered, accessed, cached, or written to config.
 */
export function validateRegistrySource(spec: string): string {
  if (CONTROL_CHARACTERS.test(spec)) {
    throw sourceError(REGISTRY_DIAGNOSTICS.unsafeControls);
  }

  const match = URL_SOURCE.exec(spec);
  if (match === null) return spec;

  const scheme = match[1]?.toLowerCase();
  if (scheme !== 'http' && scheme !== 'https' && scheme !== 'file' && scheme !== 'ssh') {
    return spec;
  }

  let parsed: URL;
  try {
    parsed = new URL(spec);
  } catch {
    throw sourceError(REGISTRY_DIAGNOSTICS.unsafeComponents);
  }

  const rawAuthority = authority(spec);
  const userInfoEnd = rawAuthority.lastIndexOf('@');
  const rawUserInfo = userInfoEnd === -1 ? '' : rawAuthority.slice(0, userInfoEnd);
  const hasQueryOrFragment = hasComponentMarker(spec, '?') || hasComponentMarker(spec, '#');

  const hasForbiddenAuthentication =
    scheme === 'ssh'
      ? parsed.password.length > 0 || (userInfoEnd !== -1 && rawUserInfo.includes(':'))
      : userInfoEnd !== -1 || parsed.username.length > 0 || parsed.password.length > 0;

  if (hasForbiddenAuthentication || hasQueryOrFragment) {
    throw sourceError(REGISTRY_DIAGNOSTICS.unsafeComponents);
  }

  return spec;
}

export function registryFailure(message: RegistryDiagnostic): Error {
  return sourceError(message);
}
