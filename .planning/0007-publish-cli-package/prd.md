# PRD: Publish the skillfoo CLI package

**Date:** 2026-07-20
**Status:** Ready for implementation after artifact-review PASS

## Problem Statement

Skillfoo has a functioning TypeScript CLI and an existing schema 2 status JSON
representation, but it has never been published to npm and does not yet treat
an installed package as the tested public integration boundary. The current
development version is duplicated across package metadata and CLI output, the
package payload includes non-runtime source maps, the machine contract is only
briefly described, and CI invokes compiled source rather than the executable
shim npm creates for consumers. Configuration also accepts credential-bearing
or terminal-control registry inputs that can be repeated in status JSON or Git
diagnostics, and current “read-only” wording does not disclose Git-backed
registry cache and network effects. Public guidance does not yet say plainly
that registry-authored skill files become trusted instructions for downstream
agents after explicit sync. Git registry cache identity also uses a lossy slug
and trusts any existing `.git` directory without confirming its origin, so two
different configured sources can substitute one registry catalog for another.

The hosted application needs to pin one exact public package version and spawn
its `skillfoo` executable. Without a tagged, verifiably identical npm artifact
and a durable contract for arguments, streams, JSON, ordering, and exit
statuses, the hosted consumer cannot safely distinguish compatible results
from packaging drift or a breaking machine-output change.

## Solution

Prepare `skillfoo@1.0.0` as the first intentional public release without
changing existing command behavior. The release-readiness pull request will
make the npm package and installed executable the outside-in verification
surface, publish complete package metadata with a minimal compiled-runtime
payload, document `status --json` schema 2 and its evolution rules, and run the
installed-package smoke test across Node 22/24 on Linux, macOS, and Windows.
The public engine range will name those tested LTS majors rather than every
future Node release above a minimum, with exact lower-bound jobs proving the
declared range.

Before freezing schema 2, reject embedded remote-registry authentication,
credential-like URL components, and registry control characters before output,
network, or config writes. Discard raw Git/helper/remote stderr and expose only
fixed, non-interpolated registry lines no longer than 160 UTF-8 bytes. Preserve
credential-free registry behavior and use out-of-band Git authentication.
Document that status never mutates the consumer repository
while Git-backed status may refresh skillfoo's external registry cache, and
that a configured registry is a trusted instruction authority rather than a
sandboxed content feed. Bind each Git cache directory to the full SHA-256 of its
exact normalized clone URL and verify a matching normalized `origin` before
every reuse.

The supported public integration will be the exact package and its spawned
`skillfoo` process. Internal modules remain unsupported and no importable
library API is introduced. The release-readiness work will include a human
runbook but no publishing automation. Tagging, GitHub release creation, and npm
publication remain blocked until the pull request is merged and the human
explicitly authorizes those external actions.

After merge, a no-public-write context will build one retained tarball from the
exact merged commit intended for `v1.0.0`, fully verify that supplied file, and
emit a structured manifest binding its commit, version/tag, path, checksums,
integrity, and results. Only after the human privately confirms npm readiness
and authorizes those exact identities/actions may a fresh narrow context push
the recorded tag and create a draft release. The human publishes the unchanged
file; an isolated public-registry reinstall repeats acceptance before the
operator reports the exact draft GitHub release identifier and URL and stops.
The human must separately authorize public publication of that exact draft;
only then may another fresh narrow context recheck its identities and make it
public.

## User Stories

1. > As a CLI user, I want to install `skillfoo@1.0.0` from npm, so that I do
   > not need a source checkout, branch dependency, sibling repository, or
   > global link.

2. > As a hosted-application maintainer, I want to pin one exact package
   > version and spawn its npm-created executable, so that deployment does not
   > depend on internal source layout or an unsupported library API.

3. > As a hosted-application maintainer, I want `skillfoo --version` to agree
   > with the package manifest, tarball, Git tag, and GitHub release, so that I
   > can prove which executable is running.

4. > As an automation consumer, I want successful `status --json` stdout to be
   > exactly one valid JSON document, so that I can parse the entire stream
   > without removing progress or prose.

5. > As an automation consumer, I want diagnostics and registry progress on
   > stderr, so that operational context remains available without corrupting
   > JSON stdout.

6. > As an automation consumer, I want exit `0` to mean converged, so that I
   > can continue without scheduling reconciliation.

7. > As an automation consumer, I want exit `2` to mean ordinary safe changes
   > are available, so that I can distinguish actionable reconciliation from
   > convergence and conflict.

8. > As an automation consumer, I want exit `3` to mean attention is required,
   > so that I can stop and surface preserved conflicts rather than applying an
   > unsafe assumption.

