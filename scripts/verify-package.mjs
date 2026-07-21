#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGE_NAME = 'skillfoo';
const PACKAGE_VERSION = '1.0.0';
const INTENDED_TAG = 'v1.0.0';
const ENGINES = '^22.0.0 || ^24.0.0';
const REPOSITORY_URL = 'git+https://github.com/rawgroundbeef/skillfoo.git';
const HOMEPAGE = 'https://github.com/rawgroundbeef/skillfoo#readme';
const BUGS_URL = 'https://github.com/rawgroundbeef/skillfoo/issues';
const REGISTRY = 'https://registry.npmjs.org/';

const REGISTRY_LINES = [
  'skillfoo: registry source contains unsupported credentials or URL components; use out-of-band Git authentication',
  'skillfoo: registry source contains unsupported control characters',
  'skillfoo: cloning configured Git registry',
  'skillfoo: updating configured Git registry',
  'skillfoo: re-cloning configured Git registry',
  'skillfoo: could not fetch configured Git registry; verify .skillfoo.yml and out-of-band Git authentication',
  'skillfoo: configured local registry not found; verify .skillfoo.yml and filesystem access',
];

const RUNTIME_FILES = [
  'adapter.js',
  'cli.js',
  'config.js',
  'emit.js',
  'entrypoint.js',
  'init.js',
  'lockfile.js',
  'plan.js',
  'registry-source.js',
  'registry.js',
  'removal.js',
  'resolve.js',
  'root-metadata.js',
  'skill-name.js',
  'skilldir.js',
  'status.js',
  'sync.js',
];

const EXPECTED_PACKAGE_FILES = [
  'LICENSE',
  'README.md',
  ...RUNTIME_FILES.map((name) => `dist/${name}`),
  'package.json',
].sort();

const gitCommand = process.platform === 'win32' ? 'git.exe' : 'git';
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  throw new Error(message);
}

function parseArguments(argv) {
  let tarball;
  let manifest;
  let checkManifest;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--tarball' && value !== undefined) {
      tarball = value;
      index += 1;
    } else if (argument === '--manifest' && value !== undefined) {
      manifest = value;
      index += 1;
    } else if (argument === '--check-manifest' && value !== undefined) {
      checkManifest = value;
      index += 1;
    } else {
      fail(`usage: verify-package.mjs [--tarball <absolute> --manifest <absolute>] | [--check-manifest <absolute>]`);
    }
  }

  if (checkManifest !== undefined) {
    if (tarball !== undefined || manifest !== undefined || !isAbsolute(checkManifest)) {
      fail('--check-manifest must be an absolute path and cannot be combined with other modes');
    }
    return { kind: 'check', manifest: checkManifest };
  }

  if (tarball !== undefined && !isAbsolute(tarball)) fail('--tarball must be an absolute path');
  if (manifest !== undefined && (!isAbsolute(manifest) || tarball === undefined)) {
    fail('--manifest requires supplied-tarball mode and an absolute output path');
  }
  return { kind: 'verify', tarball, manifest };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    input: options.input,
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
    windowsVerbatimArguments: options.windowsVerbatimArguments ?? false,
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function runRequired(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    fail(`${basename(command)} failed with status ${String(result.status)}: ${result.stderr || result.stdout}`);
  }
  return result;
}

function runNpmRequired(args, options = {}) {
  if (process.platform !== 'win32') return runRequired('npm', args, options);

  const configuredCli = process.env.npm_execpath;
  const fallbackCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const cli = configuredCli !== undefined && existsSync(configuredCli) ? configuredCli : fallbackCli;
  if (!existsSync(cli)) fail('npm CLI entrypoint not found for Windows package verification');

  const result = run(process.execPath, [cli, ...args], options);
  if (result.status !== 0) {
    fail(`npm failed with status ${String(result.status)}: ${result.stderr || result.stdout}`);
  }
  return result;
}

