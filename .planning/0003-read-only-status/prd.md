# PRD: Read-Only Reconciliation Status

**Date:** 2026-07-18
**Status:** Draft

## Problem Statement

Skillfoo users currently have to run the mutating sync command to learn whether a repository's complete managed state agrees with its configured registry. They cannot inspect pending skill additions, updates, lock repairs, removals, managed-index repairs, adapter repairs, or conflicts before deciding to act. CI likewise cannot distinguish a converged repository from safe pending work or a conflict that ordinary sync must preserve for human attention.

The current classification is embedded in sync's mutation flow, while active projections are written separately and are not ownership-safe in every case. A second status-only approximation could disagree with sync. A shallow dry-run flag would also make the no-consumer-mutation guarantee depend on every writer remembering to branch correctly.

## Solution

Add `skillfoo status` as the read-only inspection half of reconciliation. Status and sync consume one typed plan covering desired and previously managed skills, lock metadata, the managed AGENTS.md projection, active Claude adapters, and safe managed removal. Status renders that plan without executing it; ordinary sync executes its safe actions and preserves conflicts.

Human output answers whether sync is unnecessary, can safely apply all pending work, or will leave a conflict requiring a user decision. `skillfoo status --json` exposes the same result through a versioned schema. Exit statuses let automation act without scraping prose: `0` means converged, `2` means ordinary sync can safely apply all pending work, `3` means at least one conflict requires attention, and `1` means inspection failed.

For Git-backed registries, status refreshes skillfoo's private registry cache so the answer reflects current upstream state. That cache update and network access are allowed; consumer-project mutation is not.

## User Stories

1. > As a developer, I want to check whether my complete managed skill state is converged before running sync, so that I know whether reconciliation is needed.

2. > As a developer with a fresh consumer, I want status to preview skill, AGENTS.md, and adapter creation without creating them, so that I can inspect the first sync safely.

3. > As a developer, I want status to identify a safe registry update and its post-sync AGENTS.md description, so that I know what ordinary sync will apply rather than seeing stale projection metadata.

4. > As a developer, I want status to identify when skill bytes match but the locked hash or source is stale, so that durable lock work is not mislabeled as convergence.

5. > As a developer with local edits, I want drift distinguished from a safe update, so that I know ordinary sync will preserve my work.

6. > As a developer with unowned content at a desired skill destination, I want every destination shape blocked without traversal, so that files, empty directories, symlinks, and special entries are not mistaken for owned content.

7. > As a developer whose locked skill directory was replaced by a file or symlink, I want status to report managed drift without following it, so that foreign targets remain safe.

8. > As a developer who deselected an unchanged managed skill, I want status to preview safe removal, so that I understand what the next sync will remove.

9. > As a developer who modified a deselected managed skill or its adapter, I want status to report removal as blocked, so that every owned projection and the prior lock remain intact.

10. > As a developer with a stale or missing managed AGENTS.md block, I want status to report a safe projection update, so that I know sync can repair it.

11. > As a developer with a missing or already-correct active adapter, I want status to distinguish repair from convergence, so that sync creates only what is missing and does not recreate correct links.

12. > As a developer with foreign content at an active adapter path, I want both status and sync to preserve it as a conflict, so that a routine sync cannot recursively replace content it does not own.

13. > As a developer with unrelated bespoke skills or adapters, I want them omitted and untouched, so that status remains limited to managed ownership.

14. > As a developer viewing a mixed repository, I want all safe skill work, projection work, and conflicts reported together, so that the highest-severity outcome does not hide useful detail.

15. > As a CI author, I want safe pending work and conflicts to have different statuses, so that automation can distinguish “run ordinary sync” from “ask a human.”

16. > As an automation author, I want clean, versioned, deterministically ordered JSON with stable states and reasons, so that output can be piped directly into a parser without scraping prose or filtering progress.

17. > As a developer with duplicate or unsafe configured names, I want deterministic normalization or early validation, so that redundant input cannot duplicate writes and hostile names cannot become paths.

18. > As a developer using a remote registry, I want status to refresh an isolated private cache before comparing, so that stale cached content cannot produce a false converged result.