9. > As an automation consumer, I want exit `1` reserved for usage or
   > operational failure with no JSON on stdout, so that a failed invocation
   > cannot be mistaken for a repository outcome.

10. > As an automation consumer, I want schema version 2 records and arrays in
    > deterministic order, so that repeated observations are stable and
    > reviewable without treating JSON object formatting as semantic API.

11. > As an automation consumer, I want to reject unknown schema versions
    > before interpreting their contents, so that incompatible meanings never
    > degrade into a plausible but incorrect result.

12. > As a future CLI maintainer, I want explicit schema evolution rules, so
    > that I know when a JSON addition is compatible and when both schema and
    > package major versions must change.

13. > As a package consumer, I want the tarball limited to compiled runtime,
    > manifest, README, and license material, so that tests, planning files,
    > source maps, credentials, and repository metadata are not distributed.

14. > As a package consumer, I want complete license, repository, issue, home,
    > runtime, and executable metadata, so that npm accurately describes what
    > is installed and where it is maintained.

15. > As a maintainer, I want a dependency-free cross-platform package smoke
    > harness, so that the release contract is tested without introducing a CLI
    > framework or packaging-only runtime dependency.

16. > As a maintainer, I want every supported Node/OS CI combination to create,
    > install, and invoke the tarball, so that Unix-only executable assumptions
    > or minimum-runtime regressions block the release-readiness PR.

17. > As a maintainer, I want package verification to start from clean build
    > output and use temporary projects, so that stale `dist` files or a global
    > installation cannot produce a false pass.

18. > As a release operator, I want one approved tarball's SHA-256, npm shasum,
    > and npm integrity associated with its tag and GitHub release, so that the
    > public npm version can be matched to the reviewed source.

19. > As a release operator, I want to perform npm authentication privately and
    > publish only after explicit authorization, so that credentials never
    > enter repository files, logs, CI configuration, or agent-visible state.

20. > As a reviewer, I want the release-readiness pull request to contain no tag,
    > GitHub release, npm publication, hosted behavior, or ordinary metadata
    > safety redesign, so that package preparation remains reversible and
    > independently reviewable.

21. > As a public-registry consumer, I want a fresh exact install to reproduce
    > the pre-publication version, help, JSON, stream, ordering, and exit tests,
    > so that registry publication is proven rather than inferred.

22. > As a repository maintainer, I want registry URLs containing embedded
    > authentication material rejected before access without echoing their
    > contents, so that status and Git diagnostics cannot exfiltrate secrets.

23. > As a private-registry user, I want credential-free HTTP, SSH, shorthand,
    > file, and local-path sources to retain their behavior, so that I can use
    > Git credential helpers or SSH keys instead of committed URL secrets.

24. > As an automation consumer, I want name ordering defined as case-sensitive
    > ECMAScript UTF-16 code-unit order, so that locale or operating-system
    > collation cannot silently change schema 2 output.

25. > As a consumer-repository owner, I want status to leave my repository
    > untouched while clearly disclosing Git network/cache refreshes, so that
    > “read-only” is precise rather than implying global side-effect freedom.

26. > As a Node 22/24 user, I want the exact declared lower bounds exercised in
    > CI, so that the engine range is based on evidence rather than latest-patch
    > aliases alone.

27. > As a release operator, I want npm account/2FA readiness checked before
    > creating an immutable tag and public release, and public installation
    > verified with isolated npm state, so that auth or cache configuration
    > cannot create a false or late failure.

28. > As an agent user, I want documentation to identify the configured
    > registry as a trusted instruction authority, so that I do not mistake
    > copied `SKILL.md` content or lock hashes for sandboxing or author proof.

29. > As a terminal/automation user, I want registry sources and Git-derived
    > diagnostics treated as untrusted display data, so that control sequences
    > cannot inject terminal behavior or unbounded remote text into logs.

30. > As a release owner, I want implementation/review separated from public
    > release authority by an exact verified-artifact manifest and fresh narrow
    > execution context, so that untrusted repository or tool text cannot turn
    > ordinary work into an implicit or changed tag, release, or publication.

31. > As a registry consumer, I want cache identity bound to my exact configured
    > source and verified before reuse, so that a colliding or retargeted cache
    > cannot substitute another registry's agent instructions.

32. > As a release owner, I want approved artifact hashes rechecked immediately
    > before GitHub attachment and npm publication, so that a post-authorization
    > local replacement cannot reach either irreversible sink.

33. > As a release owner, I want public publication of the already-verified
    > GitHub draft authorized separately by exact identifier and URL, so that
    > earlier authority to tag, attach, and publish npm cannot silently expand
    > into authority for the final public-release action.

