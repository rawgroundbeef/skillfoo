# Follow-ups: Safe Managed Skill Removal

Date: 2026-07-17

## Bugs Discovered

- **2026-07-17 · Lost removal provenance.** Existing sync drops deselected names from the lock without reconciling their emitted directories, adapters, or AGENTS.md entries.
- **2026-07-17 · Empty selection skips cleanup.** `skills: []` skips projection updates entirely, leaving stale generated state while clearing ownership evidence.

## Deferred Slice Ideas

- **2026-07-17 · Read-only status.** Add `skillfoo status` with stable machine-readable states and CI exit semantics.
- **2026-07-17 · Explicit removal resolution.** Design a path for discarding local changes, force-removing a candidate, or intentionally converting it to bespoke content.
- **2026-07-17 · Initialization.** Add `skillfoo init` after the desired-state model is trustworthy.
- **2026-07-17 · Optional commits.** Consider automatic commits only after sync and conflict behavior are stable.
- **2026-07-17 · Registry fan-out.** Build remote installation and multi-source behavior separately.
- **2026-07-17 · Emit-root provenance.** Evolve the lock or add an explicit migration workflow that records the previous emit root before moving or cleaning managed skills across an `emit` configuration change.

## Product Questions

- **2026-07-17 · Resolution owner.** Which command should own destructive resolution of a blocked removal?
- **2026-07-17 · CI semantics.** Should future CI treat any blocked removal as non-zero, or distinguish drift from conflicts?
- **2026-07-17 · Managed-to-bespoke conversion.** Does intentional conversion need a first-class workflow?

## Cleanup / Refactor Notes

- **2026-07-17 · Pure reconciliation plan.** Extract a plan that sync can execute and a future status command can inspect without duplicating state classification.
- **2026-07-17 · Symmetric ownership checks.** Centralize projection ownership checks so installation and removal use the same safety vocabulary.
- **2026-07-17 · Blocked-removal diagnostics.** Carry the offending structural entry through removal results so reports can identify what made otherwise matching content unsafe to delete.
- **2026-07-17 · Stale private planning context.** Refresh the separate planning repository's top-level context and todo after this slice ships; both still describe earlier lock and consumer milestones as pending.

## Environment / Testing Notes

- **2026-07-17 · Cross-platform adapters.** Exercise path and adapter behavior on Windows CI as well as macOS/Linux symlinks.
- **2026-07-17 · Safe dogfood target.** Use a disposable branch or fixture consumer before touching a committed skill in `hey.lol`.
- **2026-07-17 · Separate planning bootstrap.** Preserve the planning repository's existing untracked `BOOTSTRAP.md`; it belongs to the earlier TypeScript slice and is outside this slice.
