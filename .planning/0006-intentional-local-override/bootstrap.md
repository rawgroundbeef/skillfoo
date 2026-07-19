# Bootstrap: Implement Intentional Local Override

Implement slice 0006 on branch `intentional-local-override`: add the targeted
`skillfoo resolve <skill> --keep-local` outcome, persist a live local Override,
make it a first-class reconciliation/status state, and extend
`--take-registry` to reverse that policy safely.

This is an implementation handoff for a fresh context. Execute from the
artifacts and current code, not from prior conversation memory.

## Read order

1. `AGENTS.md` — repository skills and conventions.
2. `CONTEXT.md` — canonical Desired, Managed, Bespoke, Projection, Conflict,
   Converged, and Override language.
3. `docs/adr/0001-live-local-overrides.md` — durable rationale for live policy
   and the rejection of accepted-local hash pinning.
4. `.planning/0006-intentional-local-override/discovery.md` — evidence,
   resolved behavior, public contracts, safety boundaries, and non-goals.
5. `.planning/0006-intentional-local-override/decisions.md` — binding choices
   and rejected alternatives.
6. `.planning/0006-intentional-local-override/uat.md` — approved outside-in
   behavior and the disposable-repository pass criterion.
7. `.planning/0006-intentional-local-override/prd.md` — user stories,
   implementation decisions, testing decisions, and explicit scope.
8. `.planning/0006-intentional-local-override/follow-ups.md` — deferred work
   that must not leak into this slice.
9. `.planning/0005-targeted-conflict-resolution/discovery.md` and
   `decisions.md` — the take-registry eligibility, target-only, rollback, and
   residual-outcome boundary being extended rather than replaced.
10. Current implementation and matching tests: `src/config.ts`,
   `src/lockfile.ts`, `src/plan.ts`, `src/status.ts`, `src/sync.ts`,
   `src/resolve.ts`, `src/emit.ts`, `src/adapter.ts`, `src/skill-name.ts`, and
   `src/cli.ts`, plus their files under `test/`.
11. `README.md`, `package.json`, and TypeScript build configs — public docs,
    supported Node/package contract, and verification commands.

## Skill to load

Before editing the CLI or filesystem transaction, read and follow
`.agents/skills/typescript-cli/SKILL.md` and its required engineering reference.
Preserve the existing small stack: strict TypeScript, ESM, built-in
`parseArgs`, compiled npm executable, and `node:test`. Do not add a CLI
framework or another runtime dependency without a demonstrated requirement.

## Non-negotiable decisions

- An Override is a live policy. Later safe local edits remain accepted until
  explicit reversal; never hash-pin accepted local content.
- Persist policy only in `.skillfoo.yml` as `overrides: { <safe-name>: local }`.
  Keep `.skillfoo.lock` version 1 as the ownership/source baseline and do not
  advance it while policy is active. Preserve valid prototype-shaped names as
  own entries and never use prototype inheritance as membership evidence.
- Honor valid ownership-consistent manual policy even when content matches the
  registry. The CLI creates policy only from `drifted` / `local_changes` or
  accepts an already-healthy Override retry.
- A healthy Override is a first-class, non-pending, non-conflicting skill state
  and can be Converged. Report registry baseline as `unchanged`, `changed`, or
  `missing` without changing outcome.
- Missing overridden content is `drifted` /
  `override_content_missing`. An unsafe top-level shape remains `drifted` /
  `emitted_path_not_managed_directory`. Never traverse or replace it. Preserve
  an existing target row/adapter exactly and do not create either when absent
  until safe local content returns. Omit the degraded target's adapter
  projection record until the local directory is safely inspectable.
- Registry updates and removal never replace or delete healthy Override
  content, clear policy, update its lock baseline, or remove its projections.
- `registryState: missing` requires a successfully loaded current catalog that
  lacks the target. Registry access/refresh failure remains exit `1`; do not
  reinterpret it as missing or use stale cache evidence.
- Status JSON becomes schema version 2 and adds the Override state,
  `registryState`, and `summary.skills.overrides`. Preserve established sort,
  stream, outcome, and exit contracts. Use reconciliation-neutral sync
  headline wording rather than claiming Override content came from the
  registry.
- Generated managed-block guidance becomes neutral (`managed by skillfoo`). An
  overridden row uses its local description and the exact approved suffix.
  Preserve unrelated rows and repository-authored content byte-for-byte.
- Public resolver grammar requires exactly one safe name and exactly one of
  `--keep-local` or `--take-registry`, each at most once. Reject malformed input
  before project or registry access. Retain standard `--` end-of-options
  behavior and cover it explicitly.
