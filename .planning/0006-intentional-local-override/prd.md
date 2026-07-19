# PRD: Intentional Local Override

**Date:** 2026-07-18
**Status:** Ready for implementation after approved UAT and artifact review

## Problem Statement

Skillfoo detects when a Managed skill has been edited locally and preserves
those edits as a Conflict. A user can now explicitly discard one conflict by
taking the registry, but they cannot express the other local outcome: this
repository’s version should remain intentionally authoritative.

Without durable policy, keeping the bytes merely leaves the repository in the
same attention-required state. Every later edit recreates the same decision,
ordinary sync cannot converge, and automation cannot distinguish deliberate
repository policy from unresolved drift. Converting the content to Bespoke
would discard Managed ownership and projection behavior, while promoting it to
the registry is a distinct cross-repository workflow.

## Solution

Add a second targeted resolver direction that lets a developer keep one
locally edited Desired and Managed skill as a durable Override. The command
preserves local content and its ownership baseline, saves explicit local
authority in project config, keeps Managed projections truthful, and reports
the resulting Override as intentional, visible, and non-conflicting.

An Override is live rather than hash-pinned: later local edits remain accepted
until the user explicitly takes the registry. Registry changes and removal are
tracked without overwriting or deleting the local skill. Missing or unsafe
local material fails closed as a Conflict. Taking the registry reverses policy
in the same recoverable target transaction as content, baseline, and
projection changes.

## User Stories

1. > As a developer with a locally edited Managed skill, I want to keep my
   > repository version explicitly, so that ordinary sync stops presenting my
   > intentional choice as unresolved drift.

2. > As a developer, I want later edits to a healthy Override accepted without
   > another Conflict, so that the repository version can evolve as live local
   > policy.

3. > As a developer, I want the Override saved in project configuration, so
   > that teammates and automation can review the repository’s intent.

4. > As a developer, I want an Override to remain Managed, so that ownership,
   > status, indexing, and agent adapters continue working.

5. > As a developer, I want the prior source baseline retained separately from
   > policy, so that registry evolution and safe reversal remain explainable.

6. > As a developer, I want status to display Override separately from
   > unchanged, pending, and conflicting states, so that intentional divergence
   > remains visible without demanding action.

7. > As a CI author, I want versioned JSON to count Overrides explicitly and
   > describe their registry state, so that automation does not infer intent
   > from human prose.

8. > As a developer, I want a repository containing only healthy Overrides to
   > be Converged, so that intentional local authority does not fail routine
   > checks.

9. > As a developer, I want unrelated safe work or Conflicts to retain their
   > established residual exit statuses after keeping one target, so that a
   > successful choice does not hide the repository’s remaining outcome.

10. > As a developer, I want registry updates tracked but excluded from
    > Override content replacement, so that source evolution never silently
    > erases local policy.

11. > As a developer, I want a registry-removed Override preserved and reported
    > as source-missing rather than deleted, so that an external source change
    > cannot revoke explicit repository intent.

12. > As a developer whose overridden directory disappears, I want a clear
    > Conflict and no implicit restore, so that skillfoo does not guess which
    > authority should recreate it.

13. > As a developer whose overridden path becomes a file, link, or unsafe
    > shape, I want skillfoo to preserve and refuse it without traversal, so
    > that saved policy cannot weaken filesystem safety.

14. > As a developer, I want the managed skill index to use my local description
    > and label the Override, so that agents and humans receive truthful editing
    > guidance.

15. > As a developer with a missing safe adapter, I want the target resolver to
    > recreate it, while preserving foreign adapter content as a separate
    > Conflict, so that content authority never implies foreign ownership.

16. > As a developer, I want repeated keep-local and take-registry commands to
    > be safe no-ops when already satisfied, so that retries after uncertain
    > terminal results do not create new changes.

17. > As a developer, I want taking the registry to clear Override policy and
    > replace target state together, so that reversal cannot leave contradictory
    > policy and content.

18. > As an advanced user, I want valid manually authored Override policy
    > honored even when content currently matches the registry, so that matching
    > bytes never erase explicit intent.

19. > As a repository maintainer, I want comments, unknown keys, ordering, and
    > unrelated config meaning preserved when policy changes, so that the CLI
    > does not erase hand-authored or future configuration.

20. > As a developer with contradictory or unowned policy, I want status to
    > fail before mutation with a correction, so that invalid intent is never
    > presented as trustworthy reconciliation state.

21. > As a developer, I want malformed resolver syntax rejected before project
    > or registry access, so that a missing or duplicated direction cannot
    > degrade into an unintended action.

22. > As a developer, I want a handled write or post-classification failure to
    > restore prior target state, so that policy, content, baseline, and
    > projections never commit partially.

