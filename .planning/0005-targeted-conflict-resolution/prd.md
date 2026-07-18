# PRD: Targeted Conflict Resolution

**Date:** 2026-07-18
**Status:** Approved

## Problem Statement

Skillfoo can identify and preserve a locally edited Managed skill, but it does
not provide a bounded way to choose the registry version as the winner. The
existing repository-wide force option applies the same destructive choice to
every locally edited Managed skill in the reconciliation plan. A user trying to
resolve one Conflict can therefore discard unrelated work.

Users need one explicit command that authorizes content loss for one named
Managed skill, proves the target still has the expected ownership and local-edit
Conflict, and leaves every unrelated skill and projection untouched.

## Solution

Add `skillfoo resolve <skill> --take-registry`. The command refreshes the
configured registry, validates that the named target is a Desired and Managed
skill currently conflicted by local changes, and replaces only that skill with
the verified registry version. It advances only the target's ownership
baseline, updates only the target's managed description row, and creates only a
missing target adapter. Foreign adapters and all unrelated reconciliation state
are preserved.

The command is strict and non-interactive. The required name and directional
flag are the destructive confirmation. It stages the replacement and retains a
temporary recovery copy until every target-dependent write succeeds. A handled
failure restores the prior target state; an incomplete rollback preserves and
reports the recovery location.

After success, the command reports whether the repository is Converged, still
has safe pending changes, or still has another Conflict. The broad
`skillfoo sync --force` option and its `sync -f` alias are removed and rejected.

## User Stories

1. > As a repository maintainer, I want to take the registry version for one
   > named locally edited Managed skill, so that I can resolve its Conflict
   > without risking edits in other skills.

2. > As a repository maintainer, I want the destructive direction to be
   > explicit in the command, so that a missing or mistyped choice cannot cause
   > content loss.

3. > As an automation author, I want resolution to be non-interactive, so that
   > the same validated command behaves consistently in terminals and CI.

4. > As a repository maintainer, I want local-only files inside the named skill
   > removed when I take the registry version, so that the resolved directory
   > exactly represents the registry source.

5. > As a repository maintainer, I want only the named skill's lock baseline to
   > advance, so that ownership evidence for every unrelated skill remains
   > unchanged.

6. > As a repository maintainer, I want the named skill's managed description
   > row to match the selected registry content, so that agent guidance does not
   > describe discarded local content.

7. > As a repository maintainer, I want a missing adapter for the named skill
   > recreated, so that the resolved skill remains discoverable through the
   > configured adapter.

8. > As a repository maintainer, I want a foreign or unsafe adapter preserved,
   > so that taking skill content never silently claims ownership of another
   > projection.

9. > As a repository maintainer, I want other local-edit Conflicts left
   > byte-for-byte unchanged, so that resolving one skill cannot resolve or
   > damage another.

10. > As a repository maintainer, I want unrelated safe registry updates left
    > pending, so that a targeted resolution never behaves like ordinary
    > repository-wide sync.

11. > As a repository maintainer, I want Bespoke collisions, removal
    > candidates, unsafe path shapes, missing ownership, and other Conflict
    > reasons refused without writes, so that the command cannot broaden my
    > authorization.

12. > As a repository maintainer, I want the command to revalidate ownership,
    > local content, and registry content at the mutation boundary, so that a
    > stale decision cannot overwrite newly changed data or leave a durable
    > transaction artifact.

13. > As a repository maintainer, I want a repeated command to succeed as a
    > no-op when the same Managed skill and its canonical lock baseline already
    > match the current registry, so that retry after an ambiguous success is
    > safe.

14. > As a repository maintainer, I want a handled write failure to restore the
    > previous skill, lock, managed row, and adapter state, so that resolution
    > cannot leave a partial result.

15. > As a repository maintainer, I want an incomplete rollback to preserve and
    > identify a recovery copy, so that my discarded local content remains
    > manually recoverable after an exceptional failure.

16. > As an automation author, I want stdout, stderr, and exit statuses to
    > distinguish success, remaining safe work, remaining Conflicts, and
    > refusal, so that scripts can react without parsing incidental prose.

17. > As a repository maintainer, I want removed `sync --force` and `sync -f`
    > invocations to fail visibly, so that an old script cannot silently perform
    > a different synchronization behavior.

18. > As a new user, I want root and command help to show the exact resolver
    > grammar and outcomes, so that I understand the content-loss boundary
    > before invoking it.

## Implementation Decisions

- Add a strict resolve command boundary that accepts exactly one safe skill name
  and one required `take-registry` direction. Parse and validate the complete
  invocation before registry access or consumer writes; reject a repeated
  direction rather than silently accepting it.
- Remove force from ordinary sync. Strictly reject the removed option and other
  unsupported sync arguments, including the former short alias, so legacy force
  calls cannot degrade into a plain sync.
- Introduce a resolution coordinator separate from ordinary sync execution. It
  prepares one registry catalog, obtains the ordinary read-only reconciliation
  classification, selects one target, and never executes unrelated plan
  records.