- Keep-local changes no skill content or lock entry. It transactionally changes
  target policy and target-dependent projections, post-classifies, and rolls
  back exact prior config/AGENTS bytes and adapter shape on handled failure.
  Every rollback leg is compare-and-set; preserve concurrent replacements and
  report incomplete recovery rather than clobbering them.
- For either resolver direction, require `.skillfoo.yml` and `.skillfoo.lock`
  to be existing real regular files; an `AGENTS.md` entry may be absent or real
  regular. Refuse a symlink, directory, or special entry before mutation.
  Revalidate identity and exact bytes or continued absence at each write
  boundary. Stage every changed root metadata file beside its destination and
  install it atomically without writing through the old inode, preserving its
  mode. A sibling hardlink must retain its old bytes.
- Before the first consumer mutation, persist an inspectable transaction
  manifest and exact before-snapshots for config, lock, `AGENTS.md`, relevant
  target content, adapter state, and created ancestors. Keep them through
  post-classification. Incomplete rollback must retain these artifacts at the
  exact reported path; process memory is not sufficient recovery evidence.
- Take-registry is the explicit reversal. Clear policy atomically with current
  source content, target lock baseline, target row, and missing safe adapter.
  Restore a missing target when source exists; refuse a missing source or an
  unsafe target shape.
- Both directions are target-only and retry-safe. Never apply unrelated safe
  work or change unrelated skills, rows, adapters, config entries, or
  Conflicts.
- Preserve config semantics, unknown keys, comments, ordering, and scalar
  styles through document-aware YAML editing. Harmless serializer whitespace
  normalization is allowed. No-op retries do not rewrite; rollback restores
  exact bytes. Mutating resolvers require a real regular config file, preserve
  its mode, and atomically replace it from a validated sibling temporary file;
  never follow a config symlink or special entry.
- Update README's public configuration/reconciliation/resolution guidance.
  Call the registry the default Managed authority and explicit local Override
  policy the exception; remove the unconditional source-of-truth statement.
- Keep crash journaling, registry promotion, proactive policy CLI, selection
  management, Bespoke/unsafe/foreign replacement, force removal, hosted work,
  and git publishing out of scope.

## Verified implementation seams

- Configuration currently parses YAML to a narrow typed object and renders
  only new configs. Add strict Override parsing there, but use a YAML Document
  mutation seam for existing-file edits so ignored future keys and comments
  survive. Inspect the config entry itself before mutation and keep staging on
  the same parent for an atomic replacement boundary.
- YAML parsing already rejects duplicate mapping keys. Preserve that behavior
  and validate Override names with the existing cross-platform single-segment
  helper. Mirror the lockfile's own-property discipline for names such as
  `__proto__`.
- The lock reader/writer already protects own properties, deterministic order,
  version 1, and target compare-and-set. A healthy Override must carry its
  previous entry into the next lock unchanged.
- Desired classification currently hashes registry content before checking
  local state and globally rejects explicitly selected missing registry names.
  Restructure carefully so valid previously Managed Overrides can classify a
  missing source without weakening missing-source failure for non-Overrides.
- The planner currently groups only unchanged, safe changes, and conflicts.
  Add an explicit Override summary path rather than counting it in an existing
  bucket. Keep projection summaries unchanged.
- Status renders the public JSON document in one place and shares exit mapping
  with targeted resolution. Change schema version and record rendering
  together; test the full stable output structurally.
- Ordinary sync executes planner actions. Excluding Override content in the
  plan prevents accidental replacement while still allowing Managed
  projection updates and unrelated safe work. Its current “synced ... from”
  headline must be adjusted because an Override may have changed or missing
  registry content.
- The existing resolver already stages content, revalidates lock/local/source
  and AGENTS evidence, owns a recovery transaction, performs target-only row
  and adapter work, post-classifies, cleans created ancestors, and reports
  incomplete rollback. Its current config/AGENTS snapshots are not all durable
  recovery artifacts, and normal root metadata writes can follow or mutate an
  existing inode. Extend this service rather than creating an unrelated
  mutation path, but add one root-metadata inspection/atomic-replacement seam
  shared by config, lock, and `AGENTS.md`; keep keep-local’s
  no-content/no-lock boundary explicit.
- Target-row rendering already preserves unrelated managed rows and content
  outside the markers. Extend its input to represent local authority and
  remove the generated source-only advice from full and targeted renderers.
  The current retained-row path appends a retained row when absent; degraded
  Overrides need a distinct preserve-if-present/no-synthesis representation so
  unrelated projection work can continue without inventing local metadata.