## Implementation Decisions

- Release exactly `skillfoo@1.0.0` with intended tag `v1.0.0`. The prior
  `0.0.1` value was never published and is treated as a development
  placeholder, not as an earlier public compatibility line.
- Treat the declared process behavior as a version 1 public contract. A
  breaking change to commands, arguments, streams, or documented statuses
  requires a package major release. A breaking JSON change requires both a
  schema-version increment and a package major release.
- Keep `schemaVersion: 2` and preserve current command behavior except for the
  narrow pre-1.0 registry-input safety correction described below. The JSON
  document retains the current outcome, registry, emit, skill, projection, and
  summary meanings. Exit status remains the process-level representation of
  the reconciliation outcome or invocation failure.
- Define a schema break as removing or renaming a field; changing a field's
  type, optionality, or meaning; adding or changing an enum value that an
  existing consumer cannot interpret; changing documented array ordering; or
  otherwise making valid schema 2 handling unsafe. Those changes require a new
  schema version and package major.
- Treat new optional object fields or summary counters as backward-compatible
  schema 2 additions when existing meanings and ordering remain intact.
  Schema 2 consumers must ignore unknown object keys but must reject an unknown
  top-level schema version. Additional data records using already documented
  variants are ordinary data, not schema changes.
- Preserve deterministic rendering. Top-level and record fields are emitted
  consistently; skills use case-sensitive ECMAScript relational comparison of
  original strings in UTF-16 code-unit order; the repository index projection
  precedes adapters; and adapter projections use the same comparator. Do not
  introduce locale collation, normalization, or case folding. Consumers parse
  JSON structurally and do not use human output or whitespace matching.
  Object-key order, indentation, and trailing whitespace are not schema
  compatibility guarantees, though repeated output from one build remains
  deterministic.
- Treat help semantically. Supported commands/options, exit `0`, stdout
  delivery, and empty stderr are contract; exact help wording, line wrapping,
  whitespace, and display ordering are not byte-stable API.
- Publish complete npm metadata for the MIT-licensed public repository,
  including source, homepage, issue tracker, Node engine, and executable
  identity. Keep the package ESM and expose exactly the `skillfoo` bin. Do not
  add a supported `main`, `exports`, declaration output, or other library
  surface.
- Declare Node support as `^22.0.0 || ^24.0.0`, matching the six tested LTS/OS
  combinations. Do not retain the open-ended `>=22` claim or imply support for
  untested odd-numbered, current, or future majors. Add exact `22.0.0` and
  `24.0.0` Ubuntu jobs that run both repository and installed-package checks;
  raise a lower bound if its exact job cannot pass.
- Add one registry-source validation boundary shared by config loading and
  config creation. Reject HTTP(S) and file URLs containing userinfo, query, or
  fragment; reject SSH URL passwords, query, or fragment while allowing an SSH
  username; reject ASCII/C1 controls in every source. Parse and classify before
  rendering or access, fail before DNS, Git, output, cache, config, or consumer
  mutation, and never repeat the rejected URL or sensitive components in
  diagnostics. Keep local paths, credential-free URLs, shorthands, and
  SCP-style Git sources working.
- Discard raw Git/helper/remote stderr from public process streams. Select
  registry progress/failure lines from a fixed non-interpolated allowlist; each
  complete line is at most 160 UTF-8 bytes excluding newline. Generic fixed
  failures provide source/authentication guidance without external text.
  Implement exactly the seven complete public lines in D015 and no others.
  Private registry authentication belongs in Git credential helpers, SSH keys,
  or another out-of-band Git mechanism, not committed URLs.
- Document that the configured registry is a trusted instruction authority.
  Explicit sync copies its files without semantic sandboxing, and lock hashes
  identify reconciliation bytes rather than authenticating authors. Add no
  hosted/automatic sync or registry signing/pinning in this release.
- Normalize each accepted Git source to the exact clone URL passed to Git after
  deterministic shorthand expansion. Use the full SHA-256 hex digest of that
  UTF-8 string as cache identity; readable text is decorative only. Ignore
  legacy slug-only caches. Before every existing-cache use, read and normalize
  `origin` without exposing it, require exact equality, and re-clone/verify only
  the resolved hashed directory when evidence is missing, unreadable, or
  mismatched.
- Use a package allowlist and clean TypeScript emission to include all required
  runtime JavaScript while excluding source maps and every non-runtime
  repository artifact. README and license remain intentionally included as npm
  package documentation and legal metadata.
