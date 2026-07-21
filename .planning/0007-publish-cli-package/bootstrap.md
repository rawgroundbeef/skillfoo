# Bootstrap: Publish the skillfoo CLI package

Prepare the first public skillfoo release as exact `skillfoo@1.0.0`, with the
installed npm executable as the supported integration boundary and a
documented, tested `skillfoo status --json` schema 2 contract. Work only on
release readiness in this context. Do not create a tag, GitHub release, or npm
publication.

## Read order

1. `AGENTS.md` — repository skills and local operating conventions.
2. `.planning/0007-publish-cli-package/discovery.md` — original kickoff,
   verified post-merge baseline, current package evidence, constraints, and
   non-goals.
3. `.planning/0007-publish-cli-package/decisions.md` — accepted version,
   package, contract, branch, credential, and publication decisions.
4. `docs/adr/0002-publish-the-cli-process-contract.md` — durable public
   boundary and SemVer/schema compatibility commitment.
5. `.planning/0007-publish-cli-package/threat-model.md` — assets, source-to-sink
   paths, ranked release/registry risks, controls, and accepted residual gaps.
6. `.planning/0007-publish-cli-package/uat.md` — human-approved outside-in
   behavior and external-action gate.
7. `.planning/0007-publish-cli-package/prd.md` — product stories, module shape,
   implementation decisions, tests, and exclusions.
8. `.planning/0007-publish-cli-package/follow-ups.md` — deferred release
   automation, environment notes, and cross-reference to the existing
   root-metadata gap.
9. `CONTEXT.md` and `docs/adr/0001-live-local-overrides.md` — existing
   reconciliation language and behavior that the package release must preserve.

Load the repository `typescript-cli` skill and its engineering reference before
editing package, executable, smoke-test, or CI behavior. Use the repository
`review` skill for the required fresh final review. Use the `pr` skill only
after implementation is approved and the user asks to open the release-readiness
pull request or the slice workflow reaches that authorized step.

## Branch and delivery sequence

- PR #8 already squash-merged the complete `intentional-local-override` tree
  into `main`. Its original three-commit branch is intentionally preserved and
  has the same tree as the merged main commit. Do not amend, reset, rebase,
  delete, or add release work to it.
- Slice implementation belongs on `release-readiness`, created cleanly from
  current `main` at `3c7423243dfefdb9cf48e930c20a8fe24795b293`.
- Deliver one release-readiness PR against `main`. That PR may contain package
  metadata, docs, tests, CI, the release runbook, planning artifacts, and ADR
  0002. Preserve the user-requested `threat-model` installation as repository
  review tooling and keep its generated-state diff separately reviewable; it is
  not a package requirement or UAT criterion. The range must contain no external
  release action or auto-publish workflow.
- After opening the PR, wait only for its required CI checks. Once all six
  latest-patch Node/OS jobs and both exact-lower-bound Ubuntu jobs pass, report
  the PR and stop until a human merges it. Merge alone is not
  publication authorization. After merge, a no-public-write context builds and
  fully verifies the retained final tarball and emits its manifest. Only exact
  human authorization of that manifest permits a fresh narrow context to apply
  `v1.0.0` and a draft release, followed by human npm publication, isolated
  public verification, and final GitHub-release publication.

## Decisions that must not be violated

- The first public identity is package `skillfoo`, version `1.0.0`, intended
  tag `v1.0.0`.
- The public API is the exact package plus npm-installed `skillfoo` process:
  argv, stdout, stderr, exit status, and documented machine output. Do not add
  a supported library entrypoint, declarations, `main`, or public exports.
- Preserve current command behavior, built-in argument parsing, ESM, TypeScript
  compilation, Node test runner, and runtime dependencies. Add no dependency,
  CLI framework, bundler, prompt, telemetry, color, or update check.
- Successful `status --json` stdout is one undecorated JSON document.
  Diagnostics and registry progress use stderr. Exits are `0` converged, `2`
  safe changes available, `3` attention required, and `1` usage/operational
  failure.
- Keep `schemaVersion: 2`, deterministic skill/projection ordering, current
  outcome precedence, and current JSON meanings. Consumers must reject unknown
  schema versions and ignore unknown object keys in a known schema.
- Preserve case-sensitive ECMAScript relational ordering of unnormalized skill
  names in UTF-16 code-unit order. Do not replace it with locale collation,
  normalization, or case folding. The repository index projection remains
  first and adapters use the same name comparator.
