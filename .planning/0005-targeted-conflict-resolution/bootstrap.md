# Bootstrap: Targeted Conflict Resolution

Implement a bounded destructive resolver for one locally edited Managed skill.
Add `skillfoo resolve <skill> --take-registry`, remove repository-wide
`sync --force`, and preserve every unrelated skill and projection while making
the target mutation recoverable.

## Start Here

Work on the existing `targeted-conflict-resolution` branch. Ship this slice as
one pull request. The branch already contains the dogfooded `slice` skill update
that requires a fresh `$review` pass after implementation; preserve that sync
result.

Read these sources in order before editing:

1. [`AGENTS.md`](../../AGENTS.md) — repository instructions and available zone
   skills.
2. [`CONTEXT.md`](../../CONTEXT.md) — canonical reconciliation and ownership
   language.
3. [`discovery.md`](./discovery.md) — current behavior, code evidence, scope,
   and non-goals.
4. [`decisions.md`](./decisions.md) — approved command, ownership, isolation,
   outcome, and recovery contracts.
5. [`uat.md`](./uat.md) — user-approved observable behavior and demo pass.
6. [`prd.md`](./prd.md) — user stories, module boundaries, and test decisions.
7. [`follow-ups.md`](./follow-ups.md) — deferred outcomes and cleanup that must
   not leak into this PR.

Load `$typescript-cli` before changing command parsing, streams, exit codes, or
filesystem behavior. Do not load `$prd` or re-open product decisions unless the
implementation reveals a real contradiction in the approved artifacts.

## Non-Negotiable Contract

- The only destructive resolution grammar is
  `skillfoo resolve <skill> --take-registry`. Require exactly one safe name and
  the explicit direction. Do not prompt and do not add `--yes` or aliases.
- Remove `skillfoo sync --force` and `skillfoo sync -f` from help, parsing,
  planning, and execution. Reject either form visibly; never reinterpret it as
  ordinary sync.
- Except for strict rejection of unsupported syntax and force removal, preserve
  ordinary `sync` reconciliation, output, and exit behavior.
- Destructive replacement is eligible only for a Desired, lock-owned, real
  emitted directory whose ordinary plan state is `drifted` with reason
  `local_changes`.
- The only successful retry no-op is an exact `unchanged` Managed target: its
  content matches the current registry and its lock entry already records the
  canonical source and hash. Refuse `lock_update` and every other safe,
  conflicted, removal, missing, unsafe, or Bespoke state without writes.
- Resolve one target only. Do not execute any unrelated safe plan record, alter
  any unrelated lock entry or managed row, or create/remove any unrelated
  adapter.
- Replace the target with the exact current registry tree, including removal of
  local-only files. Advance only its lock entry and update only its managed
  `AGENTS.md` row.
- Create the target adapter only when missing. Preserve expected adapters as-is.
  Preserve foreign or unsafe target adapters as a separate Conflict and let the
  successful resolver return residual outcome `3`.
- Revalidate the expected prior lock entry, local hash, and registry/staged hash
  immediately before replacement. Any changed evidence aborts with exit `1`,
  cleans staging data, and leaves no durable consumer change.
- Keep a temporary recovery copy until target content, lock, row, adapter, and
  post-resolution read-only classification all succeed. A handled failure
  restores the complete prior target-dependent state. A failed rollback keeps
  recovery data and reports its exact path.
- Successful replacement leaves no backup or transaction artifact. The user
  explicitly chose to discard the local edits.
- After a successful replacement or exact retry no-op, return the post-result
  repository outcome: `0` Converged, `2` unrelated safe changes remain, or `3`
  another Conflict remains. Exit `1` means no successful resolution was
  committed.
- Successful results go to stdout. Usage, refusal, stale-evidence, rollback,
  and operational diagnostics go to stderr. Preserve clean JSON stdout for the
  unrelated `status --json` command.

## Confirmed Module Boundaries

Keep the implementation behind these approved boundaries:

1. **CLI boundary** owns strict argv parsing, help, stream routing, and exit
   translation for `resolve` and the now-optionless `sync` command.
2. **Resolution coordinator** owns one prepared registry catalog, ordinary-plan
   classification, exact target selection, eligibility/no-op decisions, target
   evidence, and the post-resolution outcome.
3. **Recoverable target transaction** owns staging, evidence revalidation,
   ordered target writes, rollback, cleanup, and recovery-path reporting.