19. > As a developer with invalid configuration, an unavailable registry, a corrupt lock, inaccessible files, or repeated inspection, I want deterministic non-mutating results, so that status remains safe when inputs are broken and habitual when they are stable.

20. > As a developer using terminals, pipes, or assistive tooling, I want plain meaningful output and project-independent help for JSON and exit semantics, so that status remains legible and integrable in every environment.

## Implementation Decisions

- Introduce one deep reconciliation-planning module that owns desired-set normalization, cross-platform name validation, safe top-level destination inspection, three-way content comparison, lock-source comparison, removal preflight, intended projection calculation, summary counts, and overall outcome. It returns typed data and cannot write to the consumer project.
- Use stable skill states `unchanged`, `add`, `update`, `lock_update`, `remove`, `drifted`, `blocked`, and `removal_blocked`. Treat the first as converged, the next four as safe changes, and the final three as conflicts.
- Use stable projection states `unchanged`, `update`, and `blocked`. Represent AGENTS.md once and represent one adapter for each desired skill that remains managed after the plan. Removal-candidate adapters remain part of their skill's removal result.
- Use stable conflict reasons `local_changes`, `unmanaged_destination`, `unrepresented_local_structure`, `emitted_path_not_managed_directory`, and `adapter_ownership_unproven`. Omit a reason where it adds no information.
- Derive overall outcome across both skill and projection records. Any conflict makes the outcome attention-required even when safe pending work is also present.
- Normalize duplicate explicit skill names by first occurrence. Validate every desired name with one cross-platform single-segment rule shared with lock-derived names. Make implicit registry enumeration and machine output deterministic.
- Inspect an unlocked desired destination with filesystem metadata before any regular-file walk. Any existing top-level shape is a blocked unowned destination. For a locked desired skill, treat a missing destination as an add, a real directory as hashable managed content, and a top-level file, link, or special entry as drift that must not be traversed.
- Keep nested ignored, linked, empty, and special structure outside the active regular-file manifest because ordinary active sync preserves it. Continue treating that structure as a removal blocker when whole-directory deletion is requested.
- Define lock update as canonical metadata work. If disk matches the registry but either the locked hash or recorded source differs, report a lock update. Content actions remain primary when they also repair lock metadata. While content is drifted, preserve the complete prior hash/source entry and expose only the conflict; repair source after safe convergence or explicit force resolution.
- Split managed removal into inspection and execution. Inspection proves emitted-directory structure and hash safety plus adapter ownership without mutation. Execution accepts an already inspected safe candidate and is available to sync only.
- Split managed AGENTS.md rendering from writing. Render against the post-plan active and retained sets using action-specific descriptions: registry for additions/updates, local emitted content for drift, and exact retained rows for blocked removal. Then compare intended bytes with current bytes.
- Split active adapter inspection from mutation and centralize expected-target comparison with removal safety. Validate `.claude` and `.claude/skills` ancestors before leaf inspection. A missing expected adapter is a safe update; a correct target is unchanged; a foreign leaf is blocked and preserved; a linked or non-directory ancestor blocks adapter work with ownership-unproven.
- Refactor sync into plan and execute phases. Execute safe skill and projection actions, preserve conflicts, avoid recreating correct adapters, and retain current force behavior for managed skill content. Sync continues to exit successfully when it safely reports conflicts.
- Keep status fixed to the ordinary non-force plan. Do not accept a force-preview option because exit `2` must always mean plain sync is a safe next action.
- Provide separate human and JSON renderers over the typed plan. Human prose and symbols may evolve, while JSON keys, outcome values, state and reason values, ordering, schema version, and exit meanings are public API.
- Version the JSON document with `schemaVersion: 1`. Include configured registry and emit values, name-ordered skill records, projection records ordered with AGENTS.md first and adapters by skill name, and separate skill/projection summaries containing unchanged, change, and conflict counts.
- Emit successful results to stdout. Send registry progress and diagnostics to stderr. On an operational failure, return `1` and leave stdout empty even when JSON was requested.
- Route registry refresh progress through an injected reporter and make its cache root injectable for tests. Status uses stderr; sync preserves its established presentation.
- Extend the CLI boundary with strict status parsing, command-level help, and unknown-option rejection. Use the runtime's built-in argument parser for this small surface rather than extending membership checks.
- Define read-only relative to the consumer project. Local-registry status reads only; Git-registry status may clone or refresh skillfoo's private cache outside the consumer.
- Preserve the ownership boundary. Do not enumerate unrelated bespoke skills or adapters. Do not change lockfile version 1 or infer historical emit roots.