- JSON compatibility is structural. Object-key order, indentation, and trailing
  whitespace are not schema surface, although repeated output from one build
  remains deterministic. Exact help prose/whitespace is likewise not API;
  command/option discoverability, exit `0`, stdout, and empty stderr are.
- A breaking process change needs a package major release. A breaking JSON
  shape/meaning additionally needs a schema-version increment. Optional object
  fields or counters that preserve all meanings may be backward-compatible
  schema 2 additions.
- The npm payload contains only required compiled `.js` runtime, `package.json`,
  `README.md`, and `LICENSE`. Exclude `.js.map`, `.ts`, tests, planning, CI,
  lockfiles, credentials, local config, and repository metadata.
- Declare Node support as `^22.0.0 || ^24.0.0`. CI must exercise both LTS majors
  across Ubuntu, macOS, and Windows plus exact `22.0.0` and `24.0.0` Ubuntu
  lower-bound jobs; do not claim untested odd-numbered or future majors.
- Before config creation, registry access, cache mutation, or consumer writes,
  reject HTTP(S) and `file://` registry URLs with userinfo, query, or fragment,
  and reject `ssh://` URLs with a password, query, or fragment. Allow ordinary
  SSH usernames and credential-free local/remote Git forms. Validate every
  non-local Git source as the exact URL passed to Git after semantic expansion,
  including hosted/generic shorthands and `git@host:path`, and reject unsupported
  scheme-like sources. Never echo the rejected URL or sensitive components; use
  out-of-band Git authentication.
- Treat every registry source and Git diagnostic as untrusted terminal data.
  Reject control characters before classification or output. Never relay raw
  Git/helper/remote stderr or interpolate registry/external text into progress
  or failure output. Use only fixed allowlisted registry lines, each at most 160
  UTF-8 bytes excluding newline; unexpected failures map to the generic fixed
  failure. Implement the seven exact complete lines enumerated in D015.
- Document that a configured registry is a trusted agent-instruction authority:
  explicit sync copies its files without semantic sandboxing, and lock hashes
  prove content identity rather than author authenticity. Add no automatic or
  hosted sync, signing, or provenance system in this release.
- `status` is read-only for the consumer repository. Local-path status has no
  network/cache effect, while Git-backed status may access the network and
  create or refresh skillfoo's external registry cache; document and test that
  distinction.
- Bind Git cache identity to the full SHA-256 of the exact normalized clone URL
  after shorthand expansion. Do not reuse legacy slug-only caches. Verify the
  normalized cached `origin` equals the configured identity before every reuse;
  missing/mismatch evidence re-clones only that hashed directory and verifies
  it before catalog reads.
- Do not repair ordinary root-metadata redirects. The existing issue remains in
  `.planning/0006-intentional-local-override/follow-ups.md`.
- Do not create or request npm credentials. Never read, print, copy, or commit
  `.npmrc` or authentication output.
- Before any authorized tag exists, require the human to confirm npm CLI,
  2FA/account, and unscoped public-package readiness privately, and recheck the
  explicit public registry. An `E404` is not a reservation. After publication,
  verify with `https://registry.npmjs.org/`, a fresh empty cache, and an
  isolated non-secret user config.
- After merge, build and fully verify one retained supplied tarball in a
  no-public-write context, then emit a structured manifest binding commit,
  intended tag, package/version, absolute path/filename, SHA-256, npm
  shasum/integrity, and results. Stop for exact human authorization. A fresh
  narrow context may only apply that manifest's tag and draft release; no later
  step may repack, and the human publishes the recorded file. After isolated
  public verification, report the exact still-draft GitHub release identifier
  and URL and stop again. Only a second explicit authorization of that exact
  draft permits another fresh narrow context to identity-check and publish it.

## Verified implementation pointers

- `package.json` currently names `skillfoo@0.0.1`, maps the `skillfoo` bin to
  `dist/entrypoint.js`, allowlists `dist`, declares Node `>=22`, and runs a clean
  TypeScript build in `prepack`. Add the accepted public version and complete
  MIT/repository/homepage/issues metadata while retaining the bin and ESM
  shape. Replace the open-ended engine value with `^22.0.0 || ^24.0.0`.
  Consider explicit public publish metadata, but add no publish script that can
  mutate npm state.
