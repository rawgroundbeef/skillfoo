# PRD: Safe Project Initialization

**Date:** 2026-07-18
**Status:** Draft

Acceptance guidance: [`uat.md`](./uat.md)

## Problem Statement

A developer cannot use skillfoo in a new repository until they manually create
and correctly format `.skillfoo.yml`. The CLI offers no guided way to validate a
registry, discover its skills, express an intentional desired selection, or
establish the first managed baseline. This makes first-project connection the
least safe and least polished part of an otherwise safety-focused
reconciliation system.

The missing entrypoint also leaves automation without a non-interactive
initialization contract and encourages users to discover configuration errors
only after a mutating sync attempt.

## Solution

Add `skillfoo init` as the local, accountless first-project connection command.
It accepts a registry, supports interactive or explicit skill selection,
optionally records a contained custom emit root, creates a deterministic config
without replacing an existing one, and immediately delegates to ordinary safe
reconciliation.

Initialization finishes with a clear outcome: converged, configured but needing
attention, or operationally failed with the valid config retained for recovery.
It never hides conflicts, follows an emit path outside the consumer, or grows a
second installation engine.

## User Stories

1. > As a developer in a new repository, I want one command to connect my skills registry, so that I do not need to learn the YAML schema before trying skillfoo.
2. > As a developer in a terminal, I want to see the registry's available skills and choose by name, so that my first desired set is intentional.
3. > As an automation author, I want repeatable named-selection flags, so that initialization is deterministic without a prompt.
4. > As an automation author, I want an explicit all-skills flag, so that a script never installs every skill merely because input is unavailable.
5. > As a repository owner choosing all skills, I want future registry additions to become desired automatically, so that the all-skills policy stays truthful over time.
6. > As a repository owner choosing named skills, I want that list to remain fixed, so that unrelated future registry additions are not installed.
7. > As a developer with a custom project layout, I want to choose an in-repository emit root, so that managed skills fit the repository without escaping its ownership boundary.
8. > As a developer, I want invalid registries and missing skill names rejected before configuration or project files are written, so that a typo does not leave partial setup.
9. > As a developer, I want malformed flags and incompatible selection options rejected before writes, so that CLI mistakes are safe and actionable.
10. > As a repository owner with an existing config, I want init to leave every byte unchanged, so that onboarding cannot silently replace established desired state.
11. > As a repository owner, I want config creation protected against a concurrent writer, so that a race cannot truncate or replace another process's file.
12. > As a repository owner with bespoke content at a desired destination, I want init to preserve it and report attention required, so that first connection follows the same never-clobber promise as later syncs.
13. > As a developer whose config was created before reconciliation failed, I want the valid config retained with a recovery instruction, so that partial setup can move forward safely.
14. > As a developer, I want init to exit successfully only when the repository is converged, so that scripts can trust completion without parsing prose.
15. > As a developer, I want a distinct attention-required exit when conflicts remain, so that initialization is not falsely reported as complete.
16. > As a repository owner, I want absolute, escaping, linked, or otherwise redirected emit roots rejected, so that skillfoo never treats out-of-project content as repository-managed state.
17. > As a developer, I want rerunning init to refuse reinitialization and rerunning sync to be idempotent, so that repeated commands cannot silently change my selection.
18. > As a package user, I want the installed npm executable to behave like development tests, so that source-only success does not hide a broken release artifact.

## Implementation Decisions

- Keep the public grammar
  `skillfoo init <registry> [--skill <name> ... | --all] [--emit <path>]`.
  The registry is the only positional, named selection is repeatable, and named
  selection is mutually exclusive with all-skills selection.
- Use strict built-in argument parsing. Unknown flags, missing values, extra
  positionals, and incompatible options are usage failures before mutation.
- Prompt only when terminal input is available and no selection flag was
  supplied. List available names deterministically and accept exact
  comma-separated names or `all`. Cancellation and non-interactive missing
  selection fail without writes.
- Do not add a prompting dependency. Extend the existing CLI I/O boundary with
  only the injectable interaction capabilities needed for TTY detection and
  line-oriented input.