- Model target eligibility explicitly. Destructive resolution requires a
  Desired skill with a lock baseline, a real emitted directory, and the exact
  `drifted` / `local_changes` Conflict. A still-Managed target whose content and
  canonical lock entry are both current is the only successful no-op. A target
  needing a safe lock metadata update is refused with the other non-resolution
  states. Refusals are typed rather than derived from diagnostic text.
- Carry or derive immutable evidence for the target's prior lock entry, local
  hash, registry hash, and resolved paths. Validate those values again after
  staging and immediately before replacing consumer state.
- Encapsulate filesystem replacement behind a recoverable target transaction.
  Stage the complete registry directory under a validated project-owned
  location, verify its hash, retain the original directory as recovery data,
  and make rollback restore every target-dependent write in reverse order.
- Track adapter ancestors created by the transaction. Rollback removes them
  only when they were previously absent and remain empty, preserving all
  pre-existing or concurrent foreign content.
- Treat rollback failure as a distinct operational result. Preserve recovery
  data, avoid masking the original failure, and include the exact recovery path
  in the diagnostic. Successful resolution removes all temporary artifacts and
  leaves no permanent backup.
- Provide a targeted projection operation rather than rendering the complete
  ordinary-sync projection plan. Replace only the named managed description row
  while preserving unrelated managed rows and Bespoke document content byte for
  byte. Create a missing target adapter; preserve and report a foreign or unsafe
  adapter.
- Update the lockfile through a target-entry operation that starts from a fresh
  lock read and verifies the expected prior entry. Preserve every unrelated
  entry exactly and retain lockfile version 1; this slice adds no persisted
  resolution or override state.
- Recompute a read-only reconciliation plan using the same prepared registry
  catalog after target-dependent writes but before discarding recovery data.
  Map its outcome to `0` Converged, `2` safe changes available, or `3` attention
  required. If classification fails, roll back the target and use `1`, just as
  for parsing, eligibility, stale-evidence, rollback, or operational failures.
- Render successful resolution and no-op results to stdout. Render usage,
  refusal, stale-evidence, and operational diagnostics to stderr. Keep wording
  actionable while treating command grammar, outcome categories, and exit
  statuses as the stable contract.
- Update user documentation and help in the same change. Describe the targeted
  content-loss choice, removed broad-force behavior, idempotent retry, residual
  outcome codes, and the unsupported resolution outcomes.
- Deliver the slice in one pull request. It requires no lockfile migration, new
  dependency, remote write, or durable architecture decision record.

## Testing Decisions

- Unit-test command parsing for the required name and direction, unsafe names,
  missing values, extra positionals, repeated or unknown options, help, and
  removed force syntax. Assert parsing failures occur before registry access.
- Unit-test resolution classification for the eligible local-edit Conflict,
  eligible no-op, and every refused state. Assert typed results rather than
  matching rendered messages.
- Integration-test exact target isolation with at least two Managed skills.
  Snapshot unrelated emitted content, lock entries, managed rows, and adapters
  before resolution and prove byte-for-byte equality afterward.
- Integration-test target-dependent projection behavior for a changed
  description, missing adapter, foreign adapter, and surrounding Bespoke
  `AGENTS.md` content.
- Inject stale local, registry, and lock evidence between planning and the
  mutation boundary. Each case must exit without target replacement, durable
  consumer change, or leftover staging data.
- Inject failures at each transaction step after replacement begins. Prove
  successful rollback restores content, lock, document, and adapter state;
  include post-resolution classification failure, and separately prove rollback
  failure preserves and reports recovery data.
- Test idempotent retry without content or projection writes and confirm an
  unmanaged byte-identical collision is still refused.
- Process-test the compiled executable for exact stdout/stderr separation and
  exit statuses `0`, `1`, `2`, and `3`, including another Conflict and an
  unrelated safe pending change.
- Retain the repository's typecheck, build, full test suite, package smoke, and
  cross-platform filesystem coverage. Exercise Windows rename and junction
  behavior where the transaction and adapter paths differ from POSIX.
- Run the approved manual UAT in disposable local-registry consumers. Do not use
  a real consumer repository to prove destructive behavior.

## Out of Scope

- Keeping local edits as an intentional override.
- Converting a Managed skill to Bespoke content.
- Promoting consumer edits into the source registry.
- Adopting or replacing a Bespoke collision at a Desired path.
- Resolving an unsafe emitted path, foreign adapter, or adapter ownership
  Conflict.
- Force-removing a deselected Managed skill.
- Resolving multiple named skills in one invocation.
- Applying unrelated safe sync work during resolution.
- Changing desired-skill selection or configuration format.
- Changing lockfile schema or persisting resolution history.
- Creating permanent backups, git commits, publishing changes, or remote pull
  requests.
- Offline registry resolution, multi-registry support, or broad Bespoke audits.
- Crash consistency, fsync durability, restart-time transaction discovery, or
  automatic recovery after process termination or machine failure.

## Open Questions

- _(none)_
