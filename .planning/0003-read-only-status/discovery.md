# Discovery: Read-Only Reconciliation Status

Date: 2026-07-17

Adversarial review amended the scope on 2026-07-18 to include active managed projections. Without that amendment, status could report convergence while sync would still repair AGENTS.md or replace a Claude adapter.

## Kickoff

Give users a way to tell whether a repository is converged with its configured registry before deciding to run `skillfoo sync`.

## Problem Evidence

- `skillfoo sync` already classifies desired skills as added, updated, unchanged, drifted, or blocked, and classifies deselected managed skills as removed or removal-blocked.
- Classification currently happens inside the mutating sync path, so callers cannot inspect the same reconciliation state without risking repository writes.
- Sync also rewrites the lock and AGENTS.md and recreates active Claude adapters. Skill-content classification alone therefore cannot truthfully answer whether the complete managed state is converged.
- Existing follow-ups explicitly defer a read-only `skillfoo status` command, a shared reconciliation plan, and stable CI semantics.
- The current CLI only exposes `sync`; automation cannot distinguish convergence, safe pending work, and conflicts requiring human attention.
- Disk content can already match the registry while lock metadata still needs repair because the locked hash or recorded source differs.
- Desired-path inspection currently calls the regular-file walker before proving the top-level entry is a real directory, which can traverse an unowned symlink or fail inconsistently on other entry types.
- Active Claude adapter creation currently removes any existing path before linking, even when ownership cannot be proven. A truthful safe-sync preview requires the planner and executor to preserve foreign adapter content as a conflict.

## Refined Problem Statement

`skillfoo status` should compute the complete reconciliation plan that ordinary sync would execute across managed skills, lock metadata, AGENTS.md, active Claude adapters, and safe removals. It should tell a person or automation whether sync is unnecessary, can safely apply all pending work, or will leave a conflict requiring a user decision. Status itself must leave the consumer repository unchanged.

## Domain Terms

- **Reconciliation plan**: A complete read-only classification of managed skills and projections that sync may execute and status may render.
- **Converged**: Ordinary reconciliation has no pending managed-skill or projection change and no conflict.
- **Pending change**: A managed-skill or projection difference that ordinary reconciliation can safely apply.
- **Conflict**: A managed-skill or projection difference that reconciliation preserves until a user makes an explicit choice.
- **Operational failure**: Status could not evaluate reconciliation because invocation, configuration, registry access, or repository inspection failed.

Reusable language is recorded in [`CONTEXT.md`](../../CONTEXT.md).

## Skill States

| Stable state | Meaning | Overall class |
| --- | --- | --- |
| `unchanged` | Disk, registry, and lock metadata agree | Converged |
| `add` | A desired skill is absent and can be written | Pending change |
| `update` | Registry changed while the managed local copy stayed at its baseline | Pending change |
| `lock_update` | Disk matches the registry but the locked hash or source metadata is stale | Pending change |
| `remove` | A no-longer-desired managed skill is safe to remove | Pending change |
| `drifted` | A managed desired skill has local changes or an unsafe top-level shape that ordinary sync preserves | Conflict |
| `blocked` | A desired name collides with content skillfoo does not own | Conflict |
| `removal_blocked` | A no-longer-desired managed skill cannot be safely removed | Conflict |

## Projection States

The plan contains one AGENTS.md record and one Claude adapter record for each desired managed skill that should remain active after sync.

| Stable state | Meaning | Overall class |
| --- | --- | --- |
| `unchanged` | The projection already has its intended semantic state | Converged |
| `update` | The projection can be safely created, updated, or removed | Pending change |
| `blocked` | The projection destination contains content whose ownership cannot be proven | Conflict |

AGENTS.md planning compares current bytes with a pure rendering of the post-plan managed set. A correct active adapter is semantically unchanged and must not be recreated. A missing active adapter is a safe update. A foreign file, directory, or wrong-target link at an active adapter path is blocked and preserved.

## Desired-Path Rules

- Desired names use the same cross-platform single-segment grammar already enforced for lock-derived removal names.
- Explicit duplicate names represent one desired skill; normalize them by first occurrence rather than producing duplicate JSON records or repeated writes.
- Registry enumeration for implicit selection is deterministic. An unsafe name becomes an operational failure if it would enter the desired set.
- With no lock entry, any existing top-level destination—including an empty directory, ignored-only directory, file, symlink, or special entry—is `blocked` with reason `unmanaged_destination`.
- With a lock entry, an absent destination is `add`. A top-level file, symlink, or special entry is `drifted` with reason `emitted_path_not_managed_directory` and is never traversed.
- A locked real directory is compared using the existing regular-file manifest even when that manifest is empty. Nested ignored, linked, empty, or special structure is preserved by ordinary active sync and does not independently change the active skill state; it still blocks whole-directory removal when the skill is deselected.
- Permission or I/O failures during inspection are operational failures with exit `1`.

