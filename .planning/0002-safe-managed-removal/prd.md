# PRD: Safe Managed Skill Removal

**Date:** 2026-07-17
**Status:** Ready for implementation handoff

## Problem Statement

When a user removes a previously synced skill from configuration, skillfoo currently stops tracking the skill in its lockfile but leaves its emitted directory, Claude adapter, and AGENTS.md entry behind. An explicitly empty skill list is worse: sync clears the lock while skipping projection updates entirely.

The repository therefore does not converge to declared configuration, obsolete skills remain available to agents, and skillfoo loses the ownership evidence required to distinguish stale managed content from deliberate repository content. Users need deselection to clean up unchanged skillfoo-owned content without risking local edits, foreign adapters, or bespoke skills.

## Solution

Sync will reconcile the previous managed set against the current desired set. A locked skill no longer desired becomes a removal candidate. Skillfoo will preflight the candidate's emitted directory and Claude adapter as a single managed projection, remove them only when ownership and the locked baseline make removal safe, and then remove the skill from AGENTS.md and the lockfile.

If local changes or foreign adapter content prevent safe removal, skillfoo will leave every projection untouched, retain the old lock entry and managed AGENTS.md listing, and clearly report that removal is blocked. Removing the final safe skill will also remove skillfoo's managed AGENTS.md block while preserving repository-authored content. Repeated syncs will remain idempotent in both removed and blocked states.

## User Stories

1. > As a CLI user, I want deselecting an unchanged managed skill to remove its generated projections, so that my repository matches its configuration.
2. > As a CLI user, I want removing the final managed skill to clean up the skillfoo AGENTS.md block, so that obsolete agent instructions do not remain visible.
3. > As a developer with local edits, I want deselection to preserve an edited managed skill, so that configuration changes cannot destroy my work.
4. > As a developer with local edits, I want a blocked removal to retain its lock entry, so that skillfoo does not silently forget ownership history.
5. > As a developer, I want `--force` to leave a deselected edited skill alone, so that an update-oriented flag does not unexpectedly authorize deletion.
6. > As a repository owner, I want foreign content at a Claude adapter path to block removal, so that skillfoo never deletes a file, directory, or link it cannot prove it owns.
7. > As a repository owner, I want a blocked candidate to remain listed in managed AGENTS.md instructions, so that the unresolved managed state stays discoverable.
8. > As a repository owner, I want bespoke skills with no lock entry to be ignored during pruning, so that repository-specific capabilities remain untouched.
9. > As a user relying on implicit registry selection, I want a removed registry skill to follow the same safe removal rules, so that the repository converges when the registry changes.
10. > As a user with an explicitly configured missing skill, I want sync to fail before any mutation, so that a configuration error cannot cause unrelated cleanup.
11. > As a user with a custom emit location, I want removal checks and adapter targeting to honor that location, so that cleanup is correct outside the default layout.
12. > As a user, I want missing projections to count as already clean where ownership checks allow it, so that interrupted or manually cleaned states can converge.
13. > As a user, I want successful and blocked removals reported distinctly, so that I understand what sync changed and what needs attention.
14. > As a terminal user, I want removal output to be understandable without relying on color, so that logs and accessible terminals preserve the result.
15. > As a CI user, I want this slice to preserve existing exit semantics, so that adopting safe removal does not unexpectedly break current pipelines.
16. > As a cross-platform user, I want symlink and Windows junction ownership checks to recognize only the expected adapter target, so that cleanup is reliable on every supported operating system.
17. > As a user rerunning sync, I want successful cleanup to become a no-op, so that the command is idempotent.
18. > As a user rerunning a blocked removal, I want the same conflict reported without further filesystem changes, so that repeated sync is safe and predictable.
19. > As an existing user, I want desired-skill add, update, drift, force-update, and collision behavior to remain unchanged, so that removal does not regress established reconciliation.
20. > As a maintainer, I want candidate preflight to finish before any candidate projection is removed, so that a late ownership conflict cannot leave a blocked candidate partially deleted.
21. > As a repository owner, I want lock-derived names contained beneath the managed roots, so that a corrupt or malicious lockfile cannot turn cleanup into path traversal.
22. > As a developer, I want ignored files, links, special entries, and empty directories to count as local structure, so that a matching regular-file hash cannot authorize deleting unrepresented work.

## Implementation Decisions