- Keep the existing stack: TypeScript, ESM, `tsc`, built-in argument parsing,
  the Node test runner, and the current runtime dependency. Add no CLI,
  packaging, assertion, fixture, or process library.
- Add a single package-verification module written for Node itself. It owns
  temporary directories, clean packing, pack-result parsing, payload
  allowlisting, empty-project installation, npm-shim resolution, child-process
  capture, fixture creation, JSON assertions, exit assertions, and cleanup
  behind one repository script.
- Give the verifier two modes with the same full assertion suite: default CI
  mode builds a temporary tarball and cleans it, while `--tarball <absolute>`
  verifies a supplied prebuilt file, never packs, deletes, or mutates it, and
  can emit the structured release manifest after success. The release runbook
  prohibits every pack step after that manifest exists.
- Invoke child processes with argument arrays and controlled working
  directories. Avoid interpolating fixture paths or package data into a shell.
  Where a platform command shim requires platform-specific invocation, isolate
  that behavior behind the verifier and keep every executable path and
  argument agent-controlled.
- Make the package verifier prove the installed artifact, not source. It must
  check exact version and help; status exits `2`, `0`, and `3` against a
  disposable registry/consumer; exit `1` and stderr-only diagnostics against a
  failing consumer; secret-free credential-source rejection before access;
  mixed-case/non-ASCII JSON ordering; no consumer-repository status mutation;
  and progress-only stderr plus expected cache mutation through an isolated
  local Git registry.
- Run full repository checks, installed-package verification, and an
  end-to-end exercise of the supplied-tarball/manifest command modes on the
  existing Node 22/24 by Ubuntu/macOS/Windows matrix. Replace the shallow
  one-platform pack dry run rather than retaining a second weaker release
  signal. Add the two exact-minimum Ubuntu jobs as a separate compatibility
  proof.
- Document the machine contract in a dedicated versioned document and link it
  from install/status guidance. Include a minimal consumer pattern that parses
  complete stdout, checks the schema version first, accepts process statuses
  `0`/`2`/`3` as JSON-bearing repository outcomes, and treats `1` as an
  invocation failure.
- Add a release runbook, but no automatic publication workflow. The runbook
  enforces a credential-free no-public-write build/verification context, the
  merge gate, a once-built supplied-tarball verification, structured manifest,
  human authorization of exact identities/actions, fresh narrow tag/draft-
  release execution, immediate three-hash comparison before attachment, private
  repeat comparison before human publication of only the manifest path, and a
  clean public-registry reinstall. It then stops with the exact draft identifier
  and URL for a second explicit human authorization; a different fresh narrow
  context identity-checks and publishes only that draft. Public release data
  omits the manifest's absolute local path.
- Preserve the merged intentional-local-override feature unchanged. Its
  original branch remains separate history with a tree equivalent to the
  squash-merged `main`; no release-contract work is added to it.

## Testing Decisions

- Retain all existing unit and compiled-process coverage. A release-readiness
  change must not weaken parser, reconciliation, filesystem, recovery, or
  command behavior tests.
- Strengthen status renderer tests around the complete schema 2 public shape,
  documented enum variants, optional fields, summary consistency, and exact
  deterministic skill/projection ordering. Include mixed-case and non-ASCII
  names whose ECMAScript code-unit order differs from locale collation. Prefer
  structural JSON assertions over broad string snapshots.
- Add config/init/process tests for every rejected credential-bearing URL
  shape. Assert failure before registry access or writes, empty stdout for JSON
  invocation failure, and absence of sentinel userinfo/query text from stderr,
  cache paths, and newly created files. Loaded attacker-supplied configs remain
  byte-identical and may retain their original sentinel; unsafe init creates no
  config. Retain credential-free source tests.
- Add control-character cases across loaded config, init, registry progress,
  and Git-derived failure. Assert pre-access rejection where the source itself
  is unsafe. A controlled fake Git emits oversized credential/control sentinel
  output; assert it is discarded and only fixed allowlisted registry lines of
  at most 160 UTF-8 bytes are exposed. Deterministically exercise all seven
  D015 lines—unsafe credentials, unsafe control data, clone, update, re-clone,
  fetch failure, and missing local registry—and compare every complete line
  byte-for-byte; fail if an eighth public registry line exists.
- Add a cache-collision regression with `file://` sources ending `a-b` and
  `a/b`, distinct catalogs, separate consumers, and one shared isolated cache.
  Pre-seed their old shared slug path with a valid third catalog and wrong
  origin, record its bytes, and assert it remains byte-identical and never
  affects resolution. Also assert full-digest cache separation, exact origin
  checks, correct catalogs, consumer immutability, and safe re-clone after
  deliberately retargeting one hashed cached origin.
