# Bootstrap: Read-Only Reconciliation Status

Implement `skillfoo status` as the read-only inspection half of the same complete reconciliation plan executed by ordinary `skillfoo sync`. Human output must answer whether sync is needed and sufficient; JSON plus exit statuses must provide the same stable automation contract without changing the consumer project.

## Start Here

Work on the existing `read-only-status` branch. Ship this slice as one pull request.

Read these sources in order before editing:

1. [`AGENTS.md`](../../AGENTS.md) — repository instructions and available zone skills.
2. [`CONTEXT.md`](../../CONTEXT.md) — reconciliation vocabulary and ownership boundaries.
3. [`discovery.md`](./discovery.md) — code evidence, complete state model, desired-path rules, scope, and implementation seams.
4. [`decisions.md`](./decisions.md) — approved public contracts, architecture, safety amendments, and rejected alternatives.
5. [`uat.md`](./uat.md) — user-approved outside-in behavior and mutation-free acceptance suite.
6. [`prd.md`](./prd.md) — user stories, module responsibilities, implementation decisions, and testing expectations.
7. [`follow-ups.md`](./follow-ups.md) — adjacent work that must not leak into this slice.

Load `.agents/skills/typescript-cli/SKILL.md` and its required engineering reference before changing CLI parsing, output, filesystem behavior, packaging, or tests.

## Contract That Must Not Be Violated

- `skillfoo status` computes the ordinary non-force plan and never executes it.
- Exit statuses are `0` converged, `1` usage or operational failure, `2` safe pending changes only, and `3` any conflict. Conflict wins when safe work coexists.
- Skill states are `unchanged`, `add`, `update`, `lock_update`, `remove`, `drifted`, `blocked`, and `removal_blocked`.
- Projection states are `unchanged`, `update`, and `blocked`.
- Conflict reasons are `local_changes`, `unmanaged_destination`, `unrepresented_local_structure`, `emitted_path_not_managed_directory`, and `adapter_ownership_unproven`.
- `lock_update` includes a stale locked hash or `source` when emitted content already matches the current registry.
- Drift preserves the complete prior lock hash/source pair. Plain sync does not repair source metadata while content remains conflicted.
- JSON uses `schemaVersion: 1`; stable outcome/state/reason values; name-sorted skills; AGENTS.md-first then name-sorted adapter projections; and separate skill/projection summaries.
- Successful JSON is the only stdout content in JSON mode. Failures leave stdout empty. Registry progress and diagnostics go to stderr.
- Read-only protects the complete consumer project. A Git registry may update only skillfoo's private cache outside it.
- Unrelated bespoke skills and adapters remain invisible. Any existing unlocked desired destination is `blocked`, regardless of top-level entry shape.
- Never traverse a top-level desired symlink. A locked top-level file, link, or special entry is `drifted` with `emitted_path_not_managed_directory`.
- Duplicate configured names normalize by first occurrence. Every desired and lock-derived name uses one shared cross-platform single-segment validator.
- Managed AGENTS.md and active Claude adapters participate in convergence.
- Planned AGENTS descriptions use registry content for additions/updates, preserved local content for drift, and exact existing rows for retained blocked removals.
- A correct active adapter is unchanged and must not be recreated. A missing adapter is a safe update. A foreign active adapter destination is blocked, reported, and preserved by both status and sync.
- Existing `.claude` and `.claude/skills` ancestors must be real directories. Links, junctions, non-directories, or special entries block affected adapter work with `adapter_ownership_unproven`; never traverse them.
- Status has no `--force` mode and resolves no conflict.
- Sync retains accepted force behavior for managed skill content and exit `0` when it safely reports conflicts.
- Do not change lockfile version 1 or add emit-root migration.

## Verified Implementation Pointers

