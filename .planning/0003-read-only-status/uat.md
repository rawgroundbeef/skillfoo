# UAT: Read-Only Reconciliation Status

Date: 2026-07-18

**Status:** Approved by user on 2026-07-18; safety edge cases clarified during final adversarial review

## Purpose

Prove that a person or CI job can decide whether ordinary `skillfoo sync` is unnecessary, can safely reconcile the complete managed state, or will preserve a conflict requiring user attention—all without status changing the consumer project.

Use the built CLI against a disposable consumer and disposable local registry containing `alpha` and `beta`. Before each status invocation, snapshot the consumer's complete directory structure, regular-file bytes, and symlink targets; do not rely only on `git diff`, because `.skillfoo.lock` may be ignored. Unless a scenario explicitly runs sync, before and after snapshots must be identical.

Human wording may evolve, but it must name affected skills or projections, distinguish pending changes from conflicts, and state the appropriate next step. JSON keys, values, ordering, summary meanings, and exit statuses are the stable automation contract.

## Scenario 1: A Fresh Consumer Has Safe Changes Available

1. Configure the consumer to select `alpha` and `beta`, with no emitted content, lockfile, managed AGENTS.md block, or Claude adapters.
2. Run `skillfoo status` and record its exit status.

Pass when:

- Both skills are reported `add`.
- AGENTS.md and both active adapters are reported as safe projection updates.
- The overall result says changes are available and directs the user toward ordinary sync.
- The command exits `2`.
- No emitted directory, lockfile, AGENTS.md block, or adapter is created; the complete consumer snapshot is unchanged.

## Scenario 2: A Synced Consumer Is Converged

1. Run `skillfoo sync` to establish both skills, lock baselines, AGENTS.md projection, and adapters.
2. Snapshot the consumer, then run `skillfoo status` twice.

Pass when:

- Both skills and all active projections are `unchanged`.
- The overall result is `converged` on both runs.
- Both runs exit `0` and produce equivalent results.
- Neither status run changes any consumer file, directory entry, or symlink target.
- A subsequent ordinary sync has no semantic reconciliation work and does not recreate already-correct adapters. Prove non-recreation with an instrumented adapter executor test or, where reliable, link identity/metadata—not only an equal target string after the run.

## Scenario 3: A Registry Update Is Safe Pending Work

1. Starting from Scenario 2, change `alpha`'s registry content and frontmatter description while leaving its managed consumer copy untouched.
2. Run status without syncing.

Pass when:

- `alpha` is `update`; `beta` remains `unchanged`.
- The planned AGENTS.md projection is `update` because it uses the post-plan registry description; correct adapters remain `unchanged`.
- The overall result is `changes_available` and exits `2`.
- The consumer retains the old `alpha`, AGENTS.md, and lock bytes until sync is explicitly run.
- Repeated status is equivalent and non-mutating.
- After sync, status reports convergence and exits `0`.

## Scenario 4: Stale Lock Metadata Is Visible

Exercise both subcases against a consumer whose emitted skill bytes match the registry:

1. Leave an older locked hash after independently placing the exact new registry bytes in the emitted directory.
2. Separately, leave the hash current but change or remove the lock entry's recorded registry `source`.
3. Separately, combine a source mismatch with locally drifted content.
4. Run status in each case.

Pass when:

- The skill is `lock_update`, not `unchanged`, `update`, or `drifted`.
- The result is `changes_available` and exits `2` because sync has durable lock work.
- Status does not repair or canonicalize the lock.
- After ordinary sync repairs the canonical hash and source, status returns `unchanged` and exits `0`.
- In the drift-plus-source-mismatch case, the skill remains one `drifted` conflict and plain sync preserves the complete prior hash/source pair. Source repair waits until content safely converges or the user explicitly resolves drift.

## Scenario 5: Local Drift Requires Attention

1. Starting from converged `alpha`, edit its managed body without changing its frontmatter description and run status.
2. Separately, change its local frontmatter description and run status.

Pass when:

