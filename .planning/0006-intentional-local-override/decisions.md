# Decisions: Intentional Local Override

Date: 2026-07-18

## D1. Model Override as live user policy

**Decision:** An Override is a live, mutable local policy. Later edits to a
healthy overridden directory remain intentional without recurring Conflict
until the policy is explicitly reversed.

**Why:** The product promises that a local override is kept local, tracked,
and excluded from sync. Hash-pinning one accepted snapshot would recreate the
same dead end after every edit.

**Rejected:** Storing the accepted local hash and returning to
`drifted` / `local_changes` after any later edit.

**Domain impact:** `CONTEXT.md` now defines Override and distinguishes it from
Conflict and Bespoke content.

## D2. Persist policy in config, not ownership state

**Decision:** Store policy in `.skillfoo.yml` as a name-keyed mapping:

```yaml
overrides:
  alpha: local
```

Keep `.skillfoo.lock` version 1 as the ownership and source-baseline record. Do
not advance its hash or source for later local edits or registry changes while
the Override remains active.

**Why:** Config expresses user intent; the lockfile is derived evidence.
Keeping those responsibilities separate makes policy reviewable while
retaining the baseline needed to explain registry evolution and reverse the
choice safely.

**Rejected:** A list with implicit meaning, emitted-path keys coupled to
`emit:`, an override flag in each lock entry, and a local-content hash in the
lockfile.

## D3. Validate Override syntax and semantic consistency strictly

**Decision:** `overrides` may be omitted or `{}`. Otherwise it must be a YAML
mapping from safe one-segment skill names to the exact value `local`. Reject
null, sequences, scalars, non-string or complex keys, unsafe names,
unsupported values, and duplicate map keys. Preserve prototype-shaped safe
names as own entries and use
prototype-safe membership checks, matching the lockfile boundary.

Every override entry must have Managed ownership. An explicit `skills:` list
must include every override name. An override that is neither currently in the
registry nor previously Managed is invalid. A previously Managed override may
remain valid after registry removal under explicit or implicit selection.

A syntactically valid, ownership-consistent manually authored policy is valid
even when the local directory currently matches the registry. Matching bytes
do not clear policy.

**Why:** An Override cannot exist without Managed ownership, and explicit
deselection plus override is contradictory intent. Registry disappearance is
external evolution, not evidence that a prior explicit policy should be
discarded. The engine also cannot distinguish a manually authored matching
policy from a resolver-created live Override whose content later returned to
the registry bytes.

**Failure contract:** Invalid or contradictory policy exits `1`, prints an
actionable config diagnostic on stderr, emits no successful JSON, and performs
no consumer mutation.

## D4. Keep Override distinct from Conflict and Pending change

**Decision:** Add `override` as a first-class public skill state. It is
intentional, non-conflicting, and non-pending. A repository with only healthy
Overrides and current projections is Converged.

**Why:** Counting an Override as unchanged hides durable policy; counting it as
a Conflict contradicts the user's explicit resolution; counting it as pending
would imply ordinary sync should replace it.

## D5. Preserve policy across registry evolution

**Decision:** A registry update does not replace healthy Override content or
advance its retained lock baseline. A registry removal preserves the policy,
local content, Managed ownership, row, and adapter. A missing source is
informational rather than conflicting.

Registry `missing` means a successfully loaded current catalog lacks the
skill. Registry access or refresh failure remains operational exit `1`; never
reinterpret unavailable evidence as absence or fall back silently to stale
cache.

**Why:** The explicit local policy is stronger intent than a source update or
disappearance. Ordinary sync must not turn external source evolution into
implicit content loss.

**Reversal consequence:** Taking the registry is unavailable while its source
is missing. Removal remains a separate explicit outcome.

## D6. Fail closed when local authority cannot be materialized safely

**Decision:** A valid policy plus a safe real directory is a healthy Override.
If the directory is missing, classify `drifted` with reason
`override_content_missing`. If the top-level path is a file, symlink, or other
unsafe shape, use the existing `drifted` /
`emitted_path_not_managed_directory` Conflict. Unsafe `emit:` ancestry remains
a global failure.