- `src/sync.ts` currently combines registry enumeration, desired validation, three-way hash classification, mutation, next-lock construction, removal execution, projection updates, and console rendering. Extract classification before adding status; do not clone its branch tree.
- `src/sync.ts` treats `destHash === registryHash` as `unchanged` while rewriting the lock. It also writes the configured registry `source` into every next lock entry. The plan must expose `lock_update` for hash or source-only canonicalization.
- `src/sync.ts` currently rewrites `source` even when preserving a drifted baseline hash. Correct this by carrying the complete prior entry for drift; update source only when content safely converges or force resolves it.
- `src/sync.ts` currently calls `walkFiles` on an existing desired path before proving its top-level type. Add lstat-safe destination inspection before any walk and share the existing removal name grammar rather than inventing another path rule.
- `src/config.ts` accepts duplicate string names. Normalize the desired set once by first occurrence so planner records and sync actions are unique.
- `src/removal.ts` has conservative emitted-directory and adapter ownership checks, but inspection is private and `removeManagedSkill` couples preflight to deletion. Expose typed inspection and separate safe execution.
- `src/emit.ts` combines AGENTS.md rendering with writes and derives descriptions from current emitted files. Extract a pure renderer that accepts post-plan descriptions so additions and updates can be previewed before their files exist locally.
- Preserve the current local-description behavior for drifted active skills; registry descriptions apply only to content the plan will install.
- `src/emit.ts` currently removes every active adapter path recursively before recreating it. Replace this with shared adapter inspection: skip a correct target, link a missing target, and preserve/report a foreign target. This safety fix is explicitly in scope.
- Validate `.claude` and `.claude/skills` ancestor shapes before leaf adapter inspection for both active and removal flows; a leaf-only check can still escape through a linked parent.
- Removal-blocked AGENTS.md rows must retain their existing bytes. Preserve the current active-versus-retained rendering distinction when moving to pure projection planning.
- `src/registry.ts` writes clone/fetch progress with `console.log` and fixes its cache under the user's home directory. Add a narrow reporter and injectable cache root so status can use stderr and tests never touch the developer's real cache.
- `src/cli.ts` already returns numeric statuses and accepts injected I/O, but dispatch and flags are hand-parsed. Add strict `status [--json]` parsing with Node's built-in argument parser while preserving top-level help/version and accepted sync syntax.
- `src/skilldir.ts` owns the regular-file walk and manifest hash. Keep planner and executor on this definition; do not make active sync delete nested structure the manifest intentionally ignores.
- `test/sync.test.ts`, `test/removal.test.ts`, `test/emit.test.ts`, and `test/cli.test.ts` hold the current behavior surface. Add focused planner, projection-inspection, and renderer tests rather than routing the whole truth table through subprocesses.
- The package is ESM TypeScript for Node 22+, emits a compiled npm executable, uses `node:test`, and tests Node 22/24 on Linux, macOS, and Windows. Preserve that stack and matrix.
- The pre-implementation baseline is green with 40 tests passing under `npm run check` on 2026-07-18.

## Suggested Implementation Sequence

1. Define typed skill and projection records, summaries, stable reasons, and outcome derivation.
2. Extract the shared one-segment name validator and deterministic desired-set normalization.
3. Add safe desired-path inspection and the consumer-read-only skill planner, including lock hash/source reconciliation.
4. Split removal inspection from execution and prove inspection cannot delete.
5. Extract pure post-plan AGENTS.md rendering while preserving retained removal-blocked row bytes.
6. Centralize adapter target inspection and represent missing, correct, and foreign active destinations in the plan.
7. Complete the full plan, including projection records and summary/outcome aggregation.
8. Refactor sync to execute safe plan actions, skip correct adapters, preserve adapter conflicts, and pass all existing regressions.
9. Add human and JSON status renderers.
10. Add strict status parsing, command help, stdout/stderr routing, and exit mapping.
11. Inject registry progress and cache location without changing sync's supported registry behavior.
12. Add planner truth-table, projection, renderer, process, mutation-free, package, and isolated Git-registry tests.
13. Run the approved UAT against a disposable installed test project.

If extraction reveals a case that cannot be represented by the approved vocabulary, update discovery, decisions, UAT, and PRD before inventing a public state or reason.

## Verification Gates

- Run `npm run check` for typecheck, build, and the complete automated suite.
- Spawn the compiled executable and assert exact exit status plus clean stdout/stderr boundaries for help, convergence, skill-only changes, projection-only changes, mixed conflicts, JSON, invalid flags, and operational failures.
- Run `npm pack`, inspect the package contents, install the tarball into a temporary project, and invoke the installed `skillfoo` binary.
- Execute every scenario in [`uat.md`](./uat.md) with disposable local registry and consumer directories.
- Snapshot ignored files, directory entries, and symlink targets for mutation-free assertions; Git-visible changes alone are insufficient.
- Use an instrumented adapter executor or reliable link identity/metadata assertion to prove sync did not recreate a correct link; target equality alone cannot prove that.
- Isolate the skillfoo cache for Git tests and UAT. Never clone into or remove the developer's real `~/.skillfoo` cache.
- Retain Windows coverage for path validation, symlink/junction behavior, adapter ownership, and reserved names.
- Run `git diff --check` and review the final diff for accidental scope expansion, unstable machine output, or unintended sync behavior changes beyond the approved adapter-safety and drifted lock-source corrections.

## Out of Scope and Follow-ups

Do not implement force preview, offline status, destructive conflict resolution, unrelated bespoke/adapter inventory, emit-root migration, initialization, multi-registry support, lockfile v2, or automatic commits. Record new adjacent findings in [`follow-ups.md`](./follow-ups.md).

## Final Instruction

Execute from these documents and verified repository code, not conversation memory. When implementation and UAT pass, load the repository's `pr` skill and prepare the pull request from the final diff.