function isolatedEnvironment(root) {
  const cache = join(root, 'npm cache');
  const home = join(root, 'isolated home');
  const userConfig = join(root, 'empty user config.npmrc');
  mkdirSync(cache, { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(userConfig, '', { flag: 'wx' });
  return {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    NO_COLOR: '1',
    npm_config_cache: cache,
    npm_config_userconfig: userConfig,
    npm_config_registry: REGISTRY,
    npm_config_loglevel: 'silent',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
  };
}

function artifactHashes(path) {
  const bytes = readFileSync(path);
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    shasum: createHash('sha1').update(bytes).digest('hex'),
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    size: bytes.byteLength,
  };
}

function tarString(buffer, start, length) {
  const field = buffer.subarray(start, start + length);
  const zero = field.indexOf(0);
  return field.subarray(0, zero === -1 ? field.length : zero).toString('utf8');
}

function tarEntries(path) {
  const archive = gunzipSync(readFileSync(path));
  return parseTarArchive(archive).map(({ name }) => name).sort();
}

function parseTarArchive(archive) {
  const entries = [];
  let offset = 0;
  let terminated = false;

  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      if (!archive.subarray(offset).every((byte) => byte === 0)) {
        fail('tarball contains data after its end marker');
      }
      terminated = true;
      break;
    }

    const expectedChecksum = Number.parseInt(tarString(header, 148, 8).trim(), 8);
    const checksumHeader = Buffer.from(header);
    checksumHeader.fill(32, 148, 156);
    const actualChecksum = checksumHeader.reduce((sum, byte) => sum + byte, 0);
    if (!Number.isSafeInteger(expectedChecksum) || expectedChecksum !== actualChecksum) {
      fail('tarball contains an invalid entry checksum');
    }

    const name = tarString(header, 0, 100);
    const prefix = tarString(header, 345, 155);
    const fullName = prefix.length === 0 ? name : `${prefix}/${name}`;
    const rawSize = tarString(header, 124, 12).trim();
    const size = rawSize.length === 0 ? 0 : Number.parseInt(rawSize, 8);
    if (!Number.isSafeInteger(size) || size < 0) fail('tarball contains an invalid entry size');
    const type = header[156];
    if (type !== 0 && type !== 48) fail('tarball contains an unsupported entry type');
    if (fullName.length === 0) fail('tarball contains an unnamed entry');
    const dataOffset = offset + 512;
    if (dataOffset + size > archive.length) fail('tarball entry extends past the archive');
    entries.push({
      name: fullName,
      headerOffset: offset,
      dataOffset,
      size,
      contents: Buffer.from(archive.subarray(dataOffset, dataOffset + size)),
    });
    offset += 512 + Math.ceil(size / 512) * 512;
  }

  if (!terminated) fail('tarball has no end marker');
  return entries;
}

function assertPayload(path, packFiles) {
  const expectedTarEntries = EXPECTED_PACKAGE_FILES.map((name) => `package/${name}`).sort();
  assert.deepEqual(tarEntries(path), expectedTarEntries);
  if (packFiles !== undefined) assert.deepEqual([...packFiles].sort(), EXPECTED_PACKAGE_FILES);
}

function packTemporaryArtifact(root, env) {
  const destination = join(root, 'packed artifact');
  mkdirSync(destination, { recursive: true });
  const result = runNpmRequired(
    ['pack', '--json', '--pack-destination', destination],
    { cwd: repositoryRoot, env },
  );

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    fail('npm pack did not return one complete JSON result');
  }
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, 1);
  const record = parsed[0];
  assert.equal(record.id, `${PACKAGE_NAME}@${PACKAGE_VERSION}`);
  assert.equal(record.name, PACKAGE_NAME);
  assert.equal(record.version, PACKAGE_VERSION);
  assert.equal(record.filename, `${PACKAGE_NAME}-${PACKAGE_VERSION}.tgz`);
  assert.ok(Array.isArray(record.files));

  const path = join(destination, record.filename);
  assert.ok(existsSync(path));
  const hashes = artifactHashes(path);
  assert.equal(record.shasum, hashes.shasum);
  assert.equal(record.integrity, hashes.integrity);
  assert.equal(record.size, hashes.size);
  assertPayload(path, record.files.map((file) => file.path));
  return path;
}

function assertPackageManifest(manifest) {
  assert.equal(manifest.name, PACKAGE_NAME);
  assert.equal(manifest.version, PACKAGE_VERSION);
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.license, 'MIT');
  assert.deepEqual(manifest.bin, { skillfoo: 'dist/entrypoint.js' });
  assert.deepEqual(manifest.engines, { node: ENGINES });
  assert.deepEqual(manifest.repository, { type: 'git', url: REPOSITORY_URL });
  assert.equal(manifest.homepage, HOMEPAGE);
  assert.deepEqual(manifest.bugs, { url: BUGS_URL });
  assert.deepEqual(manifest.publishConfig, { access: 'public', registry: REGISTRY });
  for (const key of ['main', 'exports', 'types', 'typings']) assert.equal(manifest[key], undefined);
  for (const script of [
    'preinstall',
    'install',
    'postinstall',
    'prepublish',
    'preprepare',
    'prepare',
    'postprepare',
    'prepublishOnly',
    'publish',
    'postpublish',
  ]) {
    assert.equal(manifest.scripts?.[script], undefined, `package must not define ${script}`);
  }
}

