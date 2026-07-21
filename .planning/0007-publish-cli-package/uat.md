# UAT: Publish the skillfoo CLI package

**Status:** Approved by the user after the package-scope correction

**Goal:** Prove before merge that the `skillfoo@1.0.0` release candidate is
publishable, then prove after explicit authorization that the one artifact
built from the exact merged commit intended for tag `v1.0.0` is the identical
publicly installed package; both must expose the documented
`skillfoo status --json` process contract without a supported library API.

## Acceptance surface

- **Actor:** A skillfoo maintainer preparing the release, followed—only after
  explicit authorization—by a consumer installing the public package.
- **Entrypoint:** The npm-created `skillfoo` executable from an exact tarball or
  exact public-registry version.
- **Visible outcome:** Version/help output and schema 2 JSON are correct;
  stdout, stderr, ordering, and exit statuses match the documented contract.
- **Durable effects:** Before authorization, only repository changes in the
  release-readiness PR and disposable local package fixtures exist. After
  authorization, one immutable tag, one GitHub release, and one public npm
  package version all identify the same artifact.
- **Environment:** Node 22 or 24, npm, Git, a clean disposable directory, and
  no reliance on a globally linked skillfoo. CI supplies Node 22/24 coverage on
  Ubuntu, macOS, and Windows.

## Prerequisites

- The `release-readiness` branch or its PR head is under test.
- The branch starts from merged PR #8 on current `main`.
- The complete release-readiness candidate, including planning artifacts, is
  committed so `main...HEAD` contains everything under acceptance and review;
  no slice file remains untracked or unstaged.
- No `v1.0.0` tag, GitHub release, or public `skillfoo@1.0.0` exists during the
  release-readiness portion of this UAT.
- Run all consumer mutations in a newly created temporary directory, never in
  the skillfoo repository.
- Use the repository-provided package verification command added by the slice
  for the cross-platform automated pass. The manual commands below may use the
  platform-native `node_modules/.bin/skillfoo` shim (`skillfoo.cmd` on Windows).
- npm authentication is not needed for pre-publication UAT. For the actual
  first publish, the human authenticates privately; credentials and `.npmrc`
  contents are never copied into commands, logs, artifacts, or chat.
- Package build/install verification uses an isolated non-secret npm user
  config and cache. Public dependencies come only from the explicit public npm
  registry; the test does not inherit a release credential or private registry
  override.
- The supported runtime declaration is `^22.0.0 || ^24.0.0`, matching the two
  LTS majors exercised across the operating-system matrix. Exact lower-bound
  jobs run `22.0.0` and `24.0.0` on Ubuntu in addition to the six latest-patch
  Node/OS jobs.

## Release-readiness preflight

1. From the repository root, run:

   ```sh
   git diff --check main...HEAD
   npm ci
   npm run check
   npm run test:package
   npm run test:release-modes
   ```

2. Create a temporary directory outside the repository. Run
   `npm pack --json --pack-destination <temporary-directory>` from clean build
   output and retain the produced `skillfoo-1.0.0.tgz` there plus its reported
   filename, size, shasum, and integrity.
3. Run `git status --short` after verification.

Expected:

- Every command exits `0` and the working tree contains no build or tarball
  artifact or other post-commit change.
- `npm run check` typechecks, builds, and runs the complete repository suite.
- The package verification builds from clean `dist/`, creates a real tarball,
  installs it in an empty temporary project, and invokes the installed shim.
- The release-mode command verification proves supplied-artifact byte
  preservation and no repack, exact commit-bound manifest creation/checking,
  dirty-checkout and tamper rejection, and owned temporary-state cleanup.
- The tarball identity is `skillfoo@1.0.0`; package manifest, lockfile,
  `skillfoo --version`, tarball filename, and later Git tag agree.
- The payload contains only `package.json`, `README.md`, `LICENSE`, and the
  compiled runtime `.js` files under `dist/`.
