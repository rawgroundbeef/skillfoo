# Decisions: Publish the skillfoo CLI package

**Date:** 2026-07-20

## D001 — Treat the feature merge gate as satisfied

**Status:** Accepted from verified external state

GitHub PR #8 already merged the complete `intentional-local-override` tree into
`main`. The old branch remains untouched and has the same tree as `main`.
Release preparation therefore starts from current `main`; it will not reopen,
rewrite, or add release-contract work to the old feature branch.

## D002 — Use one new release-readiness branch and PR

**Status:** Accepted from the kickoff brief

Slice 0007 uses `release-readiness`, created from current `main`. Planning and
implementation artifacts for package readiness belong to its separate PR.
Tagging, GitHub release creation, and npm publication occur only after that PR
is merged and the human gives explicit authorization.

## D003 — Make the executable process contract public, not an import API

**Status:** Accepted from the kickoff brief

The supported integration is an exact npm package version plus its
npm-installed `skillfoo` executable. A hosted consumer spawns that executable
and observes argv, stdout, stderr, and process status. No `main`, `exports`, or
other supported library entrypoint will be introduced.

## D004 — Preserve status JSON schema version 2

**Status:** Accepted from the kickoff brief

The release documents and tests the current schema 2 behavior:

- stdout is exactly one undecorated JSON document on successful `--json` use;
- diagnostics and progress use stderr;
- exit `0` is converged;
- exit `2` is safe changes available;
- exit `3` is attention required;
- exit `1` is usage or operational failure;
- skill and projection arrays have documented deterministic ordering; and
- consumers reject schema versions they do not recognize.

The documentation must distinguish breaking schema changes that require a
version increment from backward-compatible additions that schema 2 consumers
must tolerate.

Object-key order, indentation, and the current trailing newline are not
semantic JSON compatibility guarantees. A single build must still render the
same semantic result deterministically, but consumers parse the complete JSON
document structurally and must not compare formatting bytes across releases.

## D005 — Preserve current command behavior

**Status:** Accepted from the kickoff brief

This is contract hardening and package delivery, not a command redesign. Any
change to behavior discovered during implementation is either a test/docs
correction for already-supported behavior or a separately authorized slice.
In particular, ordinary root-metadata redirects remain out of scope. The one
pre-1.0 exception is rejecting credential-bearing remote registry URLs before
network access so schema 2 and stderr cannot publish embedded secrets; D015
defines that narrow safety correction.

## D006 — Test the installed artifact as the release boundary

**Status:** Accepted from the kickoff brief

Package verification must build from clean output, create the real tarball,
install it into an empty temporary project, and invoke the npm-created
`skillfoo` executable. It must assert package version, help, JSON structure,
stream separation, and `0`/`1`/`2`/`3` statuses. Source execution and global
links are insufficient substitutes.

## D007 — Retain the existing support matrix

**Status:** Accepted from the kickoff brief

Node 22 and 24 on Ubuntu, macOS, and Windows remain the supported CI matrix.
The package smoke test must be automation-safe and cross-platform; no POSIX-only
shim assumptions or shell-only fixture setup may be embedded in it.

## D008 — Gate every irreversible release action

**Status:** Accepted from the kickoff brief

The release-readiness PR may prepare documentation, metadata, verification,
and inert release instructions. It may not create a tag, GitHub release, or npm
publication. After merge, each approved release action must operate on the exact
version and tagged commit, and public-registry installation must be reverified
from an empty temporary project.

## D009 — Choose the first public version deliberately

**Status:** Accepted

Release `skillfoo@1.0.0` and pair it with Git tag `v1.0.0`. The existing
`0.0.1` is an unpublished development placeholder, so no public version is
being skipped or superseded. Version 1 declares the documented executable and
machine contract intentional; it does not claim feature completeness.

Breaking the supported executable surface or `status --json` contract requires
a package major version. Backward-compatible commands or JSON additions use a
minor version, and contract-preserving fixes use a patch version. A machine
schema break therefore requires both a schema-version increment and a package
major release.

## D010 — Choose the first-publication path without agent-visible credentials

**Status:** Accepted

For the first release, a no-public-write verification context builds
`skillfoo-1.0.0.tgz` once from a clean checkout of the exact merged commit that
will become `v1.0.0`. The installed-package verifier accepts that supplied
tarball path, retains the file, and runs the complete payload, metadata, shim,
status, stream, ordering, and exit suite against those exact bytes. It then
records the commit, intended tag, absolute tarball path, filename, SHA-256, npm
shasum/integrity, and verification results in a structured release manifest.
No pack step may run again after that manifest is produced.