- Introduce a managed-removal module that owns candidate inspection and deletion behind a small result-oriented interface. It receives the locked baseline and expected projection locations, then returns either removed or blocked with a reason.
- A removal candidate is a name present in the previous lock but absent from the validated desired set. Directory enumeration alone never establishes ownership.
- Treat every lockfile key as untrusted. After validating registry/config inputs but before desired-skill reconciliation mutates the consumer, require each removal candidate to have a non-empty single-segment name and verify its resolved emitted and adapter paths are direct children of their intended roots. Validate the complete candidate set up front; any invalid candidate fails closed before any consumer mutation.
- The emitted path is removable only when absent already or when it is a real directory whose managed-file content matches the locked baseline and whose complete structure contains nothing outside that manifest. A substituted link, non-directory path, ignored entry, nested link, special entry, empty directory, or changed content blocks removal.
- The adapter path is removable only when absent already or when it is a symbolic link or junction targeting the candidate's expected emitted directory. Compare its normalized lexical target even when the emitted directory is already absent; use realpath only as an additional check when the target exists. Foreign files, directories, and links block removal.
- Preflight every relevant projection for one candidate before deleting any of them. Candidate-level preflight prevents a foreign adapter from being discovered after the emitted directory is already gone.
- Maintain two explicit sets after reconciliation: actively managed desired skills and retained managed skills whose removal is blocked. Their union becomes the final lock and managed AGENTS.md set.
- Retained blocked skills keep their prior lock entry exactly, including source and baseline hash. They are not silently converted to bespoke content.
- Claude adapter creation runs only for actively managed desired skills. Retained blocked removal candidates are excluded so the normal adapter writer cannot overwrite the very foreign content that caused removal to block.
- AGENTS.md rendering receives active desired names separately from retained removal-blocked names. It refreshes canonical rows for active names, removes successfully deleted rows, and copies every existing retained row byte-for-byte in its existing position. Active names not already represented are appended in desired order. A retained name with no existing row receives a canonical fallback row so the unresolved managed skill remains discoverable, but no existing user or generated row is overwritten.
- When the final managed union is empty, managed-block cleanup deletes exactly the byte span from the start marker through the end marker and one immediately following `\n` or `\r\n` that terminates the end-marker line. It does not consume preceding whitespace, additional following blank lines, a surrounding Skills heading, or the AGENTS.md file. This is the strongest byte-preservation rule derivable from the current marker format.
- If no AGENTS.md or no complete managed marker pair exists and the final union is empty, rendering is a no-op.
- Successfully removed candidates are omitted from the next lock. Blocked candidates are copied from the previous lock. Existing desired-skill classification continues to determine all other next-lock entries.
- Explicit missing-skill validation remains before any removal classification or mutation. An implicit registry disappearance is not an error and becomes a candidate.
- `--force` continues to apply only to overwriting drift in desired managed skills. It has no effect on removal preflight or blocked removals.
- Add distinct, non-color-dependent report rows and summary counts for removed and removal-blocked outcomes. Removal-blocked reasons distinguish at least local emitted changes from unowned adapter content.
- Keep the current success exit status for blocked reconciliation. Machine-readable status and non-zero CI policy remain deferred.
- Do not change the lockfile schema or add a new command. The existing source and content hash are sufficient for this slice's ownership proof.
- Scope removal to a stable configured emit root. The v1 lock does not record historical emit provenance, so changing emit roots while entries are managed is explicitly not a supported migration in this slice.

## Testing Decisions

- Make end-to-end sync tests the primary evidence because correctness depends on coordinated directory, adapter, AGENTS.md, lockfile, and reporting outcomes.
- Use disposable registry and consumer fixtures with multiple managed skills plus bespoke content. Snapshot relevant bytes before a blocked sync to prove that no projection was partially mutated.
- Add focused managed-removal tests for an unchanged directory, local content drift, a substituted emitted link, a correct adapter, a missing adapter, and foreign adapter variants.
- Add hostile-lock tests for traversal-shaped and multi-segment keys, asserting validation occurs before any candidate mutation.
- Add structural-drift tests for skipped names, nested links, special entries where the platform permits them, and empty directories whose regular-file hash otherwise matches.
- Add focused AGENTS.md tests for partial removal, final-block removal, preservation within an existing Skills section, preservation of unrelated sections, no-file empty-set behavior, and repeated rendering.
- Include a retained-row test that changes a blocked skill's frontmatter description and proves the complete existing AGENTS.md row remains byte-identical while other active or removed rows can reconcile.
- Test final-block removal at the byte level for LF and CRLF: only the marker span and one terminating line ending may disappear, even when this leaves cosmetic blank lines or an otherwise empty heading.
- Cover explicit empty selection, implicit removal after registry deletion, and explicit missing-skill validation at the integration level.
- Assert lock membership and exact retained entries, not merely file existence, because retaining ownership evidence is a core safety requirement.
- Assert human-readable output for removed and removal-blocked states without depending on ANSI color.
- Preserve the existing desired-skill tests and run the full typecheck, build, and test suite.
- Rely on cross-platform CI for junction behavior; platform-specific expectations should test equivalent ownership outcomes rather than hard-coded link text.

## Out of Scope

- A `skillfoo remove` command.
- An interactive or destructive conflict-resolution workflow.
- Force-removing edited content or foreign adapters.
- Converting managed content to deliberately bespoke content.
- A read-only `skillfoo status` command.
- New machine-readable output or non-zero drift/conflict exit codes.
- `skillfoo init`.
- Registry fan-out, remote skill installation, or GitHub App behavior.
- Automatic git commits.
- Pruning any path that lacks a previous lock entry.
- Changing the lockfile format.
- Moving or cleaning managed skills across a changed emit root.
- Cosmetic removal of headings, files, or adjacent blank lines outside the marker-owned byte span.

## Open Questions

- No questions block this slice. The command and policy for explicitly resolving a blocked removal remain deferred product decisions.
