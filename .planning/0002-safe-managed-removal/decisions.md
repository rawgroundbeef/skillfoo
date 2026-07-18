# Decisions: Safe Managed Skill Removal

Date: 2026-07-17

## D1: Reconcile Previous Management Against Current Desire

The removal set is derived from locked skill names that are absent from the current desired set. Registry directories and emitted directory names are not ownership records.

This covers both explicit deselection and a registry skill disappearing while configuration uses the implicit "all available skills" behavior.

## D2: A Locally Edited Candidate Remains Managed

When the emitted directory differs from its locked baseline, skillfoo reports removal as blocked and retains the prior lock entry.

It does not silently demote the directory to bespoke content. Dropping the lock would discard ownership history and make a later sync unable to distinguish deliberate local content from stale managed content.

This decision was explicitly confirmed during grilling.

## D3: Treat Projections as One Removal Unit

The emitted directory, Claude adapter, managed AGENTS.md entry, and lock entry represent one managed skill. Skillfoo preflights the candidate's relevant projections before mutating them.

- An absent emitted directory is already clean.
- A present emitted path must be a real directory, contain no unrepresented local structure, and match the locked baseline for managed files.
- An absent adapter is already clean.
- A present adapter must be provably skillfoo-owned and target the expected emitted path.
- A foreign file, directory, or link at the adapter path blocks removal.

If preflight fails, none of the candidate's projections are removed.

## D4: Blocked Skills Stay Discoverable

A blocked removal keeps its managed AGENTS.md entry and lock entry. When an existing managed row is present, projection rendering preserves that complete row byte-for-byte rather than regenerating its description from locally edited frontmatter. This makes the unresolved state visible without turning a blocked sync into a metadata rewrite.

Successfully removed skills disappear from both. When the final managed skill is removed, skillfoo deletes the byte span from the start marker through the end marker plus exactly one immediately following line ending (`\n` or `\r\n`) that terminates the end-marker line. Every byte before the start marker and after that one line ending remains unchanged. The current format does not prove ownership of adjacent blank lines, the surrounding heading, or the file, so skillfoo leaves them in place even when cosmetic whitespace remains.

## D5: `--force` Does Not Resolve Removal Conflicts

The existing `--force` option does not authorize deletion of locally edited removal candidates in this slice. Destructive conflict resolution needs an explicit, independently designed user contract.

## D6: Preserve Existing Sync Exit Semantics

This slice reports successful removals and blocked removals in human-readable sync output but does not add new exit-code behavior. A future `status` slice should define the stable machine-readable and CI contract across all reconciliation states.

## D7: Preserve Missing-Skill Validation

If configuration explicitly names a skill absent from the registry, sync fails validation before repository mutation. If `skills` is omitted and a formerly managed registry skill disappears, the skill becomes a normal removal candidate and receives the same safety checks.

## D8: Encapsulate Removal Behind a Deep Module

Candidate preflight and mutation belong behind one managed-removal module. Sync supplies the candidate's locked baseline and expected projection locations; the module returns either a completed removal or a blocked reason without exposing partial filesystem mechanics to the orchestrator.

Sync remains responsible for desired-set validation, installation/update reconciliation, final lock membership, projection indexing, and user-facing reporting. AGENTS.md and Claude adapter lifecycle behavior stays in the projection module. That module receives active desired names separately from retained removal-blocked names so it can refresh one set while preserving existing row bytes for the other.

This module boundary was explicitly confirmed before PRD authoring.

## D9: Validate Paths and the Complete Directory Shape

Lockfile keys are untrusted input. After registry/config validation but before reconciling desired skills, skillfoo requires each removal-candidate name to be one non-empty path segment and verifies that its resolved emitted and adapter paths are direct children of their expected roots. An invalid candidate fails closed before any consumer mutation; it is not converted into a path operation.

The existing hash is necessary but not sufficient for whole-directory deletion. `walkFiles` intentionally ignores `.git`, `.DS_Store`, symlinks, special entries, and empty directories. Removal therefore performs an additional structural walk and blocks if any entry would be deleted without representation in the locked manifest. This preserves the v1 hash contract while making whole-directory deletion conservative.

## D10: Emit Migration Is Not Part of v1 Removal

A v1 lock entry records a skill name, source, and hash, but not the emit root where it was written. This slice reconciles candidates only under the currently configured emit root and requires the emit configuration to remain stable across the managed entry's lifetime.

Changing `emit` while managed entries exist is an unsupported migration and is not claimed as safe cleanup behavior. A future lock version or explicit migration workflow must add provenance for the previous emit root before skillfoo can clean it automatically.

## Rejected Alternatives

### Drop the lock and leave the artifact

Rejected because it silently converts stale or changed managed content into bespoke content and loses the evidence needed for safe follow-up.

### Delete every deselected path by name

Rejected because names do not prove ownership and this could destroy repository-authored skills or adapter content.

### Leave all deselected artifacts indefinitely

Rejected because sync would not converge to declared configuration and users could unknowingly run obsolete skills.

### Bundle `status`, `init`, or explicit force removal

Rejected for this slice because safe convergence is the prerequisite domain behavior those interfaces should build upon.

### Treat a matching file hash as proof of the entire directory

Rejected because the current manifest omits entry types and selected names. Whole-directory deletion needs a conservative structural check in addition to the existing hash.

## Documentation Impact

No ADR is required: this is a reversible extension of the existing lock ownership and never-clobber invariants, not a new architectural boundary. The terminology remains slice-local until the reconciliation model is exercised by later `status` and conflict-resolution work.