Before the tag exists, the human privately confirms npm
authentication/account/2FA readiness as defined by D018 and explicitly
authorizes the manifest's exact identities and requested external actions. A
narrow release-execution context may then push `v1.0.0` at only the recorded
commit. Immediately before attaching the tarball to a draft GitHub release, it
must recompute raw-file SHA-256, npm SHA-1 shasum, and npm SHA-512 integrity and
match all three manifest values. The public checksum/manifest projection omits
the private absolute local path. Immediately before `npm publish`, the human's
private terminal recomputes and matches the same three values, then publishes
only the manifest's absolute tarball path. Any mismatch stops and requires a
new build, full supplied-tarball verification, manifest, and authorization;
repacking remains forbidden. Public-registry verification compares npm
identity/integrity with the manifest while the GitHub release remains a draft.
The operator then reports the exact draft database/node identifier and URL plus
verification results and stops for a second explicit human authorization to
publish only that draft. A fresh narrow context may perform only that final
publication after rechecking the draft/tag/manifest identities; mismatch stops.

No token, credential, npm login output, or user `.npmrc` content enters the
repository, conversation, CI configuration, or logs. Trusted publishing and
provenance automation are a later slice after the package exists; the first
release does not add a long-lived CI publish token or an automatically firing
publish workflow.

## D011 — Decide whether source maps belong in the minimal payload

**Status:** Accepted from the kickoff payload constraint

The current tarball includes 16 `.js` files and 16 `.js.map` files. Source maps
are not required to execute the CLI and their source paths do not provide a
supported library API. Omit them from the public tarball while retaining all
compiled `.js` runtime files, npm's always-included
`package.json`/`README.md`/`LICENSE`, and no source, tests, planning files, or
repository metadata.

## D012 — Limit the runtime claim to tested LTS majors

**Status:** Accepted from the approved support matrix

Declare Node support as `^22.0.0 || ^24.0.0` and test both majors on Ubuntu,
macOS, and Windows. The prior open-ended `>=22` range also admitted untested
odd-numbered, current, and future majors. Add a later supported LTS major only
after its matrix coverage is deliberately added. In addition to latest-patch
major jobs, exercise exact `22.0.0` and `24.0.0` lower bounds on Ubuntu; raise a
declared lower bound if its exact job cannot pass rather than claiming an
untested range.

## D013 — Keep JSON formatting outside the schema contract

**Status:** Accepted after adversarial review

Schema 2 guarantees JSON meanings, types, optionality, enum vocabulary, and
skill/projection array ordering. It also guarantees that stdout contains one
undecorated parseable document. JSON object-key order is semantically
irrelevant, and indentation and trailing whitespace are not compatibility
surface. A renderer remains deterministic within one build, but a formatting
change that preserves the parsed document does not require a schema or package
major increment.

## D014 — Treat help semantically rather than byte-for-byte

**Status:** Accepted after adversarial review

The supported help contract is command/option discoverability, exit `0`,
stdout delivery, and empty stderr. Exact help prose, line wrapping, spacing,
and ordering are not versioned bytes and may change in a contract-preserving
patch. Command names, accepted arguments/options, and stream/status behavior
remain public process API.

## D015 — Reject credential-bearing remote registry sources before access

**Status:** Accepted after adversarial security review

Remote registry configuration must not embed authentication material in a URL
that status or Git diagnostics could reproduce. Before config creation or
registry access:

- reject HTTP(S) and `file://` URLs with any username/password userinfo, query,
  or fragment;
- reject `ssh://` URLs with a password, query, or fragment while continuing to
  allow an ordinary SSH username;
- validate every non-local Git source as the exact URL passed to Git after
  semantic expansion, including hosted/generic shorthands and `git@host:path`,
  rejecting credentials, query, or fragment components before output;
- reject unsupported scheme-like sources instead of treating them as local
  paths;
- reject ASCII and C1 control characters in every registry source before it can
  be classified, rendered, accessed, or used in a cache path;
- keep credential-free shorthands, `git@host:path`, SSH URLs, HTTP(S) URLs,
  file URLs, and local filesystem paths working; and
- render an actionable error that never repeats the rejected value or any
  userinfo/query/fragment component.

Apply the same parsed validation to loaded config and init/config creation so
failure occurs before network, output, cache, or consumer writes. Do not relay,
sanitize, or truncate raw Git/helper/remote stderr: discard it from the public
process streams. Registry progress and failures select complete lines from a
fixed allowlist, interpolate no registry source or external text, and are at
most 160 UTF-8 bytes per line excluding the newline. Unsafe-source validation
uses the first two lines before registry resolution; accepted-source resolution
uses the remaining five. The complete public allowlist is exactly:

- `skillfoo: registry source contains unsupported credentials or URL components; use out-of-band Git authentication`
- `skillfoo: registry source contains unsupported control characters`
- `skillfoo: cloning configured Git registry`
- `skillfoo: updating configured Git registry`
- `skillfoo: re-cloning configured Git registry`
- `skillfoo: could not fetch configured Git registry; verify .skillfoo.yml and out-of-band Git authentication`
- `skillfoo: configured local registry not found; verify .skillfoo.yml and filesystem access`

Every unexpected Git-backed registry failure maps to the fixed fetch-failure
line; every missing local registry maps to the fixed local-registry line.
Users authenticate private registries through Git credential helpers, SSH keys,
or other out-of-band Git mechanisms rather than committed URL secrets.

## D016 — Define deterministic name ordering as ECMAScript code-unit order

**Status:** Accepted from current renderer behavior

