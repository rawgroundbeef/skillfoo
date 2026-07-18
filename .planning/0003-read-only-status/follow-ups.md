# Follow-ups: Read-Only Reconciliation Status

Date: 2026-07-17

## Bugs Discovered

- _(none deferred; active-adapter ownership and desired-path traversal findings were scheduled into this slice by the 2026-07-18 adversarial amendment)_

## Deferred Slice Ideas

- **2026-07-17 · Offline status.** Add a cached-only mode that performs no network access and labels registry freshness so callers cannot mistake it for a live result.
- **2026-07-17 · Force preview.** Consider a deliberately named preview for `sync --force` after destructive conflict-resolution semantics are designed.
- **2026-07-17 · Explicit conflict resolution.** Add commands for taking the registry version, promoting local edits, intentionally keeping an override, force-removing a candidate, or converting managed content to bespoke.
- **2026-07-17 · Bespoke audit.** If users need inventory beyond managed skills, design it as an explicit audit surface rather than expanding status implicitly.

## Product Questions

- **2026-07-17 · Exit-code simplification.** Validate through real CI use whether separate `2` (safe pending changes) and `3` (attention required) remain more useful than one generic non-converged status.
- **2026-07-18 · Broader adapter audit.** Status covers adapters for active managed skills and managed removal candidates; decide separately whether an explicit audit command should inventory unrelated stale or bespoke adapter names.

## Cleanup / Refactor Notes

- **2026-07-17 · Repeated skill walks.** Planner extraction is an opportunity to calculate registry files, file count, and hash from one walk per skill rather than the repeated `walkFiles` calls currently made by sync.
- **2026-07-17 · CLI parsing consistency.** Status needs strict option validation; migrate legacy sync parsing to the same parser only if its existing accepted syntax and output remain covered by process tests.
- **2026-07-17 · Output injection.** Registry resolution currently writes progress directly with `console.log`; route progress through an injected reporter so sync and status can own their stdout/stderr contracts.

## Environment / Testing Notes

- **2026-07-17 · Remote registry tests need an isolated cache.** Do not let automated tests clone into or remove the developer's real `~/.skillfoo`; inject or isolate the cache root when covering Git refresh behavior.
- **2026-07-17 · Consumer immutability must include ignored files.** This repository ignores `.skillfoo.lock`, so manual UAT should snapshot or hash the entire disposable consumer tree rather than relying only on `git diff`.
- **2026-07-17 · Cross-platform removal inspection.** Status reuses path and adapter checks that vary between Unix symlinks and Windows junctions; retain Windows CI coverage.