- `alpha` is `drifted` with reason `local_changes`.
- Human output explains that local edits are preserved and does not claim ordinary sync will fully resolve the conflict.
- Unaffected projections remain `unchanged`.
- When local frontmatter changes, the planned AGENTS.md update uses the preserved local description, matching ordinary sync; it never advertises registry metadata for content sync will not install.
- The overall result is `attention_required` and exits `3`.
- The local edit and prior lock remain byte-for-byte unchanged across repeated status runs.

## Scenario 6: Every Unowned Desired-Path Shape Is Blocked

For a desired `alpha` with no lock entry, test an existing destination that is each of: a populated directory, empty directory, ignored-only directory, regular file, symlink, and platform-available special entry.

Pass when:

- Every existing top-level shape is `blocked` with reason `unmanaged_destination` and exits `3`.
- Status never follows the symlink, hashes a foreign target as owned content, or changes the destination.
- No ownership record or projection is created.
- A separate bespoke skill whose name is not desired is invisible in human and JSON results.
- `skillfoo status --force` is rejected as invalid usage rather than treating any collision as overwritable.

## Scenario 7: A Substituted Managed Destination Is Drift, Not Traversal

1. Sync `alpha` to establish a lock entry.
2. Replace its emitted top-level directory with a regular file and, separately, a symlink to a directory containing matching-looking files.
3. Run status for each shape.

Pass when:

- `alpha` is `drifted` with reason `emitted_path_not_managed_directory` and the result exits `3`.
- Status does not traverse the link target.
- Ordinary non-force sync preserves the substituted path and reports the conflict.
- A locked real directory with missing represented files is compared as local drift even when only ignored, linked, empty, or special nested structure remains.
- Nested unrepresented structure is preserved during active sync and still blocks later whole-directory removal.
- Permission or I/O failure during inspection exits `1` instead of becoming a reconciliation state.

## Scenario 8: Safe and Blocked Removals Are Distinguished

Exercise separate consumers after syncing `beta`:

1. Deselect an unchanged `beta` and run status.
2. Locally edit emitted `beta`, deselect it, and run status.
3. Repeat with unrepresented local structure, a foreign adapter at the owned removal path, or a linked/non-directory `.claude` or `.claude/skills` ancestor.

Pass when:

- The unchanged candidate is `remove`; the result is `changes_available` and exits `2`, but every projection and lock entry remains until sync.
- The edited candidate is `removal_blocked` with `local_changes` and exits `3`.
- Structural and adapter cases use `unrepresented_local_structure` and `adapter_ownership_unproven` respectively.
- Every blocked candidate retains its emitted directory, adapter, managed AGENTS.md row, and prior lock entry exactly.
- Removal-candidate adapters are represented by the owning skill result, not duplicated as active projection records.
- Status removes nothing in any case.

## Scenario 9: Active Managed Projections Participate in Status

Starting from a converged `alpha`, exercise three cases:

1. Remove or stale the managed AGENTS.md block.
2. Remove the correct active Claude adapter.
3. Replace the active adapter with a foreign file, directory, or wrong-target link.
4. Separately replace `.claude` or `.claude/skills` with a symlink/junction or non-directory ancestor before running status and sync.

Pass when:

- Stale or missing AGENTS.md is projection `update`, exits `2` when no conflict exists, and is repaired only by explicit sync.
- A missing adapter is projection `update`, exits `2`, and is linked only by explicit sync.
- Foreign active adapter content is projection `blocked` with `unmanaged_destination`, makes the overall result `attention_required`, and exits `3`.
- An unsafe adapter ancestor blocks affected adapters with `adapter_ownership_unproven`, exits `3`, is never traversed, and prevents sync from creating, replacing, or removing adapter leaves through it.
- Status preserves every projection in all cases.
- Ordinary sync also preserves and reports the foreign active adapter rather than recursively replacing it.
- After safe projection repairs are synced, status reports convergence and correct adapters are not recreated on repeated sync.

## Scenario 10: Conflicts Take Precedence Over Safe Work