## Required Behavior

1. `skillfoo status` loads the same config, registry, lock, desired-path, removal-safety, and managed-projection inputs as sync and computes a reconciliation plan without executing it.
2. Human output names affected skills and projections and gives an overall next step.
3. `skillfoo status --json` emits exactly one parseable JSON document to stdout with no progress or diagnostics mixed into it.
4. Exit status is `0` for convergence, `2` for safe pending changes only, `3` for any conflict, and `1` when inspection cannot complete.
5. Skill and projection findings are all retained in a mixed plan; any conflict takes precedence in the overall outcome.
6. Git registry refreshes may update skillfoo's private cache, but status must leave the consumer project's files, directories, links, and lock unchanged.
7. Bespoke skills that do not collide with desired skill or adapter destinations are neither reported nor inspected as managed inventory.
8. Invalid desired names, corrupt lockfiles, unsafe lock-derived paths, unavailable registries, malformed CLI options, and filesystem inspection failures are operational errors without consumer mutation.
9. Sync executes only safe plan actions, preserves conflict destinations, and does not recreate semantically unchanged active adapters.
10. Repeated status calls over unchanged inputs return structurally equivalent results and leave the consumer unchanged.

## Constraints

- Human prose is presentation; JSON keys, states, reasons, outcomes, ordering, and exit statuses are public automation API.
- JSON stdout must remain parseable and free of progress or diagnostic text.
- Status and sync must share one typed plan rather than maintain parallel branch trees.
- Status predicts ordinary safe sync and never previews the destructive effect of `sync --force`.
- Read-only protects the consumer project; live Git registry cache refresh is allowed outside it.
- Bespoke content remains outside skillfoo ownership unless it blocks a desired managed destination.
- Projection inspection must use the post-plan managed set and action-specific planned descriptions: registry content for additions/updates, preserved local content for drift, and existing row bytes for retained blocked removals.

## Non-goals

- Applying any reconciliation change from status.
- A `status --force` preview or new destructive resolution behavior.
- An offline or cached-only mode.
- Enumerating, adopting, or auditing unrelated bespoke skills.
- Auditing adapters for names that are neither active managed skills nor managed removal candidates.
- Changing sync's exit `0` semantics for safely reported conflicts.
- `skillfoo init`, multi-registry support, automatic commits, or emit-root migration.
- Changing lockfile version 1.

## Implementation Seams

- Extract desired normalization, top-level path inspection, three-way state classification, lock-source comparison, removal preflight, and projection comparison into a typed consumer-read-only planner.
- Split managed-removal inspection from mutation so status can reuse the exact removal decision without calling deletion functions.
- Split AGENTS.md rendering from writing and make it accept the post-plan active and retained sets plus planned descriptions, so the planner can compare bytes before skill updates execute.
- Split active adapter inspection from mutation. Validate `.claude` and `.claude/skills` ancestors before leaf inspection, reuse path-target comparison with removal inspection, and make sync skip correct links and preserve foreign destinations.
- Have sync execute the shared plan while preserving its existing `--force` and command-exit behavior; have status render the ordinary non-force plan without an executor.
- Keep human and JSON renderers outside the planner.
- Route registry refresh progress through injected output rather than direct `console.log`, allowing status to use stderr.
- Validate status arguments at the CLI boundary and keep the entrypoint responsible for parsing, rendering, and returning an exit status.

## Resolved Scope Questions

- Safe pending work and conflicts use distinct non-zero exit statuses so automation can decide whether plain sync is sufficient.
- Read-only protects the consumer project; refreshing skillfoo's private remote-registry cache is allowed.
- Lock-only repair includes stale source metadata as well as a stale hash.
- A drift conflict preserves the complete prior lock entry; source metadata is repaired only when content can safely converge.
- Active managed AGENTS.md and Claude adapters participate in convergence; unrelated adapter inventory does not.
- Drifted skill descriptions come from the preserved local content, matching sync's established projection behavior.
- A linked or non-directory `.claude` or `.claude/skills` ancestor blocks active adapter work and managed removal with `adapter_ownership_unproven`.
- Foreign active adapter content is a preserved projection conflict, not a safe overwrite.
- Bespoke skills remain invisible unless they collide with a desired name.
- Duplicate configured names are normalized by first occurrence; unsafe desired names fail validation.
- The command describes ordinary sync only; force preview is deferred.