- The payload contains no `.js.map`, TypeScript source, tests, planning files,
  workflows, lockfile, `.npmrc`, credentials, or repository metadata.
- The installed package declares Node `^22.0.0 || ^24.0.0`, the MIT license,
  public source repository metadata, and exactly one bin named `skillfoo`. It
  declares no supported `main` or `exports` library entrypoint.

## Happy path: install and invoke the exact tarball

1. Create a new empty temporary project outside the repository and run
   `npm init -y` in it.
2. Install the absolute path to the retained tarball with
   `npm install --save-exact /absolute/path/to/skillfoo-1.0.0.tgz`.
3. Invoke the installed npm shim with `--version`.
4. Invoke the same shim with `--help`.

Expected:

- Installation succeeds without a global link, sibling package, Git URL, or
  registry fallback.
- `skillfoo --version` exits `0`, writes exactly `1.0.0` plus one newline to
  stdout, and leaves stderr empty.
- `skillfoo --help` exits `0`, writes CLI usage containing `init`, `sync`,
  `resolve`, and `status --json` to stdout, and leaves stderr empty. Exact help
  prose, whitespace, and ordering are not compared byte-for-byte.
- The executable being invoked resolves inside the temporary project's
  `node_modules/.bin`, not the skillfoo source checkout or a global prefix.

## Happy path: schema 2 status outcomes

1. In the temporary root, create a local registry containing three skills named
   `éclair`, `alpha`, and `Zulu`, each with a valid `SKILL.md`.
2. Create an empty consumer directory with this configuration, deliberately
   selecting the skills in non-lexical order:

   ```yaml
   registry: ../registry
   skills: [éclair, alpha, Zulu]
   ```

3. From the consumer, run the installed `skillfoo status --json`, capturing
   stdout, stderr, and the process status separately.
4. Parse all stdout with a standard JSON parser; do not trim a human prefix or
   select one line from mixed output.
5. Run the command a second time without changing the fixture and compare the
   stdout bytes.
6. Run the installed `skillfoo sync`, then run `status --json` again.
7. Edit the managed `alpha/SKILL.md` in the consumer and run `status --json`
   once more.

Expected:

- The fresh consumer status exits `2`; stdout is one valid JSON document,
  stderr is empty for the local registry, and no consumer file changes.
- The document has top-level fields `schemaVersion`, `outcome`, `registry`,
  `emit`, `skills`, `projections`, and `summary`; `schemaVersion` is exactly `2`
  and `outcome` is `changes_available`.
- `skills` is ordered `Zulu`, `alpha`, `éclair` regardless of config order.
  This is case-sensitive ECMAScript `<`/`>` ordering of unnormalized UTF-16
  strings, not locale-aware sorting. The `agents_md` projection comes first and
  Claude adapter projections use the same name comparator. Repeated unchanged
  runs from the same build have byte-identical stdout.
- Consumers parse JSON structurally and do not depend on object-key order,
  indentation, or the current trailing newline across package releases.
- After sync, status exits `0`, reports `outcome: "converged"`, and still emits
  only JSON on stdout.
- After the local edit, status exits `3`, reports
  `outcome: "attention_required"`, preserves the edit, and still emits only
  JSON on stdout.
- Summary counts agree with the emitted skill and projection records in each
  result.
- No status invocation writes the consumer repository. The local-path scenario
  has no network or skillfoo cache effect.

## Guardrails

### Diagnostics use stderr and return exit 1

1. In a second empty consumer with no `.skillfoo.yml`, run the installed
   `skillfoo status --json`, separately capturing stdout and stderr.
2. In any disposable directory, run `skillfoo status --json --unknown` with
   the same capture.

Expected:

- Each command exits `1`.
- Stdout is empty, so a caller can never mistake failure prose for a JSON
  document.
- Stderr contains the actionable missing-config or invalid-option diagnostic.
- Neither command creates consumer configuration, skills, projections, or
  lockfiles.