- Adapter inspection already distinguishes missing, expected, foreign, and
  unsafe ancestry. Missing may be created; foreign and unsafe must remain
  residual Conflicts.
- CLI dispatch already uses strict built-in parsing, injected I/O, clean stream
  routing, and residual resolution rendering. Extend the direction union and
  command help without hand-rolling argv parsing.
- Existing tests provide fixture, tree-snapshot, compiled-process, non-ASCII
  path, hook-failure, and residual-exit patterns. Extend those patterns rather
  than replacing them with broad snapshots.

## Suggested implementation order

1. Add config types, strict parsing/semantic inputs, a focused document-aware
   target-policy compare-and-set, and the root-metadata
   inspect/stage/atomic-replace primitive with redirect, hardlink, mode, race,
   and preservation tests.
2. Extend planner types and classification for healthy/degraded Overrides,
   registry evolution/removal, retained lock entries, local descriptions,
   summaries, and mixed outcomes.
3. Update human/JSON status and ordinary sync presentation, including schema
   version 2 and Override counts.
4. Update full and target managed-block rendering for neutral guidance and
   Override row metadata while proving unrelated-byte preservation.
5. Generalize the existing resolver request/result and recovery state for
   keep-local policy writes and take-registry policy removal. Persist the
   recovery manifest/before-snapshots before mutation. Add freshness,
   metadata-redirect and hardlink safety, idempotency, target isolation,
   post-plan, rollback, and inspectable incomplete-recovery tests plus a
   no-write refusal matrix for every other planner state before wiring the
   CLI.
6. Extend strict CLI grammar, help, success/refusal output, README config and
   workflow documentation, and compiled process tests.
7. Run the full verification and approved disposable-consumer UAT. Fix defects
   at their owning layer; do not weaken artifacts to match an implementation
   shortcut.

## Verification gates

- Run `git diff --check`.
- Run `npm run check` from a clean build output; this is the repository’s
  combined strict typecheck, build, and full test gate.
- Spawn the compiled executable in integration tests and verify help, both
  directions, invalid grammar, stdout/stderr, `0`/`1`/`2`/`3`, non-ASCII paths,
  JSON schema 2, retries, metadata redirect/hardlink sentinels, and refusals.
- Run `npm pack --json`, inspect the tarball allowlist, install the tarball into
  a temporary project, and invoke the npm-created `skillfoo` executable.
- Execute `.planning/0006-intentional-local-override/uat.md` in a separate
  disposable consumer Git repository with a sibling local registry. Record any
  environment-dependent scenario that was not exercised; never claim it
  passed implicitly.
- Inspect `git status --short --branch` and the final diff. Preserve unrelated
  work and ensure no temporary UAT repository, packed tarball, transaction
  directory, recovery data, or registry cache enters the branch.

## Environment gotchas

- The project supports Node 22 and 24 across Linux, macOS, and Windows. Local
  verification covers only the available runtime; CI must prove the matrix.
- POSIX symlinks and Windows junctions differ. Reuse adapter/path helpers and
  avoid assumptions based on Unix link modes or shell commands. Root metadata
  hardlink tests are POSIX-observable; supported-platform tests must still
  prove that replacement never writes through an old inode and preserves the
  platform's applicable mode/attributes.
- Permission-based manual rollback injection may not fail in every local
  environment. Deterministic resolver hooks remain the authoritative automated
  coverage.
- YAML Document serialization can normalize harmless flow whitespace. Tests
  should assert semantics/comments/order/style plus exact no-op and rollback
  bytes, not demand impossible byte identity after a real edit.
- The root repository’s AGENTS.md contains a skillfoo-managed block. Do not run
  mutation UAT or dogfood sync here; use the disposable consumer so unrelated
  repository guidance is not rewritten during implementation testing.
- Registry refresh may mutate only skillfoo’s private cache. Local-registry UAT
  should avoid network dependence; remote-cache behavior remains regression
  coverage.

## Handoff boundary

Implement one PR on `intentional-local-override` against `main`. Do not update
the read-only sibling planning repository. Do not implement deferred outcomes.
After implementation and verification, run the slice-required fresh-context
code review against `main`; address every Request changes finding and rerun
verification until the latest review approves.

Execute from these documents and current repository evidence, not conversation
memory. If code evidence contradicts an artifact, fix the upstream artifact or
stop for a real product decision rather than silently inventing behavior.