4. **Targeted projection operation** owns replacing or inserting one managed
   `AGENTS.md` row without rerendering unrelated rows and creating only a
   missing target adapter.
5. **Lock target operation** starts from a fresh lock read, verifies the
   expected prior target entry, writes the canonical target entry, and preserves
   all unrelated entries under lockfile version 1.

Do not call the ordinary sync executor from the resolver. It intentionally
executes all safe records and cannot satisfy the target isolation contract.

## Verified Implementation Pointers

- [`src/cli.ts`](../../src/cli.ts) already uses Node `parseArgs` strictly for
  `init` and `status`, but `sync` scans argv for `--force` / `-f` and otherwise
  ignores unsupported syntax. Give `sync` and `resolve` explicit strict parsers,
  reject repeated `--take-registry`, and add help paths that inspect no project
  or registry state.
- [`src/plan.ts`](../../src/plan.ts) owns the stable `drifted` /
  `local_changes` classification and accepts a prepared `RegistryCatalog`.
  Reuse that catalog seam so one resolution attempt refreshes the registry only
  once. Remove the plan-wide `force` option and forced-update branch rather than
  leaving a hidden broad overwrite API.
- A drifted plan record retains the prior entry but does not expose the current
  registry hash as its next entry. The resolver must capture explicit canonical
  registry evidence; it must not write the plan's repository-wide `nextLock` or
  infer eligibility from presentation text.
- [`src/sync.ts`](../../src/sync.ts) has a private in-place mirror that deletes
  extra destination files before completing all writes. Do not use it as the
  destructive transaction. Stage a complete target tree first and swap only
  after verifying it.
- [`src/skilldir.ts`](../../src/skilldir.ts) defines the existing skill manifest
  and SHA-256 rule, including skipped entries and normalized relative paths.
  Use the same walk/hash contract for source evidence, staged verification, and
  final target checks so sync, status, and resolution cannot disagree.
- [`src/config.ts`](../../src/config.ts) validates that the emit root is a safe
  project-contained path with real directory ancestors. Put transaction and
  recovery directories under the validated emit filesystem so rename/swap
  operations do not cross devices. Use unique, non-skill temporary names.
- [`src/lockfile.ts`](../../src/lockfile.ts) provides validated reads,
  prototype-safe entry assignment, sorted writes, and version-1 enforcement.
  Add or compose a target-only compare/update path; preserve every unrelated
  entry value and do not change schema.
- [`src/emit.ts`](../../src/emit.ts) already parses managed marker spans,
  preserves outer Bespoke content, detects LF/CRLF, and renders canonical rows.
  Its current full renderer refreshes or removes multiple rows. Expose a narrow
  renderer that replaces an existing target row or inserts the missing target
  row while retaining every unrelated row segment byte-for-byte. When no
  managed block exists, add a target-only managed block and let status report
  any unrelated projection work still pending.
- [`src/adapter.ts`](../../src/adapter.ts) distinguishes expected, missing,
  foreign, and unsafe-ancestor adapters. Reuse inspection and missing-adapter
  creation. Record whether this transaction created an adapter so rollback only
  removes its own write. Also record previously absent adapter ancestors and
  remove them on rollback only when still empty; preserve pre-existing or
  concurrently populated directories.
- [`src/status.ts`](../../src/status.ts) owns the `0`/`2`/`3` outcome mapping.
  After target-dependent writes, recompute an ordinary read-only plan with the
  same catalog while recovery data still exists. A classification failure is a
  transaction failure and must roll back before exit `1`.
- Put orchestration in a focused module such as `src/resolve.ts`; keep
  filesystem transaction details internal or behind a narrow operations seam
  that permits deterministic stale-evidence and failure injection in tests. Do
  not expose test-only CLI flags.
- Existing tests use disposable local registries and consumer directories.
  [`test/index.ts`](../../test/index.ts) explicitly imports every suite, so add
  and register focused resolver tests in addition to planner, emit, lock,
  adapter, sync, and compiled-CLI regressions.
- [`README.md`](../../README.md) documents reconciliation and status but no
  resolution path. Add the explicit resolver workflow, content-loss warning,
  residual exit codes, supported retry, refused cases, and removed force
  behavior.
- The package is strict ESM TypeScript for Node 22+, publishes compiled
  `dist/entrypoint.js`, and uses Node's test runner. CI runs `npm run check` on
  Ubuntu, macOS, and Windows with Node 22 and 24, plus `npm pack --dry-run`.