### Unsafe registry sources and diagnostics fail without leaking or injecting

1. In a disposable consumer, configure an HTTP(S) registry URL containing the
   sentinel userinfo `sensitive-user:sensitive-value`, record the config bytes,
   and run installed `skillfoo status --json`, capturing both streams/status.
2. Repeat in separate loaded configs with a credential-free host plus a query
   containing `sensitive-value`; with hosted and generic `.git` shorthands,
   `git@host:path`, and unsupported scheme-like sources carrying credentials,
   the same query, or a fragment; and with visible sentinel text plus an ASCII/C1
   terminal control. Record each original config byte-for-byte.
3. Exercise the same unsafe sources through non-interactive init in fresh
   disposable consumers.
4. Put a controlled fake `git` executable earlier in `PATH` using the
   platform-native shim. It exits nonzero after writing an oversized message
   containing credentials, control bytes, and a visible sentinel. With an
   accepted credential-free Git source and isolated cache/home, run installed
   `skillfoo status --json`.
5. In a separate consumer, configure a credential-free local registry path
   that does not exist and run the same command.

Expected:

- Every unsafe-source invocation exits `1` before DNS, Git, registry-cache, or
  consumer mutation. Each pre-existing loaded config remains byte-identical;
  its attacker-supplied sentinel is expected to remain in that original file.
- Unsafe init creates no config or other consumer state.
- For unsafe-source cases, stdout is empty and stderr uses actionable generic
  guidance without the rejected source, `sensitive-user`, `sensitive-value`, or
  a raw terminal-control byte. Credential/URL-component cases use exact fixed
  `skillfoo: registry source contains unsupported credentials or URL components; use out-of-band Git authentication`;
  control cases use exact fixed
  `skillfoo: registry source contains unsupported control characters`. No
  sentinel appears in any newly created path/file or cache.
- The accepted-source fake-Git invocation also exits `1` with empty stdout. Raw
  Git/helper/remote stderr is absent. Every registry-derived stderr line is from
  the fixed non-interpolated allowlist and is at most 160 UTF-8 bytes excluding
  its newline; no registry source, fake-Git sentinel, credential text, control
  byte, or oversized payload appears. An isolated cache directory created before
  Git fails is allowed; the consumer remains byte-identical.
- A fresh accepted Git source that reaches the failing fake Git writes exactly
  `skillfoo: cloning configured Git registry` followed by exactly
  `skillfoo: could not fetch configured Git registry; verify .skillfoo.yml and out-of-band Git authentication`
  to stderr, one line each. The missing local source writes exactly
  `skillfoo: configured local registry not found; verify .skillfoo.yml and filesystem access`
  and no other registry-derived line.
- Credential-free local paths, HTTP(S), `git@host:path`, and `ssh://user@host`
  registry forms retain existing behavior.

### Registry progress never decorates JSON stdout

1. Initialize the disposable registry as a local Git repository and commit its
   two skills using throwaway per-command Git author settings.
2. Create another disposable consumer whose `registry` is the registry's
   absolute `file://` URL.
3. Give the subprocess an isolated temporary home/cache so it cannot reuse a
   prior registry clone.
4. Run installed `skillfoo status --json`, capturing both streams and status.
5. Parse stdout as one complete JSON document.
6. Run the command again against the populated cache and parse stdout again.

Expected:

- Status exits `2` and stdout remains an undecorated schema 2 document.
- Exact fixed `skillfoo: cloning configured Git registry` is present only on
  stderr. The required cached repeat reports exact fixed
  `skillfoo: updating configured Git registry`, also only on stderr; neither
  line alters the JSON contract.
- The consumer repository remains byte-for-byte unchanged, but the isolated
  skillfoo registry cache is created/refreshed. This cache/network activity is
  documented as expected Git-backed status behavior, not a violation of the
  consumer-repository read-only guarantee.