23. > As a maintainer, I want the command to change only the named skill and its
    > dependent state, so that unrelated skills, rows, adapters, configuration,
    > and Conflicts remain untouched.

24. > As a CLI user, I want project-independent help, actionable refusals, clean
    > machine output, and documented exit meanings, so that the new direction is
    > usable in both terminals and automation.

25. > As a repository owner, I want targeted resolution to refuse redirected
    > root metadata and replace changed metadata atomically, so that config,
    > ownership, and generated guidance cannot be written through a symlink or
    > another hardlink.

26. > As an operator diagnosing incomplete rollback, I want the reported
    > recovery directory to contain durable before-snapshots and a manifest, so
    > that useful recovery evidence does not disappear with process memory.

## Implementation Decisions

- Extend project configuration with an optional Override mapping keyed by the
  existing safe skill identity and restricted to the local-authority value.
  Keep ownership and source baseline in the existing lock format without a
  lockfile version change. Represent and query the mapping without
  object-prototype ambiguity for valid prototype-shaped names.
- Treat the repository ADR governing live local overrides as binding: do not
  introduce accepted-local hash pinning or implicit policy clearing.
- Parse Override syntax strictly and validate semantic consistency after the
  registry, selection, and lock are known. Require Managed ownership and reject
  contradictory explicit deselection. Preserve previously Managed policy when
  its registry entry later disappears.
- Add a document-aware config mutation service that can compare current bytes,
  stage one target policy edit, preserve comments and unknown data, avoid
  rewriting satisfied policy, and restore exact prior bytes on rollback.
  Require a real regular config file, preserve its mode, and atomically replace
  it from a validated sibling temporary file. Refuse links and special entries
  so mutation cannot escape the consumer. Harmless serializer whitespace
  normalization is acceptable.
- Extend the shared non-mutating reconciliation plan with a first-class healthy
  Override state and an Override-relative registry state. Healthy Override
  content has no ordinary content action and retains its previous lock entry.
- Treat missing overridden content as a new explicit Conflict reason. Reuse
  the existing unsafe-managed-path Conflict for top-level files, links, and
  other non-directory shapes. Do not weaken emit-root or adapter ancestry
  checks. Preserve existing target row/adapter bytes and suppress missing
  target projection creation until a safe local directory returns. Omit the
  degraded target adapter from public projection records rather than emit a
  false unchanged or safely pending state.
- Allow valid Override records to survive registry catalog removal without
  relaxing missing-registry validation for non-overridden explicit
  selections. Distinguish a successfully observed missing skill from registry
  access/refresh failure, which remains operational and must not use stale
  evidence.
- Advance status JSON to schema version 2. Add the Override state,
  registry-state detail, and a separate skill-summary Override count while
  preserving established ordering, outcome precedence, clean stdout, and exit
  meanings. Make ordinary sync's human headline reconciliation-neutral so it
  does not claim Override content came from the registry.
- Keep generated skill guidance neutral about edit location and label only
  overridden rows with repository-local authority. Derive the target row from
  local skill metadata and preserve unrelated rows and repository-authored
  content.
- Extend the targeted resolver command service with two explicit directions.
  Keep-local accepts the existing local-change Conflict or a healthy Override
  retry; the CLI does not proactively create policy for an unchanged target.
  Valid manual policy remains supported.
- Make take-registry the explicit reversal. When a source exists, clear target
  policy together with registry content installation, target lock update, row
  update, and missing safe adapter creation. Allow restoration of a missing
  overridden directory but refuse replacement of an unsafe target shape.
- Reuse the existing recoverable target transaction pattern. Revalidate config,
  ownership, local and registry evidence, row, and adapter state at the
  mutation boundary. Require config and lock to be existing real regular
  files; permit `AGENTS.md` only when absent or real regular. Refuse redirected
  or special root metadata before mutation. Revalidate file identity and exact
  bytes immediately before each write.
- Use one atomic root-metadata writer for changed config, lock, and
  `AGENTS.md`: stage beside the destination, preserve the existing mode, and
  install without writing through the old inode. Other hardlinks must retain
  their prior bytes. Preserve a raced concurrent replacement and fail rather
  than overwriting it.
- Before the first durable mutation, persist a recovery manifest and exact
  before-snapshots for config, lock, `AGENTS.md`, direction-dependent target
  content, adapter state, and transaction-created ancestors. Keep them through
  post-action planning; restore every attempted target-dependent change on
  handled failure. Use compare-and-set rollback so concurrent state is
  preserved rather than overwritten and incomplete restoration reports and
  retains an inspectable recovery path.