- The root package record in `package-lock.json` also reports `0.0.1`; keep the
  lockfile identity aligned through the package manager rather than hand-editing
  only one version location.
- `src/cli.ts` currently owns the `0.0.1` value rendered by `--version`; update
  it and its compiled-process expectation. Avoid a broad runtime version-loader
  refactor unless it demonstrably reduces risk. The package verifier must fail
  whenever manifest, filename, installed output, or expected version diverge.
- `src/entrypoint.ts` already has `#!/usr/bin/env node`, awaits `run()`, and
  assigns `process.exitCode`. Preserve this thin entrypoint.
- `src/status.ts` currently renders schema 2 and exposes the configured
  registry string in JSON. Its `compareNames` implementation uses JavaScript
  `<`/`>` on original strings; it places the `agents_md` projection before
  Claude adapters, emits summary data, and maps outcomes to exits `0`/`2`/`3`.
  Preserve that exact comparator and behavior while preventing rejected
  registry values from reaching output.
- `src/config.ts` currently checks only that `registry` is a non-empty string
  while loading and rendering config. Add the shared safe registry-source
  boundary here or in a focused module used by both paths, including init,
  before a rejected value can be written or accessed.
- `src/registry.ts` currently derives clone URLs, includes them in progress and
  Git errors, creates cache paths through a lossy slug, and reuses any existing
  `.git` directory without checking `origin`. Distinct sources ending `a-b` and
  `a/b` were reproduced colliding and returning the wrong catalog. Add D015's
  fixed output plus D022's digest identity/origin verification while retaining
  documented external cache behavior for accepted Git sources.
- `src/skill-name.ts` permits mixed-case and non-ASCII names. Package/renderer
  fixtures must include such names so a locale-aware sort cannot accidentally
  replace the documented ECMAScript comparator.
- `src/cli.ts` already passes the status registry reporter to stderr, prints
  successful JSON through stdout, and renders failures through stderr with exit
  `1`. Existing tests cover local-registry stream cleanliness but the packaged
  executable needs progress and failure proof.
- `test/status.test.ts` structurally covers schema 2, summaries, overrides, and
  deterministic skill/projection order. Extend only where the documented
  public contract is not yet explicit.
- `test/cli.test.ts` currently spawns `dist/entrypoint.js` through Node. Retain
  those process tests, but do not treat them as package proof.
- `tsconfig.build.json` currently emits source maps. Disable package-build map
  emission so the `files: ["dist"]` allowlist contains only runtime JavaScript,
  then assert the actual tarball entries.
- `.github/workflows/ci.yml` already has a six-entry latest-patch Node/OS test
  matrix. Its separate Ubuntu/Node 24 package job only runs a dry pack. Run the
  real installed-package verifier in the full matrix, add exact `22.0.0` and
  `24.0.0` Ubuntu lower-bound jobs, and remove the redundant weaker package-only
  signal.
- The verified pre-slice `npm pack --dry-run --json` produced 35 entries:
  manifest, README, LICENSE, 16 runtime JavaScript files, and 16 source maps.
  The new check should retain the required 19 non-map entries unless runtime
  module count changes intentionally and remains reachable from the installed
  executable.
- The current working projection intentionally adds `threat-model` to
  `.skillfoo.yml`; records source `github.com/rawgroundbeef/skills` and
  `sha256:940a63d48473687f9761e1d8cae65f51b502ac6c204d950b9e85d051838458c7`
  in `.skillfoo.lock`; syncs exactly `SKILL.md`, `README.md`, and the two
  referenced files; adds the non-empty managed `AGENTS.md` row; and points
  `.claude/skills/threat-model` to `../../.agents/skills/threat-model`.
  Preserve this installed review tooling and use it in the security/review
  passes. Keep its repository diff logically separate from package behavior;
  do not promote its exact generated state into release acceptance.

## Implementation shape

1. Update package/lock/CLI release identity to `1.0.0`, add public npm metadata,
   keep exactly one bin, and prevent source maps from entering clean build
   output.
2. Add a shared parsed registry-source validator and fixed registry-output
   boundary. Apply validation to loaded config and init/config creation before
   network, output, cache, or file mutation; retain accepted credential-free
   forms and add no-leak tests for userinfo/query/fragment/control sentinels.
   Discard raw Git/helper/remote stderr. Map progress/errors to fixed,
   non-interpolated allowlisted lines no longer than 160 UTF-8 bytes excluding
   newline, with every unexpected failure using the generic fixed line. Provide
   deterministic installed-process triggers for all seven exact D015 lines and
   fail on any byte difference or additional public registry line.