- Share deterministic registry skill enumeration between initialization and
  reconciliation. A selected name absent from the resolved registry is rejected
  before config creation.
- Preserve existing desired-set semantics. All-skills selection omits the
  `skills` key and remains dynamic; named selection writes a normalized explicit
  list in first-occurrence order.
- Render minimal deterministic LF-terminated YAML. Always write the registry,
  omit the default emit root, write a custom emit root, omit dynamic all-skills,
  and write named selection as a list.
- Create config using exclusive filesystem semantics. Existing or concurrently
  created config is never replaced, merged, or reformatted.
- Validate emit at the shared configuration boundary. Require a non-empty
  relative path contained within the consumer, and reject existing linked,
  junction, non-directory, or special ancestors before registry or project
  mutation. The same rule governs init, status, and sync.
- Delegate first-project writes to the ordinary non-force reconciliation plan
  and executor. Initialization does not own separate skill, lock, AGENTS.md, or
  adapter mutations.
- Let ordinary sync expose the completed reconciliation outcome to its caller
  while preserving the existing sync command's exit and output behavior. Init
  translates the result to `0` for converged and `3` for attention required.
- Retain valid config after a reconciliation conflict or operational failure.
  State explicitly whether config creation succeeded and direct recovery through
  status and sync. Init has no exit `2` because it executes safe pending work.
- Keep local and Git-backed init accountless. Registry refresh may update only
  the existing isolated private cache before consumer configuration is created.
- Update command help and the public quickstart to make init the primary first
  connection while retaining the config reference for manual users.

## Testing Decisions

- Unit-test strict parsing for required positionals, repeatable named selection,
  mutual exclusion, custom emit, help, unknown options, missing values, and
  extra positionals.
- Unit-test interactive selection through injected TTY/input boundaries,
  including deterministic listing, named order, `all`, retryable invalid input,
  cancellation, and non-TTY refusal.
- Unit-test config rendering, first-occurrence normalization, exclusive create,
  default omission, custom fields, existing-byte preservation, and write errors.
- Exercise shared emit validation for absolute paths, lexical escape, linked or
  junction ancestors, files, special entries where supported, missing safe
  ancestors, and ordinary in-project paths. Assert rejection precedes registry
  access and any consumer mutation.
- Test the initialization service with controlled local registries for explicit
  selection, dynamic all, missing skills, existing config, preserved bespoke
  conflicts, and failures after config creation.
- Ensure sync still reports its historical exit behavior while exposing enough
  structured result for init to return `0`, `1`, or `3` correctly.
- Add compiled-process tests for exact stream separation, statuses, no-prompt
  automation, paths containing spaces and non-ASCII characters, and complete
  tree immutability on pre-write failures.
- Preserve existing sync and status suites as regression coverage for the shared
  config and reconciliation changes.
- Run the approved UAT with disposable consumers and an isolated remote cache.
- Build, pack, inspect, install, and invoke the tarball-created executable; test
  the supported Node range and Windows path/junction behavior in CI.

## Out of Scope

- Reinitializing, merging, or editing an existing `.skillfoo.yml`.
- Commands for adding or removing desired skills after initialization.
- Config-only init, `--no-sync`, JSON output, command aliases, or alternate
  registry flags.
- Explicit conflict resolution, taking the registry version, promoting local
  changes, intentional overrides, force removal, or managed-to-bespoke
  conversion.
- Automatic git commits, pushes, pull requests, rollout state, or repository
  fan-out.
- Creating or seeding a registry.
- Hosted GitHub OAuth/App onboarding, skillfoo sessions, billing, or entitlement
  checks.
- Multiple registries or org/team/repo inheritance.
- Emit-root migration or cleanup for projects with an existing managed lock.
- General migration of legacy sync argument parsing.
- Performance cleanup for repeated registry skill-directory walks.

## Open Questions

- None. The selection UX, command grammar, partial outcome, all-skills policy,
  emit containment, config rendering, and module boundaries were resolved
  before this PRD.