1. Prepare one consumer where `alpha` has a safe registry update, AGENTS.md needs an update, and `beta` has local drift (optionally with stale source), a blocked removal, or a foreign/unsafe-ancestor adapter.
2. Run status.

Pass when:

- All skill and projection findings are reported; neither safe work nor conflicts are hidden.
- Summary counts separate unchanged, changes, and conflicts for skills and projections.
- The overall result is `attention_required` and exits `3`, not `2`.
- Human output does not imply ordinary sync alone will fully converge the project.
- The complete consumer snapshot is unchanged.

## Scenario 11: JSON Is a Clean Automation Contract

Run `skillfoo status --json` for converged, safe-change, projection-conflict, and mixed fixtures.

Pass when:

- Stdout contains exactly one parseable JSON document and no progress, prose, ANSI decoration, or extra summary.
- The document has `schemaVersion: 1`; an approved `outcome`; configured `registry` and `emit`; name-ordered `skills`; and `projections` ordered with `agents_md` first followed by adapters by skill name.
- Skill and projection states and conflict reasons belong to their approved vocabularies.
- `summary.skills` and `summary.projections` each count `unchanged`, `changes`, and `conflicts` records; overall outcome reflects both sections.
- Exit statuses remain `0`, `2`, or `3` according to outcome.
- Repeated runs produce structurally equal JSON.
- Stderr is empty for a local registry when no diagnostic is needed.

## Scenario 12: Validation and Failures Are Deterministic and Non-Mutating

Exercise a missing or invalid config, an unavailable registry, an explicitly selected missing skill, an unsafe desired name, a corrupt or unsafe lock entry, a filesystem inspection failure, and an unknown status option.

Also configure duplicate valid names once.

Pass when:

- Every invalid/failing case exits `1`, writes a concise diagnostic to stderr, emits no successful stdout result, and leaves the consumer unchanged.
- `--json` failures keep stdout empty.
- Unsafe desired and lock-derived names fail before traversal or consumer mutation using one cross-platform single-segment grammar.
- Duplicate valid config names are normalized by first occurrence and produce exactly one skill record, one adapter record, and one execution action rather than an error or duplicate output.
- Implicit registry ordering and JSON ordering are deterministic.
- `skillfoo status --help` documents `--json`, outcomes, and exit statuses and exits `0` without inspecting the project.

## Scenario 13: A Git Registry May Refresh Only Its Private Cache

Using an isolated temporary skillfoo cache and disposable Git registry:

1. Run status once to clone the registry into the private cache.
2. Advance the remote and run status again, including once with `--json`.

Pass when:

- The second result reflects the new remote revision rather than stale cached content.
- Clone/fetch progress goes to stderr and never corrupts JSON stdout.
- Cache contents may change, but the complete consumer snapshot remains identical.
- Refresh failure exits `1` without falling back to a misleading stale converged result.

## Durable Side Effects

Status creates no durable side effect in the consumer project. For a Git registry only, its allowed side effect is refreshing skillfoo's isolated private cache outside that project.

## Guardrails and Non-goals

- Status never applies skill, lock, AGENTS.md, adapter, or removal actions.
- Status describes ordinary sync only; it does not accept `--force` or resolve conflicts.
- Unrelated bespoke skills and adapters remain invisible and untouched.
- Sync preserves foreign active adapter content and retains exit `0` for safely reported conflicts.
- Emit-root migration, offline mode, initialization, multi-registry behavior, and lockfile version changes remain out of scope.

## Single Pass Criterion

In one disposable project: status before first sync reports safe skill and projection changes and exits `2` without writing; sync makes the complete managed state converged; a registry edit returns `2`; a local managed edit returns `3`; removing an active adapter returns `2`; replacing it with foreign content returns `3` and both status and sync preserve it. Every status invocation leaves a complete before/after consumer snapshot identical, and the same outcomes are parseable through clean `--json` stdout.

## Approval Gate

The projection and desired-path amendments were explicitly approved by the user on 2026-07-18.