function readPackagedManifest(tarball) {
  const archive = parseTarArchive(gunzipSync(readFileSync(tarball)));
  const manifestEntry = archive.find(({ name }) => name === 'package/package.json');
  assert.ok(manifestEntry, 'tarball must contain package/package.json');
  const manifest = JSON.parse(manifestEntry.contents.toString('utf8'));
  assertPackageManifest(manifest);
  return manifest;
}

function readInstalledManifest(project) {
  const packageRoot = join(project, 'node_modules', PACKAGE_NAME);
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  assertPackageManifest(manifest);
  assert.ok(
    readFileSync(join(packageRoot, 'dist', 'entrypoint.js'), 'utf8').startsWith('#!/usr/bin/env node\n'),
    'installed entrypoint must retain the Node shebang',
  );
  return { manifest, packageRoot };
}

function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const entry = lstatSync(path);
      if (entry.isDirectory()) visit(path);
      else files.push(relative(root, path).split(sep).join('/'));
    }
  };
  visit(root);
  return files.sort();
}

function installArtifact(root, tarball, env) {
  const project = join(root, 'installed consumer project é');
  mkdirSync(project, { recursive: true });
  writeFileSync(
    join(project, 'package.json'),
    `${JSON.stringify({ name: 'skillfoo-package-verifier', private: true }, null, 2)}\n`,
  );
  runNpmRequired(
    ['install', '--save-exact', '--no-audit', '--no-fund', tarball],
    { cwd: project, env },
  );
  const { packageRoot } = readInstalledManifest(project);
  assert.deepEqual(listFiles(packageRoot), EXPECTED_PACKAGE_FILES);

  const shim = join(project, 'node_modules', '.bin', process.platform === 'win32' ? 'skillfoo.cmd' : 'skillfoo');
  assert.ok(existsSync(shim), 'npm did not create the platform skillfoo shim');
  return { project, shim };
}

function runInstalled(installation, args, options = {}) {
  if (process.platform === 'win32') {
    const command = process.env.ComSpec ?? 'cmd.exe';
    const unsupported = /["%\r\n\u0000]/u;
    if (unsupported.test(installation.shim) || args.some((argument) => unsupported.test(argument))) {
      fail('Windows package verification received an unsupported command character');
    }
    const commandArguments = args.map((argument) => `"${argument}"`).join(' ');
    const commandLine = `""${installation.shim}"${commandArguments.length === 0 ? '' : ` ${commandArguments}`}"`;
    return run(command, ['/d', '/s', '/v:off', '/c', commandLine], {
      cwd: options.cwd,
      env: options.env,
      windowsVerbatimArguments: true,
    });
  }
  return run(installation.shim, args, { cwd: options.cwd, env: options.env });
}

function writeSkill(registry, name, description = `${name} guidance.`) {
  const directory = join(registry, name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
  );
}

function snapshotTree(root) {
  const records = [];
  const visit = (path) => {
    if (!existsSync(path)) return;
    for (const name of readdirSync(path).sort()) {
      const entryPath = join(path, name);
      const entry = lstatSync(entryPath);
      const relativePath = relative(root, entryPath).split(sep).join('/');
      if (entry.isSymbolicLink()) records.push(['link', relativePath, readlinkSync(entryPath)]);
      else if (entry.isDirectory()) {
        records.push(['dir', relativePath]);
        visit(entryPath);
      } else {
        records.push([
          'file',
          relativePath,
          createHash('sha256').update(readFileSync(entryPath)).digest('hex'),
          entry.mode & 0o777,
        ]);
      }
    }
  };
  visit(root);
  return JSON.stringify(records);
}

function parseSchema2(stdout) {
  const result = JSON.parse(stdout);
  if (result === null || typeof result !== 'object' || result.schemaVersion !== 2) {
    throw new Error(`unsupported skillfoo status schema version`);
  }
  return result;
}

function assertJsonOutcome(result, outcome) {
  assert.equal(result.outcome, outcome);
  assert.equal(typeof result.registry, 'string');
  assert.equal(typeof result.emit, 'string');
  assert.ok(Array.isArray(result.skills));
  assert.ok(Array.isArray(result.projections));
  assert.equal(typeof result.summary, 'object');
}

function exactDiagnostic(result, line) {
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, `${line}\n`);
  return line;
}

function initializeGitRegistry(registry, skillName) {
  mkdirSync(registry, { recursive: true });
  runRequired(gitCommand, ['init'], { cwd: registry });
  writeSkill(registry, skillName);
  runRequired(gitCommand, ['add', '.'], { cwd: registry });
  runRequired(
    gitCommand,
    [
      '-c',
      'user.name=Skillfoo Package Verifier',
      '-c',
      'user.email=package-verifier@skillfoo.invalid',
      'commit',
      '-m',
      `add ${skillName}`,
    ],
    { cwd: registry },
  );
}

