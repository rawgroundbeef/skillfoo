# Bootstrap — implement slice 0002: safe managed skill removal

Cold-start prompt for a fresh context. Execute from these documents and the code, not from remembered conversation.

## What you're building

Make `skillfoo sync` converge when a previously managed skill is no longer desired. Today `src/sync.ts` builds a fresh lock from desired names only but never visits old locked names for cleanup. Deselecting a skill therefore leaves `.agents/skills/<name>`, its Claude adapter, and its AGENTS.md entry behind while discarding the lock evidence that made the content safely manageable. `skills: []` also skips all projection rendering.

Add safe managed removal: unchanged owned projections are removed; local edits or foreign adapter content block removal and retain the entire managed state, including the previous lock entry.

Working directory: `/Users/rawgroundbeef/Projects/skillfoo`. Branch `safe-managed-skill-removal` is already created from current `origin/main`.

## Read in this order

1. `.planning/0002-safe-managed-removal/prd.md` — implementation requirements and module boundaries.
2. `.planning/0002-safe-managed-removal/uat.md` — approved observable contract; all seven scenarios must pass.
3. `.planning/0002-safe-managed-removal/decisions.md` — ownership, blocked-removal, projection-unit, force, exit, validation, and module decisions.
4. `.planning/0002-safe-managed-removal/discovery.md` — evidence, terminology, constraints, and implementation seams.
5. `.planning/0002-safe-managed-removal/follow-ups.md` — deferred work; add discoveries here instead of expanding the slice.
6. Current implementation: `src/sync.ts`, `src/emit.ts`, `src/lockfile.ts`, `src/skilldir.ts`, and their tests.

## Must not violate

- **Only a previous lock entry establishes management.** Never prune by registry or emitted directory name alone.
- **Lock keys are untrusted.** Require one safe path segment and prove both resolved candidate paths are direct children of their intended roots before reading, hashing, or removing them.
- **Local edits retain ownership.** A deselected candidate whose emitted content differs from its locked hash is removal-blocked, untouched, still indexed in AGENTS.md, and copied unchanged into the next lock.
- **Hash equality is not whole-tree equality.** Block removal for skipped names, symlinks, special entries, and empty directories that the v1 regular-file manifest does not represent.
- **No silent demotion.** A blocked removal does not become bespoke merely because it is no longer desired.
- **Candidate-level preflight precedes mutation.** Inspect the emitted path and adapter before deleting either. A blocked candidate must not be partially removed.
- **Adapter ownership must be proven.** Only an absent adapter or a symlink/junction targeting the expected emitted directory is safe. Never delete a foreign file, directory, or link.
- **`--force` does not force removal.** It remains scoped to overwriting drift in desired managed skills.
- **Bespoke paths remain invisible.** Anything absent from the previous lock is never considered for removal.
- **Explicit missing skills fail before mutation.** An implicit disappearance with `skills` omitted becomes a normal removal candidate.
- **Final empty state renders.** `skills: []` must remove safe managed projections and the skillfoo AGENTS.md block; it must not skip projection reconciliation.
- **Blocked adapters must not be relinked.** Do not pass retained removal-blocked names into the adapter creation path, or a foreign adapter will be overwritten after preflight correctly blocked it.
- **Blocked AGENTS.md rows must not be regenerated.** Preserve the complete existing row bytes and position for retained removal-blocked names, even when local edits changed `SKILL.md` frontmatter.
- **Whitespace ownership is narrow.** Final cleanup removes the marker span and one line ending terminating the end marker—nothing before it and no additional byte after it.
- **Do not invent emit provenance.** This slice assumes the configured emit root remains stable while entries are managed; emit-root migration needs a future lock or workflow.

## Implementation pointers