### Git cache identity cannot substitute another registry

1. Create two disposable local Git registries at paths ending in `a-b` and
   `a/b`, which collide under the pre-release readable-slug algorithm. Give the
   first only skill `first-source` and the second only `second-source`.
2. Before either run, create the valid cache directory that the old readable-
   slug algorithm would have shared. Give it a third, distinguishable catalog
   and valid but wrong Git `origin`; record its complete tree bytes/hash.
3. Create separate disposable consumers selecting their matching single skill.
   Run installed `status --json` for both with the same isolated cache/home.
4. Locate the second source's hashed cache, deliberately change its Git
   `origin` to the first source, then run the second consumer's status again.
5. Compare both consumer trees and the pre-seeded legacy tree before/after, and
   inspect cached origins without printing them through the CLI.

Expected:

- Both initial statuses exit `2` and each JSON document contains only its
  configured registry/skill. The two normalized clone URLs produce distinct
  cache directories whose identity is the full SHA-256 hex digest; no legacy
  slug-only cache is reused.
- The pre-seeded legacy directory remains byte-identical and its third catalog
  never affects either result. It is neither read for resolution nor migrated,
  renamed, refreshed, or deleted.
- Before each existing-cache reuse, its normalized `origin` is compared exactly
  with the configured normalized clone URL. The deliberately retargeted cache
  is treated as untrusted, writes exact fixed
  `skillfoo: re-cloning configured Git registry` only to stderr, and causes
  only that hashed directory to be re-cloned. Its origin is verified, and the
  second catalog still contains only `second-source`.
- CLI progress/error output remains within D015's fixed seven-line allowlist and
  exposes neither source URL nor raw Git output. Both consumer repositories are
  byte-identical; isolated external cache creation/replacement is expected.

### Registry diagnostic allowlist is exact and completely exercised

1. Collect the registry-derived stderr lines from the unsafe-source, fake-Git,
   normal Git clone/update, retargeted-cache, and missing-local-registry cases
   above without normalizing, trimming, or rewriting their bytes.

Expected:

- The unique complete-line set is exactly the seven strings in D015: the two
  unsafe-source lines, clone, update, re-clone, fetch failure, and missing-local
  failure. Every string is exercised by a deterministic scenario; none is
  covered only by a source-level assertion.
- Every observed line matches its documented bytes exactly, ends in one
  platform-appropriate captured newline, contains no interpolation, and is at
  most 160 UTF-8 bytes excluding that newline. No eighth registry-derived line
  is public.

### Unknown schema versions are rejected by the consumer example

1. Run the documented minimal consumer/parser example against a captured
   schema 2 result.
2. Change only the captured `schemaVersion` to `999` and run the example again.

Expected:

- The example accepts schema 2 after parsing the entire stdout document.
- It rejects `999` explicitly before interpreting outcomes, records, or
  summary values.
- The documentation does not recommend best-effort parsing of unknown schema
  versions or string matching on human output.

### Package scope and no import API

1. Inspect the installed package manifest and tarball listing.
2. Search the release documentation for supported integration examples.

Expected:

- The manifest exposes the `skillfoo` bin but no supported library entrypoint.
- Documentation tells hosted consumers to pin the exact package and spawn the
  executable; it does not tell them to import `dist/*` or an internal module.
- Deep runtime files exist only because the executable requires them and are
  explicitly unsupported for direct consumption.
- Documentation identifies the configured registry as a trusted instruction
  authority: explicit sync copies its files without semantic sandboxing, and
  lock hashes identify content rather than authenticating its author. It does
  not imply that status approval makes arbitrary registry instructions safe.

### External-action stop

1. Before the release-readiness PR is merged and explicit authorization is
   given, inspect local tags and GitHub/npm release state.

Expected:

- No `v1.0.0` tag, GitHub release, npm publication, npm token, publish secret,
  or automatically firing publication workflow was created by this slice.