3. Add `docs/status-json-v2.md`. Document every top-level object and nested
   record, current enums and optional fields, deterministic ordering, stdout and
   stderr behavior, exits, consumer-repository read-only scope and Git-cache
   effects, unknown-version rejection,
   backward-compatible additions, schema breaks, and the package-SemVer
   relationship. Include a minimal spawn/parse pattern without presenting an
   import API.
4. Update README install and status guidance to use an exact public package
   example and link the full machine-contract document. State that configured
   registries are trusted instruction authorities whose files explicit sync
   copies without semantic sandboxing; lock hashes are not author signatures.
   Do not claim publication has already occurred while preparing the PR.
5. Add a dependency-free cross-platform Node package verifier, preferably under
   `scripts/`, exposed as `npm run test:package`. It must:
   - pack into an owned temporary directory so no tarball is left in the repo;
   - rely on the existing prepack clean build and parse `npm pack --json`;
   - assert exact package identity, metadata, bin, engine, and payload allowlist;
   - initialize an empty project and install the absolute tarball path;
   - invoke npm's installed shim rather than source or a global command;
   - assert exact version output and semantic help content/stream placement;
   - create disposable local registry/consumer fixtures for exits `2`, `0`, and
     `3`, structural schema 2 JSON, ordering, repeated-output stability, and
     status no-mutation;
   - use mixed-case/non-ASCII skill names to assert the exact ECMAScript
     UTF-16 comparator;
   - assert exit `1`, empty stdout, and diagnostic stderr for usage/operational
     failure;
   - assert credential-bearing/query/fragment registry sources fail before
     access or writes and that sentinel values never appear in either stream or
     any created path/file;
   - make a controlled fake Git emit oversized secret/control sentinel output,
     discard it, and expose only fixed non-interpolated registry lines no longer
     than 160 UTF-8 bytes;
   - exercise and byte-compare all seven D015 lines: credential rejection,
     control rejection, clone, update, re-clone, fetch failure, and missing
     local registry; fail if any other registry-derived line is exposed;
   - create a disposable `file://` Git registry plus isolated cache/home and
     prove clone/update progress is only on stderr, the consumer is unchanged,
     and the external skillfoo cache is created/refreshed as documented;
   - use old-slug-colliding `file://` registries with distinct catalogs, preseed
     their valid shared legacy-slug cache with a third catalog, and prove the
     legacy directory remains byte-identical and cannot affect resolution;
     also prove full-digest cache separation, exact origin verification, safe
     re-clone of a deliberately retargeted hashed cache, and consumer
     immutability;
   - use argument arrays and controlled executable paths, handle npm's Windows
     shim safely, and clean all temporary state in success or failure.
   Default CI mode builds/cleans its own temporary tarball. A
   `--tarball <absolute>` mode must instead run the identical full suite against
   that supplied file without packing, deleting, or mutating it, and may emit a
   structured release manifest after success.
   The manifest checker must recompute SHA-256, npm shasum, and npm integrity
   from raw bytes immediately before both draft attachment and human npm
   publication. Mismatch stops for a new build, full verification, manifest,
   and authorization; public manifest/checksum data omits the absolute path.
6. Add targeted unit/process assertions only where the package verifier or
   contract doc exposes a real gap. Add a documented consumer guard test for
   schema 2 acceptance and unknown-version rejection.
7. Run `npm run test:package` in every existing Node 22/24 and OS matrix job,
   add exact `22.0.0`/`24.0.0` Ubuntu jobs that run repository and package
   checks, and remove the standalone dry-run package job.
8. Add `docs/releasing.md` with separate pre-merge; post-merge credential-free,
   no-public-write artifact build/verification; structured-manifest approval;
   narrow tag/draft-release execution; private human npm publication of the
   already-tested file; isolated public install; and final GitHub-release
   publication phases. Prohibit repacking after manifest creation and stop on
   every identity mismatch. Require all three manifest hashes immediately
   before both artifact sinks and expose no private absolute path. After public
   npm verification, require a second explicit authorization naming the exact
   draft identifier/URL and a fresh narrow equality check before making that
   draft public. Do not add a publishing workflow.
