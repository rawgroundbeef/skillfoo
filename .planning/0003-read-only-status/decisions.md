# Decisions: Read-Only Reconciliation Status

Date: 2026-07-17

Amended after adversarial review on 2026-07-18.

## D1: Ship a Human and Automation Contract Together

This slice makes `skillfoo status` useful both interactively and in automation. Human output explains convergence, safe pending work, and attention-required conflicts. `--json` exposes a documented versioned result, and exit statuses communicate the overall outcome without parsing prose.

Primary results go to stdout. Progress and diagnostics go to stderr so JSON stdout remains valid. JSON keys, values, ordering, and exit meanings are public CLI API once shipped.

This decision was explicitly confirmed during grilling.

## D2: Separate Convergence, Safe Work, Conflict, and Failure

`skillfoo status` returns:

- `0` when the repository is converged.
- `1` when status cannot complete because of invocation, configuration, registry, or filesystem failure.
- `2` when at least one safe reconciliation change is pending and no conflicts exist.
- `3` when at least one conflict requires user attention, including when safe pending work also exists.

Conflict takes precedence because a mixed result is not fully resolvable by blindly running sync. This distinction is validated by the UAT before implementation.

## D3: Read-Only Protects the Consumer Project

Status may perform the same live registry refresh sync requires, including network access and updates to skillfoo's private cache under `~/.skillfoo`. It must not mutate the consumer project.

Inspecting only a stale cache could falsely report convergence. Registry progress belongs on stderr so it cannot corrupt JSON stdout.

This decision was confirmed during grilling.

## D4: Status Predicts Ordinary Safe Sync

Status computes the plan for plain `skillfoo sync`. It does not accept `--force` or reclassify drift as a safe update.

This keeps exit `2` safe for automation. A force-aware preview could otherwise label a destructive overwrite as ordinary pending work.

## D5: Use a Stable Per-Skill State and Reason Vocabulary

Skill states are `unchanged`, `add`, `update`, `lock_update`, `remove`, `drifted`, `blocked`, and `removal_blocked`.

- `unchanged` is converged.
- `add`, `update`, `lock_update`, and `remove` are safe pending changes.
- `drifted`, `blocked`, and `removal_blocked` are conflicts.

`lock_update` applies when disk matches the registry but the locked hash or recorded `source` differs from the next canonical lock entry. If content also needs adding or updating, that content state remains primary and the lock metadata is repaired as part of the action.

When a desired skill is `drifted`, plain sync preserves the complete prior lock entry—both hash and source. It does not pair a baseline hash from the old source with the newly configured source. The source is repaired only after a safe update, lock update, or explicit forced content resolution. JSON reports the drift conflict without inventing a second lock action for the same skill.

Stable conflict reasons are `local_changes`, `unmanaged_destination`, `unrepresented_local_structure`, `emitted_path_not_managed_directory`, and `adapter_ownership_unproven`. Reasons are omitted when they add no information.

## D6: Keep Bespoke Skills Invisible

Status does not enumerate unlocked repository skills. It reports `blocked` only when unowned content occupies the destination of a desired registry skill.

Absence from the lock means skillfoo does not treat the path as managed inventory. A separate audit command may inspect broader content later.

## D7: Share a Plan; Do Not Implement a Dry-Run Fork

Sync and status consume one typed reconciliation plan. Planning may read configuration, refresh or inspect the registry, read the lock, hash skill directories, inspect removal candidates, and render intended projections in memory, but it cannot mutate the consumer project.

Sync executes safe plan actions and preserves conflict destinations. Status renders the plan. Managed removal is split into inspection and execution so status cannot accidentally call deletion merely to discover safety.

This localized, reversible module refactor does not require an ADR.

## D8: Managed Projections Participate in Convergence

The planner compares the post-plan AGENTS.md projection and every active managed Claude adapter with current repository state.

Projection states are `unchanged`, `update`, and `blocked`:

- AGENTS.md is `update` when a pure post-plan rendering differs from current bytes; otherwise it is `unchanged`. Planned descriptions come from registry content for `add`/`update`, preserved local content for `drifted`, matching disk/registry content for converged or lock-only work, and the exact existing row for retained blocked removal.
- A missing active adapter is `update`.
- An active adapter already targeting the expected managed directory is `unchanged` and sync must not recreate it.
- A foreign file, directory, or wrong-target link at an active adapter path is `blocked` with reason `unmanaged_destination`; status reports a conflict and sync preserves it.
- Before inspecting any adapter leaf, the planner validates that existing `.claude` and `.claude/skills` ancestors are real directories rather than links, junctions, files, or special entries. An unsafe ancestor blocks each affected active adapter with `adapter_ownership_unproven` and blocks managed removal through that root; sync performs no adapter mutation through it. Permission or I/O failures remain operational failures.

