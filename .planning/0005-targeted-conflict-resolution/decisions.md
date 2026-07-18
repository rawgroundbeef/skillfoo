# Decisions: Targeted Conflict Resolution

Date: 2026-07-18

## D1. Resolve one named local-edit Conflict

**Decision:** The first resolution slice supports taking the registry version
for one named, Desired and Managed skill currently reported as `drifted` with
reason `local_changes`.

**Why:** This is the one conflict that today's `sync --force` can already
resolve, but the existing flag applies too broadly. Targeting one skill gives
the destructive choice an inspectable blast radius without adding a new
ownership model.

**Rejected for this slice:** A multi-outcome resolver spanning registry
promotion, intentional overrides, Bespoke adoption, forced removal, and adapter
replacement. Those actions have different ownership and persistence semantics.

## D2. Keep unrelated reconciliation state untouched

**Decision:** Resolving the named skill must not apply safe updates or resolve
Conflicts for other skills. Any dependent projection change must be limited to
what the target's replacement requires.

**Why:** The user is authorizing loss of local edits for one named skill, not a
repository-wide forced sync or an ordinary sync of unrelated work.

## D3. Reuse the existing Conflict language

**Decision:** Resolution consumes the existing `drifted` / `local_changes`
classification. “Take registry” describes an action, not a new stored state.

**Why:** `CONTEXT.md`, status output, and the planner already agree on the
condition. No reusable glossary update or ADR is warranted by this scoped
choice.

## D4. Remove repository-wide force sync

**Decision:** Remove `skillfoo sync --force` and its accepted `sync -f` alias;
reject either form as invalid usage. Do not retain a deprecated broad-force
execution path.

**Why:** Once named resolution exists, broad force has no unique safe use. It
can discard edits from multiple Managed skills when the user intended to fix
one Conflict, directly undermining the targeted blast radius.

**Compatibility:** This is an intentional public CLI break while skillfoo is at
`0.0.1`. Help, README guidance, parser tests, and process behavior must change
together so scripts fail visibly instead of silently falling back to ordinary
sync.

## D5. Require a named, directional, non-interactive command

**Decision:** The public grammar is
`skillfoo resolve <skill> --take-registry`. Require exactly one safe skill name
and the `--take-registry` flag. The explicit name and direction together are
sufficient destructive confirmation; do not prompt and do not add `--yes`.

**Why:** The command is unambiguous at invocation time, exposes a bounded blast
radius, and has identical semantics in TTY and automation contexts. Strict
parsing prevents a typo or omitted direction from degrading into a mutation.

**Failure boundary:** Missing or repeated direction, missing or extra
positionals, unknown options, and unsafe skill names fail before registry or
consumer mutation.

## D6. Reconcile only target-dependent projections

**Decision:** After taking the registry version, update the target skill's
managed `AGENTS.md` row and create its Claude adapter when missing. Preserve
every unrelated managed row and adapter. If the target adapter is foreign or
has an unsafe ancestor, preserve it and leave that projection Conflict visible.

**Why:** The target should not retain derived metadata from the discarded local
version, but a skill-specific resolution must not become a repository-wide
projection sync. The skill-content choice also does not prove ownership of a
foreign adapter.

## D7. Require current ownership and conflict evidence

**Decision:** Refresh the registry and classify the target before mutation.
Allow destructive replacement only when the named skill is Desired, has a lock
baseline, is emitted as a real managed directory, and is currently `drifted`
with reason `local_changes`. Revalidate the baseline, local hash, and registry
hash immediately before replacement; changed evidence aborts before target
replacement, cleans staging data, and leaves no durable consumer change.

**Retry:** If the named skill is still Managed, its content matches the current
registry, and its lock entry already records the canonical source and hash,
report success without writing content. This is the exact ordinary
`unchanged` state; a safe `lock_update` is not a resolution no-op. Refuse
Bespoke collisions, removal candidates, unsafe path shapes, missing ownership,
safe pending states, and other Conflict reasons with a corrective diagnostic
and no mutation.

**Why:** The user's command authorizes one known content loss, not a stale or
expanded interpretation of the target. The no-op case makes retry after an
ambiguous successful invocation safe.

## D8. Report the post-resolution repository outcome

**Decision:** After resolving the target or accepting an eligible idempotent
no-op, classify the remaining repository state and return `0` when converged,
`2` when unrelated safe pending changes remain, or `3` when any Conflict
remains. Return `1` for invalid invocation, refusal, stale evidence, or
operational failure.

**Output:** Name the resolved target, state that its local edits were discarded
when replacement occurred, and summarize the remaining outcome with the next
appropriate command. Keep operational diagnostics on stderr and successful
result output on stdout.

**Why:** A targeted mutation can succeed without converging the repository.
Reusing the status outcome vocabulary makes that residual state visible to
humans and automation instead of treating every successful target action as
global convergence.

## D9. Make the target mutation recoverable

**Decision:** Stage and hash the registry copy before touching the consumer.
Keep a temporary recovery copy of the local skill while applying the content,
target lock entry, target managed `AGENTS.md` row, and missing adapter change.
On a handled failure, restore all prior target-dependent state. Keep recovery
data until the post-resolution read-only classification also succeeds; a
classification failure rolls the target back before exit `1`. Remove recovery
data only after the complete result is known.

If adapter creation made previously absent `.claude` or `.claude/skills`
directories, rollback removes those transaction-created ancestors when empty.
It must not remove a pre-existing directory or any concurrent foreign content.

Do not retain a permanent backup after success; the explicit directional choice
authorized discarding the local edits. If rollback cannot complete, preserve
the recovery copy and report its exact path so the user can recover manually.

**Why:** A deliberate destructive choice does not authorize a partial or
unrecoverable result when filesystem work fails. Temporary recovery provides a
bounded transaction without creating persistent Bespoke content after a
successful resolution.

**Boundary:** This contract covers failures caught by the running resolver and
rollback failure within that process. It does not promise fsync durability,
crash consistency, restart-time transaction discovery, or automatic recovery
after process termination or machine failure.
