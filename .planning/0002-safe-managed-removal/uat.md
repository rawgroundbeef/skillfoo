# UAT: Safe Managed Skill Removal

Date: 2026-07-17

**Status:** Approved by user; safety guardrails amended during adversarial review

## Purpose

Prove that sync converges after deselection without deleting local work, losing ownership evidence, or disturbing bespoke repository content.

Use a disposable consumer repository with two registry skills, `alpha` and `beta`, Claude adapters enabled, existing prose in AGENTS.md, and one bespoke skill that is not in the lockfile.

Keep the configured emit root stable for the duration of these scenarios. Emit-root migration is outside this v1-lock slice.

## Scenario 1: Safely Remove One Unchanged Skill

1. Configure `alpha` and `beta`, then run sync.
2. Record the emitted directories, adapters, managed AGENTS.md block, lock entries, and bespoke skill.
3. Remove `beta` from configuration and run sync again.

Pass when:

- Output clearly reports `beta` as removed.
- The emitted `beta` directory and its owned adapter are gone.
- The `beta` AGENTS.md entry and lock entry are gone.
- `alpha`, repository-authored AGENTS.md content, and the bespoke skill are unchanged.
- A repeated sync makes no additional filesystem changes and reports no new removal.

## Scenario 2: Remove the Final Managed Skill

1. Starting with only `alpha` managed, set `skills: []`.
2. Run sync.

Pass when:

- The emitted `alpha` directory and owned adapter are gone.
- The lockfile contains no managed skills in its valid canonical form.
- The complete skillfoo marker span and exactly one immediately following line ending are removed from AGENTS.md.
- Every AGENTS.md byte before the start marker and after that terminating line ending is preserved exactly; adjacent blank lines, headings, and the file itself are not deleted merely for cosmetic cleanup.
- Bespoke skills are preserved exactly.
- A repeated sync is idempotent.

## Scenario 3: Block Removal When the Skill Has Local Edits

1. Sync `beta` so it has a locked baseline.
2. Edit the description in `beta`'s `SKILL.md` frontmatter so both the content hash and the metadata source used by AGENTS.md rendering differ from the baseline.
3. Deselect `beta` and run sync, then repeat the sync once.

Pass when:

- Both runs clearly report that `beta` removal is blocked by local changes.
- The locally edited directory is byte-for-byte unchanged.
- The adapter and prior lock entry remain.
- The complete pre-existing managed AGENTS.md row for `beta`, including its original description and position, remains byte-for-byte unchanged on both runs.
- No projection is partially removed.
- `--force` does not delete or demote the candidate.

## Scenario 4: Block Removal Around Foreign Adapter Content

1. Sync `beta` so the emitted directory is unchanged from its baseline.
2. Replace its expected adapter with a foreign file, directory, or link.
3. Deselect `beta` and run sync.

Pass when:

- Removal is reported as blocked because adapter ownership cannot be proven.
- The unchanged emitted directory has not already been deleted.
- The foreign adapter is untouched.
- The managed AGENTS.md entry and lock entry remain.

## Scenario 5: Distinguish Implicit Removal From Invalid Configuration

1. With `skills` omitted, sync a registry containing `alpha` and `beta`.
2. Remove unchanged `beta` from the registry and sync again.
3. Separately, explicitly configure `beta` after it is absent from the registry and run sync.

Pass when:

- The implicit case safely removes `beta` using the normal removal checks.
- The explicit case fails validation before mutating emitted skills, adapters, AGENTS.md, or the lockfile.

## Scenario 6: Reject Unsafe Lock-Derived Paths

1. In a disposable consumer, add a syntactically valid lock entry whose name contains `..`, `/`, or `\\` and would resolve outside the emitted or adapter root.
2. Make that entry a removal candidate and run sync.

Pass when:

- Sync fails closed before any removal candidate is mutated.
- No path outside the configured emit root or Claude adapter root is inspected as an owned skill or removed.
- Existing emitted skills, adapters, AGENTS.md, and lock content remain unchanged.

## Scenario 7: Block Removal for Unrepresented Local Structure

1. Sync `beta` so its regular files match the locked baseline.
2. Add local structure that the v1 content manifest does not represent, such as a nested `.git` directory, symbolic link, special entry, or empty directory.
3. Deselect `beta` and run sync.

Pass when:

- Removal is reported as blocked even though the managed-file hash still matches.
- The complete emitted directory, including the unrepresented local structure, remains untouched.
- The adapter, managed AGENTS.md entry, and previous lock entry remain.
- A repeated sync remains blocked and makes no additional changes.

## Approval Gate

This UAT defines the approved user-visible contract for the slice.