- Add `src/removal.ts` as the deep module confirmed in decisions D8. Give it a result union that distinguishes `removed` from `blocked` and carries a human-readable reason category. Keep filesystem inspection details inside it.
- Immediately after registry and explicit missing-skill validation, derive the complete removal-candidate set and validate every name before the existing desired-skill loop can write. A name must be one non-empty segment under both POSIX and Windows separator rules. Resolve each candidate path and verify its parent is exactly the normalized expected root. Throw a clear corrupt-lock/path-safety error before any consumer mutation if one candidate fails.
- For the emitted path, use `lstat` semantics so a substituted symlink/junction or non-directory cannot masquerade as the locked directory merely by exposing identical bytes. If the real directory exists, compare `hashSkillDir(destDir)` with the previous lock hash and separately walk every directory entry. Block on `SKIP` names, links, non-file/non-directory entries, or empty directories because `walkFiles` does not commit them to the baseline. Absence is already clean; changed or structurally foreign content blocks.
- For `.claude/skills/<name>`, accept absence or a symlink/junction whose normalized lexical `readlink` target is the expected `resolve(cwd, emitRel, name)`. This must work for an expected dangling adapter when the emitted directory is already absent. When the target exists, realpath may provide an additional platform-normalized check. A regular file/directory or wrong target blocks.
- Delete the owned adapter before the emitted directory after all candidate checks pass. The module must never mutate on a blocked result.
- In `src/sync.ts`, compute `removalCandidates = Object.keys(lock.skills).filter(name => !wanted.includes(name))` only after registry and explicit missing-skill validation.
- Preserve the existing desired-name classification. Track its `managed` names separately from retained blocked removals.
- For each removal candidate, call the managed-removal module with its previous lock hash. A successful result is omitted from the new lock; a blocked result copies `lock.skills[name]` unchanged into the new lock and joins the final AGENTS.md managed set.
- Keep adapter creation scoped to desired managed names. Change the AGENTS.md projection API to distinguish active desired names from retained removal-blocked names.
- Reconcile an existing managed block as rows: preserve the exact row string and existing position for every retained blocked name; regenerate active rows in place; omit successfully removed rows; append active names not already represented in desired order. If a retained name has no existing row, append a canonical fallback without overwriting surrounding content.
- When the final managed union is empty, change `updateAgentsMd` to remove exactly `START` through `END` plus one immediately following LF or CRLF that terminates the end-marker line. Do not remove a preceding newline, any additional following newline, an empty heading, or the AGENTS.md file. If there is no file or complete marker pair, do nothing. Avoid creating an empty managed block.
- Call projection rendering even when the final managed count is zero. Avoid calling adapter creation with an empty desired set merely to prevent creation of empty parent directories.
- Extend the sync report with `- <name>` for successful removal and `⊘ <name>  (removal blocked — <reason>)` for blocked removal. Add summary counts only when non-zero. Keep exit status zero for blocked removal.
- The trailing `synced N skills` count should continue to describe desired managed skills, not deselected-but-retained candidates. The lock and AGENTS.md set may be larger when removals are blocked.
- Preserve deterministic lock serialization and prior entries exactly for blocked candidates. No lock version change is needed.

## Verification gates

- Run `npm run check`, `npm run build`, and `npm test`.
- Walk every approved scenario in `.planning/0002-safe-managed-removal/uat.md` through automated integration tests.
- Verify a clean partial removal deletes only that skill's emitted directory, expected adapter, AGENTS.md entry, and lock entry.
- Verify `skills: []` removes the final managed block without altering repository-authored AGENTS.md content or bespoke skills.
- In the locally edited case, change `SKILL.md` frontmatter after capturing the existing managed row. Assert the adapter and prior lock entry remain exact and the entire retained row string stays byte-for-byte identical across repeated blocked syncs.
- Exercise a mixed block containing active, safely removed, and retained-blocked names to prove active rows can refresh and removed rows disappear without rewriting the retained row.
- For final cleanup, assert exact LF and CRLF byte output. Expect cosmetic surrounding whitespace to remain; do not normalize bytes outside the specified removal span.
- Build hostile lock fixtures with traversal-shaped keys and assert sync fails before touching any in-root or out-of-root candidate.
- Add unrepresented structure after a clean sync and prove it blocks removal even when `hashSkillDir` still equals the lock.
- Repeat both successful and blocked syncs to prove idempotency.
- Verify omitted `skills` plus registry deletion removes safely, while explicit selection of the missing registry name fails before any consumer mutation.
- Run the suite on Windows CI to exercise junction ownership behavior.

## Environment gotchas

- The repository is TypeScript ESM and imports source modules with `.js` specifiers. Follow the existing compiler and test conventions.
- `existsSync` follows links; ownership checks need `lstat`/`readlink` or equivalent semantics where path type matters.
- `walkFiles` omits `.git`, `.DS_Store`, symlinks, special entries, and empty directories. Do not reuse its hash alone as authorization for recursive deletion.
- The current adapter writer removes and recreates every name it receives. Passing removal-blocked names to it will destroy foreign adapter content and violate UAT.
- The current AGENTS.md writer assumes a non-empty managed set and writes unconditionally. Empty-set behavior needs an explicit no-block path.
- A Windows directory junction may report and resolve differently from a POSIX relative symlink; compare normalized expected destinations, not platform-specific link text.
- Keep all slice artifacts under `.planning/0002-safe-managed-removal/` in this repository.

## Out of scope

Do not build `status`, `init`, a `remove` command, force-delete, managed-to-bespoke conversion, emit-root migration, cosmetic AGENTS.md heading/file cleanup outside the marker span, machine-readable output, new CI exit semantics, registry fan-out, or automatic commits. Record newly discovered work in `follow-ups.md`.

## Final instruction

Implement from `prd.md` and the approved `uat.md`. Preserve the established desired-skill reconciliation behavior, add focused removal/projection tests, run all verification gates, and update durable slice artifacts if implementation exposes a genuine gap. Do not rely on conversation memory.
