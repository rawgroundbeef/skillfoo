# Discovery: Targeted Conflict Resolution

Date: 2026-07-18

## Kickoff

Choose the next product slice after safe project initialization. The selected
problem is the dead end between detecting a preserved conflict and resolving it
without a broad or manual filesystem operation.

## Refined problem

Ordinary reconciliation correctly preserves local edits to a Managed skill and
reports a `drifted` Conflict with reason `local_changes`. Read-only status tells
the user that an explicit choice is required, but the only built-in way to make
the registry copy win is `skillfoo sync --force` (also accepted as `sync -f`).
That option applies one force choice across the whole reconciliation plan, so it
can overwrite local edits in more than one Managed skill.

The first resolver should let the user intentionally discard local edits for
one named, Desired and Managed skill and replace only that skill with the
current registry version. Other skills, including other Conflicts and safe
pending changes, remain untouched.

## Existing domain language

This slice uses the terms already defined in `CONTEXT.md`:

- A **Managed skill** has a skillfoo ownership record and baseline.
- A **Conflict** is preserved until the user makes an explicit choice.
- `drifted` with reason `local_changes` is the existing state this slice can
  resolve.

“Take registry” is the user action: choose the current registry content as the
winner and intentionally discard local changes for the named Managed skill. It
is not a new persisted state.

## Code evidence

- `src/plan.ts` accepts one plan-wide `force` boolean. In `desiredRecord`, force
  changes every locally edited desired directory from `drifted` to `update` and
  marks it as overwriting local edits.
- `src/sync.ts` executes every safe action in the reconciliation plan and
  mirrors a forced skill from its registry directory, including removing files
  that no longer exist in the registry.
- `src/cli.ts` recognizes `sync --force` and `sync -f` by searching the entire
  argv and does not provide a named-skill resolution command.
- `src/status.ts` already exposes the stable `drifted` / `local_changes`
  diagnosis and exits `3` when any Conflict requires attention.
- `.skillfoo.lock` records the prior source and content hash needed to prove the
  target is Managed; it does not record an override or resolution state.

## Resolved scope

- Resolve one explicitly named skill at a time.
- Support one outcome: take the current registry version for a Desired, Managed
  skill whose current Conflict is `drifted` / `local_changes`.
- Discard that target's local edits only after the user expresses the explicit
  directional choice.
- Update the target's ownership baseline after replacement.
- Leave every unrelated skill and unrelated Conflict untouched.
- Remove `skillfoo sync --force` and its `sync -f` alias; broad destructive
  reconciliation is no longer a supported compatibility path.
- Expose the action as
  `skillfoo resolve <skill> --take-registry`. Both the name and direction are
  required; the explicit directional flag is the destructive confirmation.
- Keep the resolver non-interactive. Missing values, omitted direction, extra
  positionals, repeated direction flags, and unknown flags fail before consumer
  mutation.
- Reconcile only projections dependent on the named target: update its managed
  `AGENTS.md` row to the registry description and create its Claude adapter if
  missing. Preserve every unrelated row and adapter.
- Preserve a foreign or unsafe adapter for the target as its own Conflict; the
  take-registry choice authorizes replacing skill content, not taking ownership
  of a foreign projection.
- Refresh and classify before writing. Destructive replacement is eligible only
  while the named target is Desired, Managed, a real directory, and currently
  `drifted` for `local_changes`.
- Revalidate the target's prior baseline, local hash, and registry hash at the
  mutation boundary. Changed evidence aborts before target replacement, cleans
  any staging data, and leaves no durable consumer change.
- Treat a repeat invocation as a successful no-op only when the named skill is
  still Managed, its content matches the current registry, and its lock entry
  already records the canonical source and hash. Refuse all other states with a
  corrective diagnostic and no mutation.
- After a successful resolution or eligible no-op, report the remaining
  repository outcome with the established status codes: `0` converged, `2`
  safe pending changes, and `3` at least one remaining Conflict. Use `1` for
  invalid invocation, ineligible or stale targets, and operational failure.
- Stage and verify registry content before mutation. Keep a temporary recovery
  copy while replacing the target and its dependent state; restore the prior
  target, lock, managed row, and adapter state on a handled failure.
- Adapter rollback removes any empty adapter ancestors created solely by the
  transaction so a failed resolution restores the prior filesystem shape.
- Keep recovery data until the post-resolution read-only classification
  succeeds. If that classification fails, roll the target back before returning
  exit `1` so failure never hides a committed destructive action.
- Remove recovery data after success rather than leaving a permanent backup. If
  rollback itself cannot complete, preserve the recovery copy and report its
  exact path.

## Non-goals

- Promote local edits into the registry.
- Keep local edits as an intentional override.
- Convert Managed content to Bespoke content.
- Adopt or overwrite a Bespoke collision at a Desired path.
- Force a blocked removal or replace a foreign adapter.
- Change skill selection in `.skillfoo.yml`.
- Add git commits, publishing, or remote pull-request fan-out.
- Guarantee crash consistency, fsync durability, or automatic discovery and
  cleanup of transaction artifacts after process termination or machine
  failure. This slice guarantees handled-failure rollback only.

## Open questions

- _(none at the UAT alignment gate)_