Preserve the policy, lock, and every path that cannot be safely changed.
Ordinary sync must not restore, traverse, or replace the target.
Preserve an existing target managed row and adapter byte-for-byte, and do not
create either when absent until a safe real local directory returns. Unrelated
safe projections and the shared generated header may still reconcile. Omit a
degraded target's adapter projection record until its local content is safely
inspectable rather than emitting a misleading projection state.

**Why:** Saved intent cannot prove that an absent or substituted path is safe
local skill content. Reporting it as a healthy Override would hide a broken or
hostile materialization.

## D7. Publish Override through status JSON schema version 2

**Decision:** Override records use `state: "override"` and always include
`registryState: "unchanged" | "changed" | "missing"`, measured against the
retained source/hash baseline. `summary.skills` adds a distinct `overrides`
count; projection summaries retain unchanged/change/conflict counts.

Increase `schemaVersion` from 1 to 2. Human status and sync summaries name and
count Overrides and describe registry evolution. Change the ordinary sync
headline to reconciliation-neutral wording rather than claiming that Override
content was synced from the registry.

**Outcome precedence:** A healthy Override contributes neither safe work nor a
Conflict. The existing `0` Converged, `2` changes available, `3` attention
required, and `1` failure meanings remain. Targeted resolution returns the
post-action repository's residual `0`/`2`/`3` outcome.

**Why:** The state and registry evolution must be observable to humans and
automation. Version 1 declared its states and summary shape stable, so silently
adding an enum value and field would violate that contract.

## D8. Keep Override projections Managed and truthful

**Decision:** Exclusion from sync applies to registry replacement of skill
content, not to its projections.

Replace the generated managed-block advice with neutral text:

```text
Shared agent skills live in <emit>/ (managed by skillfoo):
```

An overridden row uses its local description and adds
`(local override; edit in this repository)`. Non-overridden rows do not receive
the suffix. The target resolver may update the shared managed-block
introduction and target row but preserves unrelated rows and all content
outside the managed span byte-for-byte.

Create a missing safe target adapter, keep a correct one unchanged, and
preserve a foreign or unsafe adapter as a residual projection Conflict.
When Override content itself is missing or unsafe, preserve any existing
target row and adapter and create neither if absent because their local source
cannot be proven.

**Why:** The previous generated instruction to edit every skill in the source
registry is false once local authority is supported. A target content choice
also does not prove ownership of a foreign adapter.

**Rejected:** Abandoning projection management for Overrides, leaving the old
source-only advice in place, and splitting source-managed and override skills
into separate generated sections.

## D9. Add one strict, directional CLI action

**Decision:** The public grammar is:

```text
skillfoo resolve <skill> (--take-registry | --keep-local)
```

Require one safe name and exactly one direction exactly once. Reject both,
neither, duplicates, extra positionals, and unknown flags before project or
registry access. Keep help project-independent. Successful output goes to
stdout; registry progress and failures go to stderr. Preserve the runtime
parser's standard `--` end-of-options behavior; direction text after the
separator is positional rather than an option.

Every refusal names the observed state and gives a concrete next action.
Syntactically valid but ineligible actions exit `1` without writes.

**Why:** The command mirrors the product chooser and makes both the target and
authority explicit. Strict parsing prevents a malformed resolution request
from degrading into ordinary reconciliation.

## D10. Limit keep-local eligibility and make retries idempotent

**Decision:** First-time `--keep-local` requires a Desired, Managed, safe real
directory currently classified `drifted` / `local_changes`. Do not support a
proactive Override command for an unchanged source-managed skill in this
slice. A valid manually authored policy remains honored.

Repeating keep-local for a healthy existing Override succeeds. It is
byte-for-byte non-mutating when policy and target projections are current and
may repair only stale target-dependent projections. It cannot bless a missing
or unsafe materialization.

**Why:** This slice closes a demonstrated Conflict outcome without adding a
separate policy-management surface. Retry safety handles uncertain process
results without broadening eligibility.

## D11. Use take-registry as explicit reversal

**Decision:** Extend `--take-registry` to reverse a configured Override when a
current registry source is available. Remove the target policy in the same
transaction that installs or confirms registry content, advances the target
lock baseline, and reconciles target projections.

If the overridden content already matches the registry, clear policy without
needlessly rewriting identical content. A missing overridden directory may be
restored. Do not replace an unsafe top-level shape. Refuse when the source is
missing. After reversal, the existing exact source-current retry remains a
successful no-op.