Skill and adapter names are ordered by case-sensitive ECMAScript relational
string comparison (`<`/`>`) over the original, unnormalized strings. This is
lexicographic UTF-16 code-unit order, not locale collation, case folding, or
Unicode normalization. The repository-index projection remains first. Mixed
case and non-ASCII contract tests must distinguish this comparator from
`localeCompare` and OS locale behavior.

## D017 — Scope status read-only behavior to the consumer repository

**Status:** Accepted from current registry behavior

`status` never writes the consumer repository. For a local-path registry it
only reads that source. For a Git-backed registry it performs network access
and owns a registry cache outside the consumer: it may remove/reclone, fetch,
and hard-reset that cache to inspect current source state. Documentation and
tests must disclose and isolate those cache effects rather than claiming global
side-effect freedom.

## D018 — Gate npm readiness before irreversible release state

**Status:** Accepted after adversarial release review

Before creating or pushing `v1.0.0` or creating a GitHub release, the human must
privately verify public-registry CLI authentication, required 2FA/account
settings, and readiness to create an unscoped public package, then communicate
only that readiness—not credentials or auth output. Recheck that `skillfoo`
has no public version, while acknowledging that `E404` does not reserve the
name and a first-publish race remains until npm accepts the real artifact.

## D019 — Prove public installation independently of user npm state

**Status:** Accepted after adversarial release review

Post-publication `npm view` and exact install explicitly select
`https://registry.npmjs.org/`, use a new empty npm cache, and use an isolated
non-secret user-config file. This proves the public registry serves the package
without a global cache or private registry override. Authentication is not
copied into that verification environment because public read/install requires
none.

## D020 — Separate untrusted analysis from release authority

**Status:** Accepted from the threat model

Repository, PR, user, registry, and tool text are untrusted inputs to an agent
that could otherwise reach public tag/release sinks. Planning, implementation,
CI, review, and final artifact verification therefore contain no npm credential,
public-write capability, publish automation, or implicit authorization. The
no-public-write verifier emits only the structured release manifest defined in
D010 and stops. The human then explicitly authorizes its exact commit, intended
tag, package/version, tarball hashes/integrity, and named external actions.

A fresh, narrowly scoped execution context reads the approved manifest rather
than raw repository/review text and may only confirm equality with current
external state, push the recorded tag at the recorded commit, and create the
draft release with the recorded artifact. Any mismatch stops. The human
privately publishes the already-built exact tarball; the authenticated terminal
does not select or rebuild its contents. After isolated public verification, the
context reports the exact draft identifier/URL and stops. Final GitHub release
publication is a separate sink requiring a second explicit human authorization;
a fresh narrow context may publish only that approved draft after equality
checks and may perform no other write.

## D021 — Document the configured registry as a trusted instruction authority

**Status:** Accepted from the threat model

Skillfoo treats the configured registry as Managed content authority. Explicit
sync copies its skill files into repositories, where agents may act on their
instructions; the CLI does not sandbox or semantically approve that content.
The 1.0 documentation must tell users to configure and sync only registries
whose instruction authors they trust. Lock hashes support reconciliation and
change identity, not publisher authenticity. Signed/pinned registry provenance,
review gates, and hosted/automatic sync remain separate future work.

## D022 — Bind each Git cache entry to one exact registry identity

**Status:** Accepted after reproduced threat-model review

The current readable cache slug is lossy and can map distinct sources to one
directory. Normalize a validated registry source to the exact clone URL passed
to Git after deterministic shorthand expansion, encode that UTF-8 string, and
derive the cache identity from its full SHA-256 hex digest. A readable prefix
may be included only as decoration; the digest is the identity. Do not migrate
or reuse legacy slug-only cache directories.

Before every fetch/reset from an existing hashed cache, read its Git `origin`
without exposing command output, normalize it by the same rule, and require
exact equality with the configured normalized clone URL. Missing, unreadable,
or mismatched origin evidence makes the cache untrusted: remove/re-clone only
that resolved hashed cache directory, then verify the new origin before reading
its catalog. Fixed D015 output remains the only public diagnostic. Tests must
pre-seed a valid legacy slug-only cache, cover two `file://` sources that
collide under the old slug, and deliberately retarget a hashed-cache origin.
The legacy directory must remain byte-identical and unread; each resolution
must return only its configured catalog and never mutate either consumer.

## D023 — Use dogfooded threat-model as review tooling, not release acceptance

**Status:** Accepted from explicit user clarification

The user requested the `threat-model` installation to strengthen v1 review,
not to turn skillfoo's own managed projection into a package feature or release
criterion. Preserve the intentional repository-tooling changes and keep them
reviewable as their own preparatory change, but exclude their exact lock hash,
managed files, index row, and adapter target from product stories and UAT. Use
the installed skill during threat modeling and fresh reviews; retain the
security controls it produced in the release artifacts.

## ADR threshold

The supported subprocess boundary and versioned machine contract are public,
hard to reverse, surprising to readers who might otherwise import internal
modules, and represent a real trade-off. The durable decision is recorded in
`../../docs/adr/0002-publish-the-cli-process-contract.md`.