Removal-candidate adapter safety remains represented by the owning skill's `remove` or `removal_blocked` result rather than a duplicate active-projection record. Unrelated adapter names remain invisible.

This amendment is required for the statement “converged” to mean that ordinary sync has no managed projection repair to perform.

## D9: Version the JSON Result

Successful inspection emits one document shaped as follows:

```json
{
  "schemaVersion": 1,
  "outcome": "changes_available",
  "registry": "../registry",
  "emit": ".agents/skills",
  "skills": [
    { "name": "alpha", "state": "unchanged" },
    { "name": "beta", "state": "update" }
  ],
  "projections": [
    { "kind": "agents_md", "state": "update" },
    { "kind": "claude_adapter", "skill": "alpha", "state": "unchanged" },
    { "kind": "claude_adapter", "skill": "beta", "state": "update" }
  ],
  "summary": {
    "skills": { "unchanged": 1, "changes": 1, "conflicts": 0 },
    "projections": { "unchanged": 1, "changes": 2, "conflicts": 0 }
  }
}
```

`outcome` is `converged`, `changes_available`, or `attention_required` and is derived across both skill and projection records. Skill records are ordered by name. Projection records order `agents_md` first and Claude adapters by skill name. A conflict may include a stable `reason`; inapplicable fields are omitted rather than set to `null`.

Summary counts count records within their named section. The AGENTS.md singleton record exists even when no managed skills are active; adapter records exist only for desired skills that remain managed after the plan.

Operational failures return exit `1`, leave stdout empty even with `--json`, and write a concise diagnostic to stderr. Registry progress also goes to stderr.

## D10: Preserve Sync Command Semantics While Making Projection Writes Safe

Status owns the new `0`/`2`/`3` reconciliation contract. Sync retains exit `0` for safely reported drifted, blocked, removal-blocked, or adapter-blocked conflicts and retains its accepted `--force` behavior for managed skill content.

Sync may change projection and lock behavior only to match the shared safety plan: it skips a correct adapter, preserves/reports a foreign or unsafe-ancestor adapter instead of recursively replacing it, and preserves the complete prior lock entry while a skill remains drifted. Drifted AGENTS descriptions continue to come from local emitted content. These are safety and consistency corrections required by truthful status, not authorization for broader redesign.

Status supports `--json` and command-level help and rejects unknown flags. Use Node's `parseArgs` rather than extending `argv.includes` into general parsing. Any broader legacy sync parsing cleanup must preserve accepted syntax.

## D11: Fail Closed on Desired-Path Shape

Validate desired names with the same cross-platform one-segment grammar used for lock-derived removal names before consumer inspection.

- With no lock, any existing top-level destination shape is `blocked` with `unmanaged_destination`, including an empty or ignored-only directory, file, symlink, or special entry.
- With a lock, an absent destination is `add`.
- With a lock, a top-level non-directory or symlink is `drifted` with `emitted_path_not_managed_directory` and is never traversed.
- With a lock, a real directory is compared by its represented regular-file manifest even when empty. Nested unrepresented structure is preserved during active reconciliation and is considered separately if whole-directory removal is later requested.
- Inspection I/O or permission failures are operational exit `1`.

These rules close the current ambiguity without adding another public skill state.

## D12: Normalize the Desired Set Deterministically

Explicit duplicate skill names are normalized by first occurrence. They produce one plan record, one set of writes, and one projection row rather than an error or duplicate work.

Implicit registry enumeration is deterministic. Every name that enters the desired set must pass the cross-platform path-segment validation; an unsafe desired name is an operational configuration/registry failure before consumer mutation.

Status JSON remains name-sorted regardless of config order. Sync may preserve first-occurrence order where projection presentation already reflects configuration order.

## Documentation Impact

Reusable domain terms are recorded in [`CONTEXT.md`](../../CONTEXT.md). No ADR is required because plan/executor separation and projection inspection are localized safety changes within existing reconciliation ownership.

## Rejected Alternatives

### Human-only status with exit status 0 whenever inspection succeeds

Rejected because automation would have to scrape presentation text.

### Return one non-zero code for every non-converged result

Rejected because callers could not distinguish “plain sync can safely resolve this” from “a user decision is required.”

### Inspect only the last cached remote registry

Rejected because status could report convergence after upstream changed.

### Enumerate bespoke skills as a status category

Rejected because it expands inventory beyond paths with skillfoo ownership evidence.

### Add `status --force`

Rejected because it would mix destructive preview semantics into an otherwise safe automation signal.

### Exclude active projections from convergence

Rejected after adversarial review because status could return `converged` while ordinary sync still repaired AGENTS.md or replaced a Claude adapter.