## Transaction and Failure Ordering

Preserve this safety order even if implementation details differ:

1. Strictly parse and validate the complete command.
2. Load config, refresh one registry catalog, classify the repository, and
   select the exact target record.
3. Return the exact `unchanged` no-op result or refuse every ineligible state
   before creating transaction artifacts.
4. Snapshot prior target-dependent bytes/state and stage the complete registry
   tree under the validated emit filesystem.
5. Verify the staged hash, then re-read and compare the target lock entry,
   destination shape/hash, and registry hash.
6. Move the original target to recovery, install the staged target, update only
   the target lock entry and managed row, and create only a missing adapter.
7. Re-plan read-only with the same registry catalog while recovery still exists
   outside any desired skill path; derive `0`, `2`, or `3`.
8. Only then delete recovery/staging data and emit the success result.
9. On any handled failure after mutation begins, undo transaction-owned writes
   in reverse order. If rollback is incomplete, keep recovery data and include
   its exact path in the exit-`1` diagnostic.

Do not emit a success line until the transaction and post-result classification
have committed. Do not let rollback cleanup mask the original failure.

## Suggested Implementation Sequence

1. Make `sync` parsing strict, remove its force option from help and internal
   planner/executor types, and pin the breaking behavior with process tests.
2. Add targeted managed-row rendering and target lock compare/update helpers
   with LF/CRLF, missing-row, Bespoke-content, and unrelated-entry tests.
3. Define typed resolution request/result/refusal/evidence structures and the
   coordinator's eligible Conflict plus exact retry no-op cases.
4. Implement staged target replacement and rollback with a narrow injectable
   filesystem seam; cover each ordered failure point before wiring the CLI.
5. Add missing/expected/foreign/unsafe adapter handling and post-resolution
   status classification while recovery remains available.
6. Wire strict resolve parsing, help, stdout/stderr rendering, and exit mapping.
7. Add multi-skill isolation, stale-evidence, compiled-process, paths with
   spaces/non-ASCII, and package-level tests.
8. Update README/help, run the complete automated gates, and execute the
   approved UAT in disposable consumers.

## Verification Gates

- Run focused resolver, emit, lock, adapter, sync, and CLI tests while building
  each boundary.
- Run `npm run check` for strict typecheck, clean build, and the full suite.
- Run `git diff --check`.
- Spawn the compiled entrypoint and assert help, strict parsing, stdout/stderr,
  and exits `0`, `1`, `2`, and `3` from outside the service boundary.
- Run `npm pack --dry-run`, then pack and install the tarball into a disposable
  empty project and invoke the npm-created `skillfoo` binary.
- Execute every scenario in the user-approved [`uat.md`](./uat.md) using only
  disposable local registries and consumers. Snapshot ignored files, links,
  lock entries, managed rows, and unrelated skill directories for no-write
  assertions.
- Keep Git-backed test caches isolated from the developer's real registry cache.
- Preserve the CI matrix across Ubuntu, macOS, Windows, Node 22, and Node 24.
  Locally report any platform coverage that can only run in CI.
- After implementation and all gates pass, spawn a fresh-context subagent, load
  `$review`, and review the final branch diff against `origin/main` using this
  bootstrap and its artifacts. Address every **Request changes** finding,
  rerun verification, and repeat fresh review until it returns **APPROVE**.

The globally linked `skillfoo` may not represent this branch. Use the freshly
built entrypoint during development and the tarball-installed binary for package
acceptance.

## Out of Scope and Follow-ups

Do not implement intentional local overrides, Managed-to-Bespoke conversion,
registry promotion, Bespoke adoption/replacement, forced removal, foreign
adapter replacement, multi-target resolution, selection management, config or
lock schema changes, offline status, multiple registries, git commits,
publishing, remote pull requests, or permanent backups. Do not fold repeated
registry walks into this destructive slice unless correctness requires a shared
walk result. Do not promise crash consistency, fsync durability, restart-time
transaction discovery, or automatic recovery after process termination or
machine failure; the approved transaction contract covers handled failures and
in-process rollback. Record new adjacent findings in
[`follow-ups.md`](./follow-ups.md).

## Final Instruction

Execute from these artifacts and verified repository code, not conversation
memory. If a cold implementation context cannot satisfy a contract without
guessing, update the owning upstream artifact before coding around it. Do not
hand off the implementation until repository checks, the approved UAT, and the
required fresh `$review` pass all succeed.