- Test the documented consumer guard with accepted schema 2 and a synthetic
  unknown schema version. It must reject before interpreting outcome or
  records.
- Keep compiled-process tests for stdout, stderr, and exit status. Version
  assertions must agree mechanically with the package identity rather than
  allowing package metadata and CLI output to drift.
- Assert help semantically—recognized command/option coverage, exit, and stream
  placement—rather than freezing prose or whitespace snapshots.
- Make the installed-package verifier a real outside-in smoke test. It must run
  the package lifecycle, inspect the actual pack manifest, install the actual
  tarball, and invoke npm's installed executable in temporary paths that can
  include spaces and non-ASCII characters. Its npm cache/user config is
  isolated and contains no release credential or private registry override.
- Exercise supplied-tarball mode against a retained file and prove its bytes
  are unchanged, no second tarball is built, and the emitted release manifest
  matches the file/commit/version/tag/checksums/integrity and completed suite.
- Test the read-only manifest checker used at sinks: mutate/replace a retained
  tarball after authorization evidence, require SHA-256/shasum/integrity
  mismatch before any attachment/publication step, and require the full
  rebuild/reverify/new-manifest/new-authorization path rather than repacking.
- Cover every documented status exit: converged `0`, usage/operational `1`,
  safe changes `2`, and attention required `3`. For JSON-bearing outcomes,
  assert that all stdout parses as one document. For failure, assert empty
  stdout and non-empty stderr.
- Cover both local-registry silence and Git-registry progress. Use a disposable
  local `file://` Git repository plus an isolated cache/home to prove progress
  remains on stderr without requiring external network access. Assert that the
  consumer stays unchanged while the isolated registry cache is created or
  refreshed.
- Assert that status is consumer-repository read-only by comparing the
  disposable consumer before and after observations. Mutating sync steps exist
  only to establish converged and conflict fixtures; Git-backed cache mutation
  is explicitly expected and isolated.
- Parse the pack result and fail on any unexpected entry, especially source
  maps, TypeScript, tests, planning documents, CI files, lockfiles, `.npmrc`,
  logs, or repository metadata. Also fail when a required runtime or legal
  file is missing.
- Exercise the package verifier on all six latest-patch Node/OS matrix
  combinations and exact `22.0.0`/`24.0.0` Ubuntu lower-bound jobs. Keep cleanup
  and executable resolution portable; platform-specific assumptions that pass
  only on POSIX are release blockers.
- Before the release-readiness PR, run diff checks, the complete repository
  check, real packing, installed-tarball UAT, and a fresh repository review
  against the complete intentional commit relative to `main`. No untracked or
  unstaged slice file may fall outside the review range. Address every
  request-changes finding and repeat until the latest review approves.
- After merge but before external authorization, fully verify the once-built
  retained artifact and emit its release manifest. After exact manifest
  authorization, never repack; tag only the recorded commit, publish only the
  recorded file, and run a fresh public-registry install selected explicitly
  with empty cache/isolated config. Compare registry identity/integrity to the
  manifest and report any remaining compatibility or platform gap. Report the
  exact still-draft GitHub release identifier/URL and stop; make it public only
  after a second explicit authorization of that identity and a fresh-context
  equality check.

## Out of Scope

- Hosted application implementation, deployment, timeout handling, or process
  supervision.
- A supported JavaScript or TypeScript import API, declaration package, or
  dual ESM/CommonJS library distribution.
- New CLI commands, flags, command semantics, prompts, dependencies, CLI
  framework, color, telemetry, or update checks.
- GitHub writes, hosted sync/resolve operations, or registry promotion.
- Ordinary root-metadata redirect hardening or repair of the separately tracked
  redirect gap.
- Changes to the intentional-local-override feature beyond preserving and
  verifying its merged behavior.
- Trusted-publisher, provenance, staged-publishing, release-bot, or automatic
  npm publication infrastructure for the first release.
- npm credentials, account ownership, 2FA configuration, or secrets management
  inside the repository or agent workflow.
- Embedded registry URL authentication. Private sources use out-of-band Git
  authentication; the CLI does not accept URL credentials as config.
- Automatic migration or broad deletion of legacy lossy-slug registry caches;
  1.0 stops reading them and documents manual cleanup.
- Any tag, GitHub release, or npm publication before the release-readiness pull
  request is merged and explicit human authorization is received.
- Support claims outside Node majors 22 and 24 or the Linux/macOS/Windows CI
  matrix.

## Open Questions

- None. Discovery, decisions, the approved UAT, and the accepted module sketch
  resolve the release-readiness scope and first-publication boundary.