function cacheDirectory(cacheRoot, url) {
  return join(cacheRoot, createHash('sha256').update(url, 'utf8').digest('hex'));
}

function oldCacheSlug(url) {
  return url
    .replace(/^\w+:\/\//u, '')
    .replace(/^git@/u, '')
    .replace(/[:]/gu, '-')
    .replace(/\.git$/u, '')
    .replace(/[^\w.-]+/gu, '-');
}

function assertStatusContract(installation, root, env, observedRegistryLines) {
  const fixture = join(root, 'status fixtures é');
  const registry = join(fixture, 'registry');
  const consumer = join(fixture, 'consumer');
  mkdirSync(registry, { recursive: true });
  mkdirSync(consumer, { recursive: true });
  for (const name of ['éclair', 'alpha', 'Zulu']) writeSkill(registry, name);
  writeFileSync(
    join(consumer, '.skillfoo.yml'),
    'registry: ../registry\nskills: [éclair, alpha, Zulu]\n',
  );

  const before = snapshotTree(consumer);
  const fresh = runInstalled(installation, ['status', '--json'], { cwd: consumer, env });
  assert.equal(fresh.status, 2);
  assert.equal(fresh.stderr, '');
  const freshJson = parseSchema2(fresh.stdout);
  assertJsonOutcome(freshJson, 'changes_available');
  assert.deepEqual(freshJson.skills.map(({ name }) => name), ['Zulu', 'alpha', 'éclair']);
  assert.deepEqual(
    freshJson.projections.map(({ kind, skill }) => [kind, skill]),
    [
      ['agents_md', undefined],
      ['claude_adapter', 'Zulu'],
      ['claude_adapter', 'alpha'],
      ['claude_adapter', 'éclair'],
    ],
  );
  assert.equal(snapshotTree(consumer), before);

  const repeated = runInstalled(installation, ['status', '--json'], { cwd: consumer, env });
  assert.equal(repeated.status, 2);
  assert.equal(repeated.stdout, fresh.stdout);
  assert.equal(repeated.stderr, '');
  assert.equal(snapshotTree(consumer), before);

  const unknown = JSON.stringify({ ...freshJson, schemaVersion: 999 });
  assert.throws(() => parseSchema2(unknown), /unsupported skillfoo status schema version/u);

  const synced = runInstalled(installation, ['sync'], { cwd: consumer, env });
  assert.equal(synced.status, 0);
  assert.equal(synced.stderr, '');
  const convergedBefore = snapshotTree(consumer);
  const converged = runInstalled(installation, ['status', '--json'], { cwd: consumer, env });
  assert.equal(converged.status, 0);
  assert.equal(converged.stderr, '');
  assertJsonOutcome(parseSchema2(converged.stdout), 'converged');
  assert.equal(snapshotTree(consumer), convergedBefore);

  writeFileSync(join(consumer, '.agents', 'skills', 'alpha', 'SKILL.md'), 'local alpha edit\n');
  const conflictBefore = snapshotTree(consumer);
  const conflict = runInstalled(installation, ['status', '--json'], { cwd: consumer, env });
  assert.equal(conflict.status, 3);
  assert.equal(conflict.stderr, '');
  assertJsonOutcome(parseSchema2(conflict.stdout), 'attention_required');
  assert.equal(snapshotTree(consumer), conflictBefore);

  const missingConfig = join(fixture, 'missing config');
  mkdirSync(missingConfig);
  const operational = runInstalled(installation, ['status', '--json'], { cwd: missingConfig, env });
  assert.equal(operational.status, 1);
  assert.equal(operational.stdout, '');
  assert.match(operational.stderr, /^skillfoo: no \.skillfoo\.yml/u);
  assert.equal(snapshotTree(missingConfig), '[]');

  const usage = runInstalled(installation, ['status', '--json', '--unknown'], {
    cwd: missingConfig,
    env,
  });
  assert.equal(usage.status, 1);
  assert.equal(usage.stdout, '');
  assert.match(usage.stderr, /^skillfoo:/u);

  const missingRegistry = join(fixture, 'missing registry consumer');
  mkdirSync(missingRegistry);
  writeFileSync(join(missingRegistry, '.skillfoo.yml'), 'registry: ../does-not-exist\n');
  const missing = runInstalled(installation, ['status', '--json'], { cwd: missingRegistry, env });
  assert.equal(missing.status, 1);
  observedRegistryLines.add(exactDiagnostic(missing, REGISTRY_LINES[6]));
}

function assertUnsafeSources(installation, root, baseEnv, observedRegistryLines) {
  const fixture = join(root, 'unsafe registry fixtures');
  mkdirSync(fixture, { recursive: true });
  const sentinel = 'sensitive-value';
  const cases = [
    [`https://sensitive-user:${sentinel}@example.invalid/skills.git`, REGISTRY_LINES[0]],
    [`https://example.invalid/skills.git?token=${sentinel}`, REGISTRY_LINES[0]],
    [`https://example.invalid/skills.git#${sentinel}`, REGISTRY_LINES[0]],
    [`file://sensitive-user@localhost/tmp/${sentinel}.git`, REGISTRY_LINES[0]],
    [`ssh://git:${sentinel}@example.invalid/skills.git`, REGISTRY_LINES[0]],
    [`ssh://git@example.invalid/skills.git?token=${sentinel}`, REGISTRY_LINES[0]],
    [`https://example.invalid/skills-${sentinel}-\u001b.git`, REGISTRY_LINES[1]],
  ];

  for (const [source, diagnostic] of cases) {
    const caseRoot = join(fixture, createHash('sha256').update(source).digest('hex'));
    const consumer = join(caseRoot, 'loaded config');
    const home = join(caseRoot, 'home');
    mkdirSync(consumer, { recursive: true });
    mkdirSync(home);
    const env = { ...baseEnv, HOME: home, USERPROFILE: home };
    const configPath = join(consumer, '.skillfoo.yml');
    const contents = `registry: ${JSON.stringify(source)}\n`;
    writeFileSync(configPath, contents);
    const before = snapshotTree(consumer);
    const result = runInstalled(installation, ['status', '--json'], { cwd: consumer, env });
    assert.equal(result.status, 1);
    observedRegistryLines.add(exactDiagnostic(result, diagnostic));
    assert.doesNotMatch(result.stderr, /sensitive-user|sensitive-value|example\.invalid|\u001b/u);
    assert.equal(snapshotTree(consumer), before);
    assert.equal(readFileSync(configPath, 'utf8'), contents);
    assert.equal(snapshotTree(home), '[]');

    const initConsumer = join(caseRoot, 'unsafe init');
    mkdirSync(initConsumer);
    const initialized = runInstalled(installation, ['init', source, '--all'], {
      cwd: initConsumer,
      env,
    });
    assert.equal(initialized.status, 1);
    observedRegistryLines.add(exactDiagnostic(initialized, diagnostic));
    assert.equal(snapshotTree(initConsumer), '[]');
  }
}

function assertDiscardedGitOutput(installation, root, baseEnv, observedRegistryLines) {
  const fixture = join(root, 'fake git fixture');
  const consumer = join(fixture, 'consumer');
  const home = join(fixture, 'home');
  mkdirSync(consumer, { recursive: true });
  mkdirSync(home);
  const sentinel = 'FAKE-GIT-SENSITIVE-VALUE';
  let source;
  let env = { ...baseEnv, HOME: home, USERPROFILE: home };

  if (process.platform === 'win32') {
    const fakeTransport = join(fixture, 'fake-ssh.mjs');
    writeFileSync(
      fakeTransport,
      `process.stderr.write(${JSON.stringify(sentinel)} + '\\u001b' + 'x'.repeat(12000)); process.exit(9);\n`,
    );
    const quote = (value) => `"${value.replaceAll('"', '\\"')}"`;
    env = { ...env, GIT_SSH_COMMAND: `${quote(process.execPath)} ${quote(fakeTransport)}` };
    source = 'ssh://git@example.invalid/skills.git';
  } else {
    const fakeBin = join(fixture, 'fake-bin');
    mkdirSync(fakeBin);
    const fakeGit = join(fakeBin, 'git');
    writeFileSync(
      fakeGit,
      `#!/usr/bin/env node\nprocess.stderr.write(${JSON.stringify(sentinel)} + '\\u001b' + 'x'.repeat(12000)); process.exit(9);\n`,
    );
    chmodSync(fakeGit, 0o755);
    env = { ...env, PATH: `${fakeBin}${sep}${env.PATH ?? ''}` };
    source = 'github.com/example/skills';
  }

  writeFileSync(join(consumer, '.skillfoo.yml'), `registry: ${source}\n`);
  const before = snapshotTree(consumer);
  const result = runInstalled(installation, ['status', '--json'], { cwd: consumer, env });
  assert.equal(result.status, 1);
  assert.equal(
    result.stderr,
    `${REGISTRY_LINES[2]}\n${REGISTRY_LINES[5]}\n`,
  );
  observedRegistryLines.add(REGISTRY_LINES[2]);
  observedRegistryLines.add(REGISTRY_LINES[5]);
  assert.equal(result.stdout, '');
  assert.doesNotMatch(result.stderr, /FAKE-GIT|SENSITIVE|example\.invalid|\u001b|x{100}/u);
  assert.equal(snapshotTree(consumer), before);
}

function assertGitCacheContract(installation, root, baseEnv, observedRegistryLines) {
  const fixture = join(root, 'git cache fixtures');
  const home = join(fixture, 'home');
  const cacheRoot = join(home, '.skillfoo', 'registries');
  const registry = join(fixture, 'ordinary registry');
  const consumer = join(fixture, 'ordinary consumer');
  mkdirSync(home, { recursive: true });
  mkdirSync(consumer, { recursive: true });
  initializeGitRegistry(registry, 'alpha');
  const registryUrl = pathToFileURL(registry).href;
  writeFileSync(join(consumer, '.skillfoo.yml'), `registry: ${JSON.stringify(registryUrl)}\nskills: [alpha]\n`);
  const env = { ...baseEnv, HOME: home, USERPROFILE: home };
  const before = snapshotTree(consumer);

  const cloned = runInstalled(installation, ['status', '--json'], { cwd: consumer, env });
  assert.equal(cloned.status, 2);
  assert.equal(cloned.stderr, `${REGISTRY_LINES[2]}\n`);
  parseSchema2(cloned.stdout);
  observedRegistryLines.add(REGISTRY_LINES[2]);
  assert.equal(snapshotTree(consumer), before);
  assert.ok(existsSync(cacheDirectory(cacheRoot, registryUrl)));

  const updated = runInstalled(installation, ['status', '--json'], { cwd: consumer, env });
  assert.equal(updated.status, 2);
  assert.equal(updated.stderr, `${REGISTRY_LINES[3]}\n`);
  parseSchema2(updated.stdout);
  observedRegistryLines.add(REGISTRY_LINES[3]);
  assert.equal(snapshotTree(consumer), before);

  const firstRegistry = join(fixture, 'a-b');
  const secondRegistry = join(fixture, 'a', 'b');
  const legacyRegistry = join(fixture, 'legacy');
  initializeGitRegistry(firstRegistry, 'first-source');
  initializeGitRegistry(secondRegistry, 'second-source');
  initializeGitRegistry(legacyRegistry, 'legacy-source');
  const firstUrl = pathToFileURL(firstRegistry).href;
  const secondUrl = pathToFileURL(secondRegistry).href;
  assert.equal(oldCacheSlug(firstUrl), oldCacheSlug(secondUrl));

  const legacyDirectory = join(cacheRoot, oldCacheSlug(firstUrl));
  mkdirSync(cacheRoot, { recursive: true });
  runRequired(gitCommand, ['clone', pathToFileURL(legacyRegistry).href, legacyDirectory], {
    cwd: cacheRoot,
  });
  const legacyBefore = snapshotTree(legacyDirectory);

  const firstConsumer = join(fixture, 'first consumer');
  const secondConsumer = join(fixture, 'second consumer');
  mkdirSync(firstConsumer);
  mkdirSync(secondConsumer);
  writeFileSync(join(firstConsumer, '.skillfoo.yml'), `registry: ${JSON.stringify(firstUrl)}\nskills: [first-source]\n`);
  writeFileSync(join(secondConsumer, '.skillfoo.yml'), `registry: ${JSON.stringify(secondUrl)}\nskills: [second-source]\n`);
  const firstBefore = snapshotTree(firstConsumer);
  const secondBefore = snapshotTree(secondConsumer);

  const first = runInstalled(installation, ['status', '--json'], { cwd: firstConsumer, env });
  const second = runInstalled(installation, ['status', '--json'], { cwd: secondConsumer, env });
  assert.equal(first.status, 2);
  assert.equal(second.status, 2);
  assert.deepEqual(parseSchema2(first.stdout).skills.map(({ name }) => name), ['first-source']);
  assert.deepEqual(parseSchema2(second.stdout).skills.map(({ name }) => name), ['second-source']);
  assert.equal(first.stderr, `${REGISTRY_LINES[2]}\n`);
  assert.equal(second.stderr, `${REGISTRY_LINES[2]}\n`);

  const firstCache = cacheDirectory(cacheRoot, firstUrl);
  const secondCache = cacheDirectory(cacheRoot, secondUrl);
  assert.notEqual(firstCache, secondCache);
  assert.match(basename(firstCache), /^[a-f0-9]{64}$/u);
  assert.match(basename(secondCache), /^[a-f0-9]{64}$/u);
  runRequired(gitCommand, ['remote', 'set-url', 'origin', firstUrl], { cwd: secondCache });

  const recovered = runInstalled(installation, ['status', '--json'], { cwd: secondConsumer, env });
  assert.equal(recovered.status, 2);
  assert.equal(recovered.stderr, `${REGISTRY_LINES[4]}\n`);
  observedRegistryLines.add(REGISTRY_LINES[4]);
  assert.deepEqual(parseSchema2(recovered.stdout).skills.map(({ name }) => name), ['second-source']);
  assert.equal(
    runRequired(gitCommand, ['remote', 'get-url', 'origin'], { cwd: secondCache }).stdout.trim(),
    secondUrl,
  );
  assert.equal(snapshotTree(legacyDirectory), legacyBefore);
  assert.equal(snapshotTree(firstConsumer), firstBefore);
  assert.equal(snapshotTree(secondConsumer), secondBefore);
}

function assertExecutableContract(installation, root, env) {
  const version = runInstalled(installation, ['--version'], { cwd: root, env });
  assert.deepEqual(version, { status: 0, stdout: `${PACKAGE_VERSION}\n`, stderr: '' });

  const help = runInstalled(installation, ['--help'], { cwd: root, env });
  assert.equal(help.status, 0);
  assert.equal(help.stderr, '');
  for (const text of ['init', 'sync', 'resolve', 'status [--json]', '--version']) {
    assert.match(help.stdout, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
}

function currentCommit() {
  return runRequired(gitCommand, ['rev-parse', 'HEAD'], { cwd: repositoryRoot }).stdout.trim();
}

function assertCleanReleaseSource() {
  const status = runRequired(
    gitCommand,
    ['status', '--porcelain', '--untracked-files=all'],
    { cwd: repositoryRoot },
  ).stdout;
  assert.equal(status, '', 'release manifest creation requires a clean source checkout');
}

function releaseManifest(tarball) {
  const hashes = artifactHashes(tarball);
  return {
    manifestVersion: 1,
    commit: currentCommit(),
    intendedTag: INTENDED_TAG,
    package: { name: PACKAGE_NAME, version: PACKAGE_VERSION },
    artifact: {
      absolutePath: tarball,
      filename: basename(tarball),
      sha256: hashes.sha256,
      shasum: hashes.shasum,
      integrity: hashes.integrity,
      size: hashes.size,
    },
    verification: {
      packageContract: 'passed',
      statusJsonSchema: 2,
      registryDiagnostics: 'passed',
      consumerMutationGuard: 'passed',
    },
  };
}

function assertManifestShape(manifest) {
  assert.equal(manifest.manifestVersion, 1);
  assert.match(manifest.commit, /^[a-f0-9]{40}$/u);
  assert.equal(manifest.intendedTag, INTENDED_TAG);
  assert.deepEqual(manifest.package, { name: PACKAGE_NAME, version: PACKAGE_VERSION });
  assert.ok(isAbsolute(manifest.artifact.absolutePath));
  assert.equal(manifest.artifact.filename, basename(manifest.artifact.absolutePath));
  assert.deepEqual(manifest.verification, {
    packageContract: 'passed',
    statusJsonSchema: 2,
    registryDiagnostics: 'passed',
    consumerMutationGuard: 'passed',
  });
}

function assertManifestMatches(manifest) {
  assertManifestShape(manifest);
  const hashes = artifactHashes(manifest.artifact.absolutePath);
  for (const key of ['sha256', 'shasum', 'integrity', 'size']) {
    assert.equal(hashes[key], manifest.artifact[key], `release artifact ${key} mismatch`);
  }
}

function exerciseManifestChecker(root, tarball) {
  const copy = join(root, 'manifest checker mutation fixture.tgz');
  copyFileSync(tarball, copy);
  const manifest = releaseManifest(copy);
  assertManifestMatches(manifest);
  appendFileSync(copy, Buffer.from([0]));
  assert.throws(() => assertManifestMatches(manifest), /release artifact (sha256|shasum|integrity|size) mismatch/u);
}

function exerciseTarEntryTypeGuard(root, tarball) {
  const archive = gunzipSync(readFileSync(tarball));
  archive[156] = '5'.charCodeAt(0);
  writeTarChecksum(archive, 0);
  const unexpectedEntryTarball = join(root, 'unexpected tar entry type.tgz');
  writeFileSync(unexpectedEntryTarball, gzipSync(archive));
  assert.throws(
    () => tarEntries(unexpectedEntryTarball),
    /tarball contains an unsupported entry type/u,
  );
}

function writeTarChecksum(archive, headerOffset) {
  archive.fill(32, headerOffset + 148, headerOffset + 156);
  const checksum = archive
    .subarray(headerOffset, headerOffset + 512)
    .reduce((sum, byte) => sum + byte, 0);
  Buffer.from(`${checksum.toString(8).padStart(6, '0')}\0 `, 'ascii').copy(
    archive,
    headerOffset + 148,
  );
}

function exerciseInstallLifecycleManifestGuards(root, tarball) {
  for (const script of [
    'preinstall',
    'install',
    'postinstall',
    'prepublish',
    'preprepare',
    'prepare',
    'postprepare',
  ]) {
    const archive = gunzipSync(readFileSync(tarball));
    const manifestEntry = parseTarArchive(archive).find(
      ({ name }) => name === 'package/package.json',
    );
    assert.ok(manifestEntry);
    const manifest = JSON.parse(manifestEntry.contents.toString('utf8'));
    const marker = join(root, `forbidden ${script} marker`);
    const encodedMarker = Buffer.from(marker, 'utf8').toString('base64');
    manifest.scripts = {
      ...manifest.scripts,
      [script]:
        `node -e "require('node:fs').writeFileSync(` +
        `Buffer.from('${encodedMarker}','base64'),'ran')"`,
    };
    const contents = Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8');
    const capacity = Math.ceil(manifestEntry.size / 512) * 512;
    assert.ok(contents.length <= capacity, 'lifecycle regression manifest exceeds tar entry space');

    archive.fill(0, manifestEntry.dataOffset, manifestEntry.dataOffset + capacity);
    contents.copy(archive, manifestEntry.dataOffset);
    Buffer.from(`${contents.length.toString(8).padStart(11, '0')}\0`, 'ascii').copy(
      archive,
      manifestEntry.headerOffset + 124,
    );
    writeTarChecksum(archive, manifestEntry.headerOffset);

    const forbiddenTarball = join(root, `forbidden ${script} hook.tgz`);
    writeFileSync(forbiddenTarball, gzipSync(archive));
    assert.throws(
      () => readPackagedManifest(forbiddenTarball),
      new RegExp(`package must not define ${script}`, 'u'),
    );
    assert.equal(existsSync(marker), false, `forbidden ${script} hook ran before rejection`);
  }
}

function verify(mode) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'skillfoo-package-verifier-'));
  const workRoot = join(temporaryRoot, 'owned workspace with spaces é');
  mkdirSync(workRoot);
  const env = isolatedEnvironment(workRoot);
  const supplied = mode.tarball !== undefined;
  const tarball = supplied ? mode.tarball : packTemporaryArtifact(workRoot, env);
  if (!existsSync(tarball) || !statSync(tarball).isFile()) fail('supplied tarball is not a file');
  if (basename(tarball) !== `${PACKAGE_NAME}-${PACKAGE_VERSION}.tgz`) {
    fail(`tarball filename must be ${PACKAGE_NAME}-${PACKAGE_VERSION}.tgz`);
  }

  const before = artifactHashes(tarball);
  try {
    assertPayload(tarball);
    readPackagedManifest(tarball);
    const installation = installArtifact(workRoot, tarball, env);
    readInstalledManifest(installation.project);
    assertExecutableContract(installation, workRoot, env);

    const observedRegistryLines = new Set();
    assertStatusContract(installation, workRoot, env, observedRegistryLines);
    assertUnsafeSources(installation, workRoot, env, observedRegistryLines);
    assertDiscardedGitOutput(installation, workRoot, env, observedRegistryLines);
    assertGitCacheContract(installation, workRoot, env, observedRegistryLines);

    for (const line of REGISTRY_LINES) {
      assert.ok(Buffer.byteLength(line, 'utf8') <= 160, `registry line exceeds 160 bytes: ${line}`);
    }
    assert.deepEqual([...observedRegistryLines].sort(), [...REGISTRY_LINES].sort());
    exerciseTarEntryTypeGuard(workRoot, tarball);
    exerciseInstallLifecycleManifestGuards(workRoot, tarball);
    exerciseManifestChecker(workRoot, tarball);

    assert.deepEqual(artifactHashes(tarball), before, 'package verification mutated the tarball');
    if (mode.manifest !== undefined) {
      assertCleanReleaseSource();
      const manifest = releaseManifest(tarball);
      assertManifestMatches(manifest);
      mkdirSync(dirname(mode.manifest), { recursive: true });
      writeFileSync(mode.manifest, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    }

    process.stdout.write(
      `${PACKAGE_NAME}@${PACKAGE_VERSION} installed-package verification passed (${EXPECTED_PACKAGE_FILES.length} files, schema 2, exits 0/1/2/3, seven registry diagnostics)\n`,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

const mode = parseArguments(process.argv.slice(2));
if (mode.kind === 'check') {
  const manifest = JSON.parse(readFileSync(mode.manifest, 'utf8'));
  assertManifestMatches(manifest);
  process.stdout.write('release manifest matches the retained tarball\n');
} else {
  verify(mode);
}