- Keep the CLI entrypoint thin and continue using the runtime’s strict built-in
  argument parser. Require exactly one name and one exclusive direction,
  validate before side effects, render success on stdout and progress/failure
  on stderr, and return the residual repository outcome.
- Deliver the slice as one branch and one pull request. Do not introduce a new
  CLI framework, persistence store, prompt, account requirement, or network
  capability.
- Update README configuration, reconciliation, resolution, and “How it works”
  prose. Describe the registry as the default authority for Managed skills and
  explicit local Override policy as the exception; remove the unconditional
  source-of-truth claim.

## Testing Decisions

- Add configuration tests for omitted and empty policy, valid maps, every
  malformed YAML shape, non-string and complex keys, unsafe and duplicate
  names, unsupported values, prototype-shaped safe names, contradictory
  selection, missing ownership, registry removal, matching manually authored
  policy, comment/unknown-key preservation, whitespace normalization,
  last-entry removal, file-mode preservation, symlink/special-file refusal,
  exact no-op, atomic replacement, temporary cleanup, and exact rollback
  bytes.
- Add a resolver metadata safety matrix for both directions: symlink,
  directory, and special-entry refusal for config/lock/`AGENTS.md`; hardlink
  sentinels proving changed consumer metadata never mutates another link;
  identity/byte races; preserved modes; and adjacent temporary cleanup on
  success and failure.
- Expand the planner truth table across policy presence, lock ownership, local
  shape and hash, registry baseline/current/missing state, explicit and
  implicit selection, and mixed unrelated work. Assert typed records, retained
  lock state, summaries, and overall outcomes.
- Test status schema version 2 structurally: stable ordering, Override state,
  all registry-state values, separate summary count, mixed precedence, human
  wording, stdout/stderr cleanliness, and `0`/`2`/`3` exits.
- Test ordinary sync output with healthy, changed-source, and source-missing
  Overrides so its headline and tally never imply their content was copied
  from the registry.
- Test generated guidance for neutral introduction, local description and
  suffix, exact unrelated-row retention, repository-authored content
  preservation, multiple Overrides, reversal of one or the final Override, and
  exact degraded-target row preservation without adding a missing row.
- Add command-service tests for first keep-local, later local edits, matching
  manual policy, healthy retries, missing and unsafe materialization,
  changed/missing registry sources, missing/correct/foreign adapters, target
  isolation, degraded-target adapter preservation/non-creation,
  take-registry reversal, missing-directory restoration, and refusal of every
  other existing planner state without writes.
- Inject failures before and after every mutation step. Assert stale evidence
  aborts before mutation, handled failures restore complete prior state,
  transaction-created ancestors are cleaned safely, and incomplete rollback
  preserves and reports the recovery path. Inspect the retained manifest and
  durable before-snapshots rather than accepting an empty transaction
  directory. Inject concurrent config, lock, and projection replacement during
  write and rollback and prove the resolver never overwrites it.
- Add parser tests for both valid directions, both/neither/repeated flags,
  missing or extra positionals, `--` end-of-options behavior, unsafe names,
  unknown options, help, and validation-before-access behavior.
- Spawn the compiled executable in paths containing spaces and non-ASCII
  characters. Assert exact exit, stdout/stderr channel discipline, residual
  outcomes, idempotency, config durability, and unsupported-state refusals.
- Retain cross-platform filesystem coverage for POSIX links and Windows
  junctions, path normalization, atomic root-metadata replacement, adapter
  ancestry, hardlink side effects, mode/attribute behavior, and
  permission/error behavior across supported Node releases.
- Run the approved manual UAT against a separate disposable consumer and local
  registry. Do not use the skillfoo repository as a mutation fixture.
- Run the repository’s complete typecheck/build/test gate, inspect the packed
  npm artifact, install it into a temporary project, and smoke-test the
  npm-created executable rather than relying on source execution.

## Out of Scope

- Promote repository content to the source registry or perform any
  cross-repository git write, commit, push, or pull request.
- Convert Managed content to Bespoke content.
- Add a proactive keep-local CLI workflow for an unchanged source-managed
  skill; valid manually authored policy is still honored.
- Adopt, replace, or delete Bespoke content at a Desired path.
- Replace files, links, special entries, unsafe ancestors, or foreign adapters.
- Force-remove an Override or locally edited Managed skill.
- Add skill-selection management commands.
- Add git-native delivery, hosted rollout state, authentication, entitlements,
  billing, or dashboard behavior.
- Add a new status exit code or alter the existing outcome precedence.
- Change the lockfile version or store mutable local hashes in the lock.
- Guarantee process-crash consistency, fsync durability, restart-time
  transaction discovery, or automatic recovery cleanup.

## Open Questions

- None. The approved discovery, decisions, and UAT resolve the slice’s product
  and acceptance boundaries.