- If package ownership, npm authentication, 2FA, or account configuration is
  missing, the maintainer receives exact private-terminal steps and execution
  stops until the human confirms readiness.

## Release manifest, authorized publication, and public verification

Run this section only after the release-readiness PR is merged. Steps 1–5 run
in a credential-free, no-public-write verification context and must stop at the
manifest gate. Steps 6 onward run only after the human explicitly authorizes
the manifest's exact identities and named external actions.

1. Before any tag or GitHub release exists, the human privately confirms npm
   CLI authentication against `https://registry.npmjs.org/`, required 2FA and
   account readiness, and readiness to create an unscoped public package. The
   human shares only a readiness confirmation, never credentials, tokens,
   `.npmrc`, OTPs, or command output.
2. Recheck through the explicit public registry that no public
   `skillfoo@1.0.0` or conflicting package is visible. Treat `E404` only as
   current visibility—not reservation or guaranteed authority—and stop if the
   name is no longer available.
3. Confirm `main` is clean and current, its manifest reports `1.0.0`, all
   required checks pass, and no conflicting `v1.0.0` or npm version exists.
   Record the exact merged commit intended for `v1.0.0`.
4. From a clean detached checkout of that exact commit, build
   `skillfoo-1.0.0.tgz` once into a retained owned release directory. Invoke the
   installed-package verifier in supplied-tarball mode against that absolute
   path; it must not repack or delete the file and must run the complete payload,
   metadata, shim, status, stream, ordering, and exit suite.
5. Emit a structured release manifest containing the exact commit, package
   name/version, intended tag, absolute tarball path and filename, SHA-256, npm
   shasum/integrity, and verification results. Stop with no tag or external
   write. The human explicitly authorizes those exact identities plus tag push,
   draft GitHub release creation/attachment, and npm publication. Any change
   requires rebuilding, reverifying, and obtaining new authorization.
6. In a fresh narrow execution context that reads the approved manifest rather
   than raw repository/review text, recheck equality with external state and
   create/push `v1.0.0` only at the recorded commit. Immediately before draft-
   release attachment, recompute the tarball's SHA-256, npm shasum, and npm
   integrity from its raw bytes and require all three to equal the manifest.
   Create the draft with that exact file plus only safe manifest/checksum fields
   and approved metadata; never attach/expose its private absolute local path.
   Do not repack. Any mismatch stops for rebuild, full verification, new
   manifest, and new authorization.
7. In the already-confirmed private terminal session, immediately recompute and
   compare the same three values, then publish only the approved manifest's
   absolute tarball path when all match. Do not paste its path, authentication
   output, credentials, or checksum-command output into chat/repository files.
   A mismatch stops under the same rebuild/reverify/reauthorize rule.
8. Create a new empty npm cache and an isolated empty user-config file. Confirm
   `npm view skillfoo@1.0.0 --json` with explicit registry
   `https://registry.npmjs.org/` reports the expected version, repository,
   license, bin, engines, shasum, and integrity.
9. Create another empty temporary project and install exact
   `skillfoo@1.0.0` using that explicit public registry, isolated empty cache,
   and isolated non-secret user config.
10. Invoke the registry-installed shim and repeat version, help, schema 2,
   stream, deterministic-ordering, and `0`/`1`/`2`/`3` exit checks.
11. Only after public verification passes, report the exact draft GitHub
    release database/node identifier and URL, the tag/asset/manifest equality
    result, and the public-registry verification result. Stop with the release
    still draft.
12. The human separately and explicitly authorizes public publication of that
    exact draft identifier and URL. This approval does not follow implicitly
    from the earlier tag/draft/npm authorization.
13. In a fresh narrow context, re-read only that authorization and the safe
    release projection, recheck that the draft's tag, identifier, attached
    artifact, and manifest identities are unchanged, and publish only that
    exact draft. Report its final public URL. Any mismatch leaves the draft
    unpublished and stops for investigation; it never triggers repacking or a
    second npm upload.