9. Preserve the installed threat-model repository tooling as a separate
   preparatory change and use the skill in the security and final review passes.
   Its generated projection is ordinary reviewable repository state, not a
   package behavior or UAT gate.
10. Keep discovery, decisions, approved UAT, PRD, follow-ups, bootstrap, and ADR
   coherent with the final implementation. Update an upstream artifact if the
   implementation reveals a true decision mismatch; do not rely on remembered
   conversation.

## Required verification

Run from the repository root and address failures at their owning layer:

1. `git diff --check` while implementing, including the staged diff before the
   final commit.
2. `npm run check`
3. `npm run test:package`
4. `npm pack --json --pack-destination <temporary-directory>` and inspect the
   real manifest, shasum, integrity, and entries; do not leave the tarball in
   the repository.
   This pre-PR candidate is not the later release artifact. The release runbook
   separately requires supplied-tarball verification of the once-built retained
   final file before manifest authorization and forbids a later repack.
5. Inspect `git status --short`, ensure every intended slice file is tracked,
   then create an intentional release-readiness implementation commit containing
   the complete planning, ADR, metadata, documentation, test, and CI diff. Do
   not leave unstaged or untracked slice work outside that commit.
6. Run `git diff --check main...HEAD` and inspect the complete `main...HEAD`
   diff after the commit.
7. Run only the pre-publication sections and **Local release readiness** pass
   criterion in `.planning/0007-publish-cli-package/uat.md` against a disposable
   registry and consumer outside this repository. The pull-request matrix does
   not exist yet, and the **Authorized public release** section/criterion is
   intentionally impossible and forbidden before merge.
8. Spawn a fresh-context reviewer using the repository `review` skill against
   the committed `main...HEAD` range. Address every **Request changes** finding
   in follow-up commits, rerun verification, and repeat fresh review over the
   updated range until it returns **APPROVE**.
9. Use the repository `pr` skill to open the release-readiness PR only after the
   review approves. The PR is not authorization to tag, release, or publish.
10. Wait for the PR's six latest-patch Node/OS jobs and two exact-lower-bound
    Ubuntu jobs, and require the **Pull-request matrix readiness** criterion. If
    a job fails, return to implementation, commit the fix, rerun local
    verification and fresh review, and update the PR. Once all eight checks
    pass, report the PR and stop for human merge. Do not proceed to any release
    action.

CI must independently pass the six Node 22/24 by Ubuntu/macOS/Windows
latest-patch combinations plus exact `22.0.0` and `24.0.0` Ubuntu lower-bound
jobs, all with repository checks and installed-package verification.

## Environment gotchas

- The managed local sandbox previously could not write the user's npm cache;
  host-cache access made the dry pack succeed. The verifier should own temporary
  package/project paths and set isolated npm cache and user-config paths to
  avoid relying on machine-global permissions, content, registry overrides, or
  authentication.
- Package lifecycle logging can precede or accompany JSON depending on npm
  verbosity. Invoke pack with a controlled quiet/loglevel configuration and
  parse its complete machine result without brittle last-line guessing.
- npm creates a POSIX shim and a Windows `.cmd` wrapper. Prove the npm-created
  executable on both platforms; do not replace that check with
  `node dist/entrypoint.js`.
- Temporary fixture paths should include spaces and non-ASCII characters.
- A local `file://` Git registry exercises real progress routing without
  external network access. Give it throwaway per-command author settings and an
  isolated skillfoo registry cache/home.
- Do not run sync or conflict fixture mutation in the skillfoo repository.

## Out of scope and follow-ups

- Hosted application behavior or deployment.
- Supported module imports, declaration files, CommonJS, or bundling.
- New CLI behavior, dependencies, frameworks, telemetry, or update checks.
- Ordinary root-metadata redirect hardening.
- Automatic migration or broad deletion of legacy lossy-slug registry caches;
  stop reading them and document manual cleanup.
- Trusted publishing, provenance, staging, release bots, and automatic publish
  workflows. These remain a follow-up after the package exists.
- npm account/authentication mutation or credential inspection in the
  implementation context; the release runbook still requires a private human
  readiness confirmation before any tag.
- Any tag, GitHub release, npm publish, or public-registry mutation before the
  release-readiness PR merges and a human explicitly authorizes the exact
  external action.

Execute from these documents, not from conversation memory. If code evidence
contradicts an artifact, fix the upstream artifact and re-establish coherence
before implementation proceeds.
