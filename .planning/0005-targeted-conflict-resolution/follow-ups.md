# Follow-ups: Targeted Conflict Resolution

Date: 2026-07-18

## Bugs Discovered

- _(none yet)_

## Deferred Slice Ideas

- **2026-07-18 · Intentional local outcome.** Design how a user keeps local
  edits without seeing the same Conflict forever: persisted override, selection
  change, or Managed-to-Bespoke conversion.
- **2026-07-18 · Registry promotion.** Promote local skill edits back to the
  source registry through an explicit git-native workflow rather than making a
  consumer-side resolver mutate a remote source implicitly.
- **2026-07-18 · Other destructive resolutions.** Separately design Bespoke
  adoption/replacement, force-removal, and foreign-adapter replacement around
  their distinct ownership proofs.
- **2026-07-18 · Selection management.** Add a supported command for changing
  Desired skills after initialization without hand-editing `.skillfoo.yml`.
- **2026-07-18 · Crash recovery.** If real-world failures justify it, design a
  durable transaction journal, fsync policy, restart-time discovery, and
  explicit recovery/cleanup command for interrupted resolution processes.

## Product Questions

- _(none deferred yet)_

## Cleanup / Refactor Notes

- **2026-07-18 · Repeated registry walks.** Reconciliation still walks registry
  skill directories repeatedly for hashes, counts, and writes; retain as a
  cold-path cleanup unless this slice exposes a correctness reason to change it.

## Environment / Testing Notes

- **2026-07-18 · Synced slice gate.** This branch includes the registry update
  that requires a fresh `$review` pass after implementation.
- **2026-07-18 · Destructive UAT.** Exercise take-registry only in disposable
  consumer fixtures and preserve a byte snapshot proving unrelated skills do
  not change.