Expected:

- The approved manifest, Git tag, GitHub release, attached tarball, npm
  metadata, installed package, and `skillfoo --version` all identify `1.0.0`.
- The tag points to the manifest's exact commit, and the attached/published file
  is the exact supplied tarball that passed the full suite before authorization;
  no repack occurred afterward.
- All three approved artifact identities are recomputed and match immediately
  before draft attachment and again immediately before npm publication. The
  public release contains no private absolute local path.
- Registry shasum/integrity match the once-built approved tarball.
- The fresh install uses the public npm registry, not a local cache substitute,
  branch, Git URL, sibling checkout, tarball path, or global link.
- Public verification inherits no user registry override or read cache and
  requires no publish credential.
- The public package reproduces the complete pre-publication acceptance pass.
- The GitHub release remains draft until the second explicit authorization
  names its exact identifier and URL. The final-publication context has no npm
  credential or authority to alter the tag, asset, or release contents.
- The release report includes package/version, tag and GitHub release URL, npm
  package URL, machine-contract documentation path, verification results, and
  any remaining platform or compatibility gaps.

## Persistence / Revisit

1. Delete the disposable installed project and create a new empty one.
2. Reinstall exact `skillfoo@1.0.0` from the same source under test (tarball
   before publication, public registry afterward).
3. Repeat `--version` and one `status --json` changes-available scenario.

Expected:

- Reinstallation produces the same version and machine behavior without any
  state from the prior project or a global link.
- Before publication, the retained tarball identity is unchanged. After
  publication, npm resolves the exact immutable `1.0.0` version.

## Known Non-goals

- Hosted application code or process supervision.
- GitHub-backed hosted sync/resolve writes.
- A supported JavaScript or TypeScript import API.
- Ordinary root-metadata redirect hardening.
- Trusted-publisher automation for the bootstrap release.
- New CLI commands, flags, dependencies, or a CLI framework.

## Not Tested

- The hosted application's own timeout, sandboxing, or process-management
  behavior; it is a separate consumer of this contract.
- npm account ownership, 2FA, and authentication are not exercised by the
  agent or pre-merge UAT. The human privately confirms readiness before tag
  creation and exercises publication only after explicit authorization.
- Platforms outside Node 22/24 on the CI operating-system matrix.

## Pass Criteria

### Local release readiness — required before review and PR

- A candidate tarball built from the complete `release-readiness` commit is
  installed into a fresh project and its npm-created executable passes version,
  semantic help, payload, schema 2, deterministic array ordering,
  stdout/stderr, all seven exact registry diagnostic lines, unsafe-registry
  no-leak/control-safety, legacy-cache non-reuse, no-mutation, and exit
  `0`/`1`/`2`/`3` checks in the local implementation environment. The complete
  intended diff is committed and reviewable against `main`, the CI definition
  assigns the installed-package and release-mode command checks to all six
  Node/OS combinations, and no tag, GitHub release, or npm publication exists.

### Pull-request matrix readiness — required before human merge

- After the release-readiness PR exists, all Node 22/24 by
  Ubuntu/macOS/Windows jobs run repository, installed-package, and release-mode
  command checks and pass, and exact lower-bound `22.0.0`/`24.0.0` Ubuntu jobs
  pass the same checks. A failure returns the slice to implementation,
  local verification, committed-range review, and PR update; it is not waived
  at the merge gate.

### Authorized public release — required only after merge and authorization

- One artifact built once from the exact merged commit recorded for `v1.0.0` is
  fully verified before external authorization, identified in the approved
  manifest, unchanged after the tag is applied to that commit, attached to the
  GitHub release, published by the human, and installed from the public registry
  with matching checksums/integrity. Its npm-created executable reproduces the
  release-readiness contract pass. The exact GitHub draft identifier/URL is
  then separately authorized, identity-rechecked, and made public by a fresh
  narrow context.
