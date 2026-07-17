# Discovery: Safe Managed Skill Removal

Date: 2026-07-17

## Kickoff

Complete skillfoo's desired-state reconciliation when a previously managed skill is no longer selected. The slice should safely remove skillfoo-owned projections while preserving anything locally changed or outside skillfoo's ownership.

## Problem Evidence

The current sync path only visits desired skills:

- `src/sync.ts` builds `wanted` from `config.skills ?? available` and mirrors only those names.
- The next lock starts empty and is written from the desired loop. A previously locked name that is no longer desired is dropped from the lock without a removal check.
- `mirrorSkillDir` updates desired skill directories but does not prune deselected ones.
- Claude adapter creation handles desired skills only; there is no corresponding unlink path.
- AGENTS.md and adapter updates run only when the managed count is greater than zero. With `skills: []`, stale emitted directories, adapters, and the managed AGENTS.md block remain even though the lock becomes empty.

That creates a dangerous ownership transition: content previously managed by skillfoo can remain on disk while the lock evidence that identifies and protects it disappears.

## Refined Problem Statement

For every sync, skillfoo must compare the previously managed set with the current desired set. A locked skill absent from the desired set becomes a removal candidate. Skillfoo may remove that candidate only when it can prove the managed projections are still safe to remove. If local changes or foreign adapter content make that proof fail, removal must be blocked, the artifacts must remain untouched, and the lock entry must be retained.

## Domain Terms

- **Desired skill**: A registry skill selected by explicit `skills` configuration, or every available registry skill when `skills` is omitted.
- **Managed skill**: A skill with an entry in the skillfoo lockfile. The entry records the ownership and baseline needed for safe reconciliation.
- **Removal candidate**: A managed skill that is absent from the current desired set.
- **Removal blocked**: A removal candidate whose projections cannot be proven unchanged and skillfoo-owned. Its artifacts and lock entry remain.
- **Bespoke skill**: A repository skill with no skillfoo lock entry. It is outside reconciliation and must never be pruned by skillfoo.

## Required Behavior

1. Compute removal candidates from `previous lock - current desired set`.
2. Preflight every projection for a candidate before deleting any part of it.
3. Reject any lock-derived name whose resolved emitted or adapter path is not a direct child of its intended root before any desired-skill or removal mutation begins.
4. Remove an emitted skill directory only when it is absent already or is a real directory whose complete structure is safe and whose managed file content matches the locked baseline.
5. Treat ignored entries, symlinks, special files, and empty directories as local structure that blocks whole-directory removal; the existing content hash alone does not represent them.
6. Remove a Claude adapter only when it is absent already or provably points to the expected managed destination.
7. Remove the skill from the managed AGENTS.md block and lock only after its removal succeeds.
8. If removal is blocked, retain the emitted content, adapter, prior lock entry, and exact existing managed AGENTS.md row bytes as one ownership unit.
9. If no managed skills remain, remove exactly the marker span and the single line ending that terminates the end-marker line. Preserve every other byte; do not infer ownership of adjacent blank lines, headings, or the file itself.
10. Repeated syncs must be idempotent in successful and blocked states.

## Constraints

- Never infer ownership from a directory or skill name alone.
- Never delete an unlocked/bespoke skill.
- Treat lockfile keys as untrusted input. A removal candidate must be one non-empty path segment and resolve directly beneath both managed roots.
- Do not partially remove a candidate: preflight before mutation.
- The lock hash covers regular managed files only. Whole-directory deletion additionally requires a structural walk that finds no skipped, linked, special, or empty local entries.
- An explicitly configured skill missing from the registry remains a configuration error before repository mutation.
- Preserve current sync exit semantics in this slice; blocked reconciliation is reported in output rather than introducing a new CI contract.
- `--force` must not silently delete locally edited removal candidates.
- Preserve custom emit locations and cross-platform adapter behavior.
- Removal is scoped to the currently configured emit root. Changing `emit` while managed entries exist is an unsupported migration with the v1 lock because the lock does not record the prior emit root.

## Non-goals

- A `skillfoo remove` command or interactive removal flow.
- A general `status` command or new non-zero drift exit code.
- `skillfoo init`.
- A force-delete or explicit conflict-resolution workflow.
- Registry fan-out, remote installation, or GitHub App behavior.
- Automatic git commits.
- Pruning arbitrary directories that are not represented in the lockfile.
- Migrating an existing managed set between emit roots.

## Implementation Seams

- Derive desired, retained, removable, and blocked sets before writing the next lock.
- Model removal as a preflight result followed by mutation so an unsafe adapter cannot leave the skill directory already deleted.
- Validate lock-derived candidate names and resolved paths before hashing or removing anything.
- Pair the existing managed-file hash check with a full structural inspection; `walkFiles` deliberately skips entries that whole-directory deletion would otherwise erase.
- Extend AGENTS.md rendering with separate active and retained-blocked inputs. Existing rows for retained-blocked names are copied byte-for-byte; active rows may refresh and successfully removed rows disappear.
- For an empty final set, remove the marker span plus exactly one immediately following line ending. Do not normalize surrounding whitespace or delete an otherwise empty heading/file because the current marker format cannot prove ownership of those bytes.
- Keep output categories distinct enough that a future read-only `status` command can reuse the reconciliation vocabulary.

## Open Questions Deferred Beyond This Slice

- What explicit command or flag should resolve a blocked removal by discarding local changes?
- Should a future `status` command make blocked removal a non-zero CI result?
- Should skillfoo offer to convert a managed skill to deliberately bespoke content?
- Should a future lock version record the emit root so skillfoo can safely migrate or clean an old emit location?