Manually deleting policy is explicit but not destructive authorization. With a
selected current source, local differences return to
`drifted` / `local_changes`; with implicit selection and a removed source they
enter existing blocked-removal classification; an explicit missing
non-Override selection remains invalid. Ordinary sync preserves local edits in
every non-error path.

**Why:** “Use source” is already the inverse choice in the public three-way
model. A separate remove-override command would create an ambiguous state
between removing policy and deciding which content wins.

## D12. Treat policy and target projections as one recoverable mutation

**Decision:** Keep-local stages a validated document-aware config edit,
revalidates exact config and lock entry identity/bytes plus target selection,
ownership, local hash, registry evidence, managed-row evidence, and adapter
state, then changes only the target policy and target-dependent projections.
It does not write skill content or lock state.

Both resolver directions require `.skillfoo.yml` and `.skillfoo.lock` to be
existing real regular files. `AGENTS.md` may be absent or a real regular file.
Refuse a symlink, directory, or special entry at any root metadata path before
mutation. Revalidate path identity and bytes (or continued absence) at the
write boundary. Every changed root metadata file is staged beside its target
and atomically installed without writing through the old inode, preserving
its mode. If the old file has other hardlinks, those links retain their prior
bytes while the consumer path receives the new inode.

Before the first mutation, persist a transaction manifest and exact
before-snapshots for config, lock, `AGENTS.md`, direction-dependent target
content, adapter state, and created ancestors under the recovery directory.
Do not rely on process memory as the only copy of state needed for handled
rollback or diagnosis. Retain those files through post-action planning and
delete them only after commit.

A post-action read-only plan must confirm a healthy target Override and no
remaining safe target projection action before commit. On handled failure,
atomically restore exact config and `AGENTS.md` bytes and modes and the prior
adapter shape from the durable snapshots. Preserve and report recovery data if
rollback is incomplete. Restore each target only when it still matches the
transaction's own output; concurrent replacements are preserved and make
rollback explicitly incomplete.

Take-registry reversal adds policy removal to slice 0005's existing recovery
boundary for content, lock, target row, adapter, and post-classification.

**Why:** A durable policy write without its truthful projection, or a content
replacement without clearing policy, would leave a misleading partial result.

**Boundary:** Crash consistency, fsync guarantees, restart discovery, and
automatic cleanup remain deferred.

## D13. Preserve config meaning and comments, not incidental whitespace

**Decision:** Edit existing config through the YAML document model. Preserve
all unrelated values, unknown keys, comments, ordering, and scalar styles.
Allow harmless whitespace normalization performed by the installed YAML
serializer. Append a new override block or entry without reordering existing
entries, and remove the map when its last policy is reversed.

Healthy idempotent retries do not rewrite config. Rollback restores the exact
pre-command bytes. Mutation requires a real regular config file, stages
validated bytes beside it, preserves its mode, and atomically replaces it;
symlinks and special entries are refused without writes.

**Why:** Regenerating config from the narrow typed model would erase future or
repository-specific data. Requiring byte-identical text outside the changed
entry is not realistic with safe document-aware YAML editing and provides no
semantic value.

## D14. Keep adjacent resolution outcomes out of this slice

**Decision:** Registry promotion stays a separate git-native slice because it
crosses repository boundaries. Bespoke adoption/replacement, unsafe-shape
replacement, foreign-adapter replacement, force removal, selection management,
and crash journaling remain separate follow-ups.

The resolver remains target-only: it neither applies unrelated safe work nor
changes unrelated Conflicts or projections.

**Why:** Each deferred outcome needs different ownership proof, destructive
authorization, repository scope, or durability machinery. Combining them would
weaken the narrow safety boundary established by slice 0005.

## Documentation impact

- `CONTEXT.md` records the reusable Override term and relationship.
- `docs/adr/0001-live-local-overrides.md` records the hard-to-reverse,
  non-obvious choice to keep Overrides live rather than hash-pinned.
- Slice-local behavior and trade-offs live in this decision log and the
  approved slice PRD.
- `README.md` must describe the registry as the default Managed authority and
  document an explicit local Override as the exception; it must not retain an
  unconditional source-of-truth claim.