## Testing Decisions

- Add a planner truth table covering registry hash, locked hash/source, emitted absence/content/top-level shape, force setting, explicit and implicit selection, duplicates, and removal outcome. Assert typed records and aggregate outcome rather than rendered strings.
- Test desired-path inspection with unlocked and locked directories, empty or ignored-only directories, files, top-level links, nested links, special entries where available, permission failures, and unsafe names. Assert foreign links are never traversed.
- Unit-test removal inspection independently from execution. Prove every blocked reason leaves both projections untouched and that inspection itself performs no writes.
- Unit-test pure AGENTS.md planning against pending additions, updates, drift, safe removals, retained blocked removals, missing blocks, stale rows, LF/CRLF content, and repository-authored surrounding bytes.
- Unit-test adapter inspection for missing paths, correct relative links, correct Windows junctions, dangling expected links, wrong-target links, foreign files/directories, and inaccessible paths.
- Retain sync integration coverage while moving it onto the shared planner. Existing addition, update, drift protection, force, safe removal, blocked removal, lock ordering, managed-index, and adapter behavior must remain observable except for the approved active-adapter safety and drifted lock-source preservation corrections.
- Add an integration test proving sync preserves and reports a foreign active adapter and skips recreation of a correct one.
- Prove correct-link non-recreation through an instrumented adapter executor or reliable link identity/metadata assertion; comparing only the post-sync target is insufficient.
- Cover linked/junction and non-directory adapter ancestors for both active projection and managed removal flows, asserting no traversal or mutation outside the intended adapter root.
- Add renderer tests that check human output semantically and JSON structurally. Assert all stable vocabulary, projection ordering, deterministic skill ordering, separate summary sections, outcome precedence, and omission of inapplicable fields.
- Spawn the compiled CLI to assert stdout, stderr, and exit status for convergence, skill-only changes, projection-only changes, mixed conflicts, invalid usage, configuration or registry failure, help, and JSON output.
- Snapshot the complete disposable consumer before and after status, including regular-file bytes, directory entries, and link targets. Do not rely only on Git state because ignored lockfiles can hide mutation.
- Cover lock-only hash and source updates explicitly, including drift combined with source mismatch and the transition to convergence after safe resolution.
- Cover unrelated bespoke content separately from desired collisions so invisibility is not confused with blocked ownership.
- Test Git-backed refresh behavior with a disposable remote and isolated cache. Prove upstream changes are observed, progress stays on stderr, refresh failure does not silently use stale data, and consumer state is unchanged.
- Exercise path and adapter inspection on Windows CI as well as Unix-like systems because junction, separator, and reserved-name behavior differ.
- Run typecheck, build, the complete automated suite, and a package smoke test that installs the packed artifact into a disposable project and invokes the installed executable.
- Complete the approved outside-in UAT in a disposable project before opening the pull request.

## Out of Scope

- Applying reconciliation from status.
- `status --force`, destructive previews, or new conflict-resolution operations.
- Offline or cached-only registry inspection.
- Enumerating, adopting, or auditing unrelated bespoke skills and adapter names.
- Destructive resolution of foreign active adapter content.
- Emit-root migration or historical emit-root provenance.
- Initialization, multiple registries, remote installation, automatic commits, or GitHub App behavior.
- Changing lockfile version 1.
- Changing sync's exit `0` contract for safely reported conflicts.

## Open Questions

None block implementation. Real CI usage should later validate whether separate safe-pending and attention-required exit statuses remain worth the additional public contract; changing them is not part of this slice.
