# Discovery: Publish the skillfoo CLI package

**Date:** 2026-07-20
**Branch:** `release-readiness`
**Integration branch:** `main`

## Kickoff brief

Publish an exact tagged, publicly installable `skillfoo` CLI package for a
hosted consumer that pins a package version and spawns the npm-created
`skillfoo` executable. The hosted application will consume the process
contract, especially `skillfoo status --json`; it will not import a supported
library API.

The requested delivery sequence was:

1. Verify, review, package-smoke-test, and merge the existing
   `intentional-local-override` branch as an independent feature PR.
2. From updated `main`, prepare a separate release-readiness PR that documents
   and tests the status JSON contract, chooses the first public version,
   constrains the npm payload, and strengthens package CI across Node 22/24 and
   Linux/macOS/Windows.
3. Stop for explicit human authorization before any tag, GitHub release, or npm
   publication. After authorization and merge, publish the exact tagged
   package and verify a fresh registry installation.

## Verified baseline

The kickoff snapshot was intentionally verified rather than assumed. The
repository had advanced before this slice began:

- `main` and `origin/main` are at `3c7423243dfefdb9cf48e930c20a8fe24795b293`.
- GitHub PR [#8](https://github.com/rawgroundbeef/skillfoo/pull/8), **Add
  intentional local skill overrides**, merged into `main` on 2026-07-19.
- The local and remote `intentional-local-override` branch still point to its
  original three commits. Those commits are not ancestors of the squash merge,
  but the branch and `main` have the identical tree
  `ed3bfd4748e0e5828300b500341ed4e1c414df6b`.
- There is no open PR for `intentional-local-override`. The old branch remains
  untouched.
- The release-readiness branch was created from current, clean `main` only
  after `git pull --ff-only` reported that it was up to date.
- `package.json` and `package-lock.json` report `0.0.1`; `src/cli.ts` also
  hard-codes `0.0.1` for `skillfoo --version`.
- No local Git tags, remote GitHub releases, or npm package named `skillfoo`
  were found. `npm view skillfoo --json` returned public-registry `E404`.
- The current CI runs `npm run check` on Node 22 and 24 across Ubuntu, macOS,
  and Windows. Its separate package job only runs `npm pack --dry-run` on
  Ubuntu/Node 24; it does not install or invoke the packed executable.
- A current `npm pack --dry-run --json` builds from clean `dist/` and reports a
  35-entry `skillfoo@0.0.1` package. It contains `package.json`, `README.md`,
  `LICENSE`, 16 compiled JavaScript files, and 16 source maps. npm always
  includes package metadata, README, LICENSE, and declared bin files; the
  release slice must decide whether source maps are required runtime payload.
- Package metadata currently omits an SPDX `license`, `repository`, `homepage`,
  and `bugs` declaration. The repository has an MIT `LICENSE` file.
- `dist/entrypoint.js` has the Node shebang and delegates to `run()`;
  `package.json` maps the `skillfoo` bin to that file.

## Existing status behavior

`src/status.ts`, `src/cli.ts`, and the compiled CLI tests establish the current
behavior:

- Successful `status --json` output has `schemaVersion: 2` and top-level keys
  in this order: `schemaVersion`, `outcome`, `registry`, `emit`, `skills`,
  `projections`, `summary`.
- Skills use case-sensitive ECMAScript relational comparison of original names
  in UTF-16 code-unit order. The `agents_md` projection precedes Claude adapter
  projections, which use the same skill-name comparator.
- JSON rendering uses two-space indentation and a trailing newline is added by
  the CLI stdout writer.
- Registry progress is supplied to the status planner through stderr. Usage and
  operational failures also use stderr. A successful JSON result is the only
  content written to stdout.
- Exit `0` means `converged`, `2` means `changes_available`, `3` means
  `attention_required`, and `1` is reserved by the CLI for usage or operational
  failure.
- Tests cover schema 2, sorted skills/projections, all reconciliation outcome
  exits, successful JSON parsing, and ordinary stream cleanliness. They invoke
  `dist/entrypoint.js` with Node, not the executable shim produced by installing
  the npm tarball.

## Review tooling installed during planning

During planning, the user requested that the shared `threat-model` skill be
added through skillfoo itself so it could be applied to the v1 review. The
source registry frontmatter defect discovered during that sync was fixed and
pushed as `rawgroundbeef/skills@c0e28cd`; a second ordinary sync converged.

The resulting repository-tooling state is:

- `.skillfoo.yml` selects `threat-model`;
- `.skillfoo.lock` records source `github.com/rawgroundbeef/skills` and managed
  directory hash
  `sha256:940a63d48473687f9761e1d8cae65f51b502ac6c204d950b9e85d051838458c7`;
- `.agents/skills/threat-model/` contains `SKILL.md`, `README.md`, and the two
  referenced threat-model documents exactly as synced;
- `AGENTS.md` contains a non-empty managed link/description; and
- `.claude/skills/threat-model` is the managed symlink to
  `../../.agents/skills/threat-model`.

These are intentional repository review-tooling changes, not public v1 package
requirements. Preserve them and review their own diff for ordinary generated-
state correctness, but do not make their lock hash, file projection, or adapter
layout part of the CLI release contract or user-facing package UAT. Their
security findings remain applied through `threat-model.md`, D015, D020, D021,
and D022.

## Refined problem statement

The repository contains a working CLI and a versioned JSON representation, but
it does not yet make a public release artifact the tested integration boundary.
Before a hosted application can safely pin and spawn `skillfoo`, maintainers
need one exact package version whose tag, manifest, tarball contents,
npm-installed executable, status JSON semantics, stream discipline, and exit
statuses all agree and are enforced in CI.

## Constraints

- Preserve command behavior while documenting and testing the existing
  contract.
- Do not expose `src/cli.ts` or any other internal module as a supported
  importable API. The executable/process boundary is the public integration
  surface.
- Keep `schemaVersion: 2`; consumers must reject unknown schema versions.
- Define schema-version increments versus backward-compatible additions before
  publication.
- Build package evidence from clean output and test the npm-installed shim in
  an empty temporary project.
- Support the Node 22 and 24 LTS majors on Ubuntu, macOS, and Windows. Do not
  claim untested odd-numbered or future Node majors through an open-ended
  engine range.
- Package only required compiled runtime plus npm-required package metadata,
  README/license material, and no repository/test/planning source.
- Do not add dependencies or a CLI framework without demonstrated need.
- Do not change ordinary root-metadata redirect behavior in this slice. The
  existing gap remains documented in
  `../0006-intentional-local-override/follow-ups.md`.
- Do not create a tag, GitHub release, or npm publication without explicit
  human authorization after the release-readiness PR is merged.
- Do not request, expose, copy, or log npm credentials. Authentication or npm
  account setup is a human action with exact instructions and a wait gate.

## Non-goals

- Hosted application implementation.
- GitHub writes or hosted sync/resolve behavior.
- A supported JavaScript/TypeScript library API.
- Ordinary root-metadata redirect hardening.
- Publishing a branch, sibling checkout, global link, or otherwise unpublished
  artifact as a production substitute.
- Any tag, release, or registry mutation during release-readiness planning or
  PR implementation.

## Open questions

- None. The kickoff brief and grill resolve the slice's product and release
  boundaries.

## Resolved during the grill

- The first public release is `skillfoo@1.0.0`, tagged `v1.0.0`. Version 1
  marks the documented executable and machine contract as intentional without
  claiming that the product is feature-complete.
- Breaking the supported executable or `status --json` contract requires a
  package major version. Backward-compatible features use a minor version and
  contract-preserving fixes use a patch version.
- Source maps are excluded from the deliberately minimal package. They are not
  required to execute the CLI, and the kickoff brief limits the payload to the
  compiled runtime, license, and package metadata/documentation.
- The one-time first publication uses the exact tarball built and verified from
  tag `v1.0.0`. Its checksum is recorded and the tarball is attached to the
  GitHub release. Before the tag exists, the human privately confirms npm CLI,
  account, and 2FA readiness; after explicit publication authorization, the
  human publishes that same file outside agent-visible credential state. A
  fresh project then installs
  `skillfoo@1.0.0` from the public registry and verifies it. Tokenless trusted
  publishing is deferred until the package exists.
- JSON compatibility is structural. Skill and projection arrays have stable
  semantic ordering, and repeated output from one build is deterministic, but
  consumers must not depend on object-key order, indentation, or the trailing
  newline. Those formatting details are current behavior, not schema surface.
- Help is a semantic interface: it exits `0` on stdout, keeps stderr empty, and
  describes supported commands/options. Exact prose and whitespace are not a
  compatibility promise.

## Evidence paths

- `package.json` and `package-lock.json` — package identity, bin, version,
  payload allowlist, scripts, engines, and dependency metadata.
- `src/entrypoint.ts`, `src/cli.ts`, and `src/status.ts` — executable, version,
  stream, JSON, ordering, and exit behavior.
- `test/cli.test.ts` and `test/status.test.ts` — existing process and schema
  coverage.
- `.github/workflows/ci.yml` — existing Node/OS test matrix and shallow package
  dry run.
- `README.md` — current install guidance and brief status JSON description.
- `.planning/0006-intentional-local-override/` — the merged feature's approved
  requirements, UAT, implementation prompt, and follow-ups.

## Adversarial-review discoveries

- Configuration currently accepts any non-empty registry string. Status schema
  2 copies that string to JSON, while Git registry progress and terminal errors
  copy the derived clone URL to stderr. An HTTP(S) source with embedded
  credentials or a credential-like query can therefore leak into the exact
  process streams the hosted consumer will capture. This must be corrected
  before the behavior is frozen as 1.0/schema 2.
- “Read-only status” currently means the consumer repository is not mutated.
  A Git-backed registry still performs network access and may delete, clone,
  fetch, and hard-reset skillfoo's registry cache. The public contract must not
  imply process-wide side-effect freedom.
- The renderer's “lexical” ordering is the case-sensitive ECMAScript relational
  comparison of original strings by UTF-16 code units. Valid skill names can be
  mixed-case or non-ASCII, so locale collation or normalization would produce a
  different public order.
- Testing matrix labels `22` and `24` select the latest patch in each major;
  they do not exercise the lower bounds admitted by
  `^22.0.0 || ^24.0.0`. Exact minimum jobs are required in addition to the
  six latest-patch Node/OS combinations.
- A registry `E404` proves only that no public package is visible. It does not
  prove npm account readiness, 2FA readiness, authority to create an unscoped
  package, or immunity from a first-publish name race.
- A configured skills registry is a trusted instruction authority, not merely
  inert content: explicit sync writes registry-authored `SKILL.md` files that a
  downstream agent may follow. Lock hashes establish content identity for
  reconciliation but do not authenticate the registry author. The first public
  release must document this trust boundary; signing/pinning is a later slice.
- Registry config and Git stderr are attacker-controlled terminal inputs in
  addition to possible secret carriers. Safe registry validation/display must
  reject control characters before access and strip control data plus bound
  Git-derived diagnostics.
- The release agent is itself on a source-to-publication path. Planning,
  implementation, CI, and review must have no npm credentials or automatic
  publication capability; only a separate explicitly authorized release
  context may reach tag/release sinks, and the human owns the npm publish sink.
- A verifier that packs and deletes its own temporary artifact does not prove a
  separately rebuilt release file. The final once-built tarball must be
  retained, supplied back to the complete verifier without repacking, and bound
  to a structured manifest before exact external-action authorization.
- Loaded unsafe config is attacker-supplied pre-existing input. Read-only
  rejection must preserve it byte-for-byte; no-leak assertions apply to process
  streams, caches, and newly created paths/files. Unsafe init creates no config.
- Sanitizing or truncating arbitrary Git stderr cannot guarantee secret-free
  output. The public process boundary must discard raw Git/helper/remote stderr
  and select fixed non-interpolated registry lines with an exact byte limit.
- Temporal “authorize later” wording alone does not separate untrusted analysis
  from public writes. A no-public-write context emits the exact verified release
  manifest, then a fresh narrow context may apply only the human-approved
  manifest identities/actions and must stop on mismatch.
- Git registry cache directories currently use a lossy readable slug. Distinct
  configured sources such as `file:///…/a-b` and `file:///…/a/b` can collide,
  and an existing `.git` directory is reused without checking its `origin`.
  This was reproduced: priming the first source caused the second to return the
  first registry's skills, creating a source-to-agent-instruction substitution
  path. Cache keys must bind collision-resistantly to the exact normalized clone
  URL, and every existing cache must prove a matching origin before reuse.
- Manifest-time hashing alone does not protect the later attachment and npm
  sinks from local file replacement. The approved SHA-256, npm shasum, and npm
  integrity must be recomputed and compared immediately before each sink; a
  mismatch requires a fresh build, full supplied-file verification, manifest,
  and authorization.
