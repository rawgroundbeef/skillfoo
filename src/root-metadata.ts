import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import type { Stats } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';

export interface FileIdentity {
  device: number;
  inode: number;
  mode: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
}

export interface RootMetadataSnapshot {
  path: string;
  label: string;
  contents: Buffer | null;
  mode: number | null;
  identity: FileIdentity | null;
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function identity(stat: Stats): FileIdentity {
  return {
    device: stat.dev,
    inode: stat.ino,
    mode: stat.mode,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  };
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

export function inspectRootMetadata(
  path: string,
  label: string,
  required: boolean,
): RootMetadataSnapshot {
  let before;
  try {
    before = lstatSync(path);
  } catch (error) {
    if (isMissing(error) && !required) {
      return { path, label, contents: null, mode: null, identity: null };
    }
    if (isMissing(error)) throw new Error(`${label} must be an existing real regular file`);
    throw error;
  }
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error(`${label} is unsafe; expected a real regular file`);
  }

  const noFollow =
    process.platform !== 'win32' && 'O_NOFOLLOW' in constants ? constants.O_NOFOLLOW : 0;
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | noFollow);
  } catch (error) {
    throw new Error(`${label} could not be opened safely: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || !sameIdentity(identity(before), identity(opened))) {
      throw new Error(`${label} changed while it was being inspected`);
    }
    const contents = readFileSync(descriptor);
    const after = lstatSync(path);
    if (!sameIdentity(identity(opened), identity(after))) {
      throw new Error(`${label} changed while it was being inspected`);
    }
    return {
      path,
      label,
      contents,
      mode: opened.mode & 0o7777,
      identity: identity(opened),
    };
  } finally {
    closeSync(descriptor);
  }
}

export function metadataMatches(
  left: RootMetadataSnapshot,
  right: RootMetadataSnapshot,
): boolean {
  if (left.contents === null || right.contents === null) return left.contents === right.contents;
  return (
    left.identity !== null &&
    right.identity !== null &&
    sameIdentity(left.identity, right.identity) &&
    left.contents.equals(right.contents)
  );
}

export function assertMetadataUnchanged(expected: RootMetadataSnapshot): void {
  const current = inspectRootMetadata(
    expected.path,
    expected.label,
    expected.contents !== null,
  );
  if (!metadataMatches(current, expected)) {
    throw new Error(`stale ${expected.label} evidence; the file changed`);
  }
}

function stagedPath(path: string): string {
  return join(dirname(path), `.${basename(path)}.skillfoo-${randomUUID()}.tmp`);
}

export function atomicReplaceRootMetadata(
  expected: RootMetadataSnapshot,
  contents: Buffer,
): RootMetadataSnapshot {
  if (expected.contents !== null && expected.contents.equals(contents)) return expected;

  const temporary = stagedPath(expected.path);
  try {
    writeFileSync(temporary, contents, {
      flag: 'wx',
      mode: expected.mode ?? 0o666,
    });
    if (expected.mode !== null) chmodSync(temporary, expected.mode);
    assertMetadataUnchanged(expected);

    if (expected.contents === null) {
      linkSync(temporary, expected.path);
      unlinkSync(temporary);
    } else {
      renameSync(temporary, expected.path);
    }
    return inspectRootMetadata(expected.path, expected.label, true);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch (cleanupError) {
      if (!isMissing(cleanupError)) {
        throw new Error(
          `${errorMessage(error)}; temporary metadata cleanup also failed: ${errorMessage(cleanupError)}`,
          { cause: error },
        );
      }
    }
    throw error;
  }
}

export function restoreRootMetadata(
  before: RootMetadataSnapshot,
  after: RootMetadataSnapshot,
): void {
  const current = inspectRootMetadata(after.path, after.label, true);
  if (!metadataMatches(current, after)) {
    throw new Error(`${after.label} changed while rollback was in progress`);
  }
  if (before.contents === null) {
    unlinkSync(after.path);
    return;
  }
  atomicReplaceRootMetadata(current, before.contents);
  if (before.mode !== null) chmodSync(before.path, before.mode);
}
