# UAT: Safe Project Initialization

**Status:** Approved 2026-07-18

**Goal:** A developer can connect an unconfigured repository to a skills
registry, intentionally select desired skills, and finish the first safe
reconciliation without hand-authoring YAML or risking existing content.

## Prerequisites

- Branch `safe-project-init` built with `npm run build`.
- A disposable parent directory containing:
  - `registry/alpha/SKILL.md` and `registry/beta/SKILL.md`, each with valid
    `name` and `description` frontmatter.
  - An empty `consumer/` directory.
- A terminal session for the interactive scenario and a non-TTY subprocess for
  automation scenarios.
- For the release smoke test, an `npm pack` tarball installed into a separate
  empty temporary project; invoke the npm-created `skillfoo` executable rather
  than a source file.
- Snapshot the complete disposable consumer tree, including ignored files and
  links, for every no-mutation assertion.

## Happy Path: Explicit Non-Interactive Selection

1. From empty `consumer/`, run:

   ```sh
   skillfoo init ../registry --skill alpha --skill beta
   ```

2. Read `.skillfoo.yml`.
3. Inspect `.agents/skills/`, `.skillfoo.lock`, the managed block in `AGENTS.md`,
   and `.claude/skills/`.
4. Run `skillfoo status`.
5. Run `skillfoo sync` once more.

Expected:

- Init exits `0`, reports config creation and first reconciliation, and never
  prompts.
- `.skillfoo.yml` contains `registry: ../registry` and an explicit `skills`
  list ordered `alpha`, then `beta`; default `emit` is omitted.
- Both complete skill directories are managed under `.agents/skills/`, lock
  entries establish their baselines, AGENTS.md lists them, and Claude adapter
  links target them.
- Status exits `0` and reports `converged`.
- The repeated sync reports zero additions or updates and does not change
  consumer bytes or links.

## Interactive Selection

1. Reset `consumer/` to empty and run `skillfoo init ../registry` in a TTY.
2. Confirm the prompt lists `alpha` and `beta` in deterministic name order.
3. Enter `beta, alpha`.
4. Repeat from another empty consumer, cancel the prompt, and inspect the tree.

Expected:

- The first run creates an explicit list preserving `beta`, then `alpha`, and
  reconciles both skills.
- The prompt accepts exact available names, rejects unknown or empty input with
  an actionable retry, and does not require a prompt dependency.
- Cancellation exits non-zero and creates no config, lock, managed skill,
  AGENTS.md change, or adapter.

## Dynamic All-Skills Policy

1. Reset the consumer and run `skillfoo init ../registry --all`.
2. Confirm `.skillfoo.yml` has no `skills` key.
3. Add a valid `registry/gamma/SKILL.md`.
4. Run `skillfoo status`, then `skillfoo sync`, then status again.

Expected:

- Init installs `alpha` and `beta` and exits `0`.
- The new registry skill makes status exit `2` with `gamma` as a safe pending
  addition.
- Sync adds `gamma`; final status exits `0`.
- A named-selection config would not desire `gamma` under the same registry
  change.

## Custom In-Repository Emit

1. Reset the consumer and run:

   ```sh
   skillfoo init ../registry --skill alpha --emit tools/agent-skills
   ```

2. Inspect config, managed content, AGENTS.md, adapter target, and status.

Expected:

- Config records `emit: tools/agent-skills`.
- Alpha is managed only at that in-repository root; AGENTS.md and the Claude
  adapter target the custom root.
- Status exits `0`.

## Invocation and Selection Guardrails

For each case, start with an empty consumer, run the command, and compare the
complete tree before and after:

1. Run init from a non-TTY with neither `--skill` nor `--all`.
2. Combine `--all` with `--skill alpha`.
3. Provide an unknown option, missing option value, extra positional, or no
   registry positional.
4. Select a name that is absent from the registry.
5. Repeat `--skill alpha` and then `--skill beta` to confirm repeatable parsing;
   repeat `alpha` twice to confirm first-occurrence normalization.

Expected:

- Cases 1–4 exit `1` with concise actionable diagnostics and create no consumer
  file, directory, or link.
- Unknown selection errors list deterministic available names after registry
  inspection but still leave the consumer unchanged.
- Valid repeatable flags preserve first-occurrence order and do not create
  duplicate config, plan, lock, or projection records.
- Usage and operational diagnostics go to stderr; no stack trace is printed by
  default.

## Existing Configuration Is Never Reinitialized

1. Create `.skillfoo.yml` with distinctive comments and bytes.
2. Point it at an unavailable registry to make accidental config loading or
   reconciliation visible.
3. Run `skillfoo init ../registry --all`.
4. Compare the full consumer tree and registry cache before and after.

Expected:

- Init exits `1` and directs the user to `status` or `sync`.
- Existing config bytes are unchanged.
- No registry is fetched and no other consumer or cache path changes.

## Emit Containment

1. From an empty consumer, try init with an absolute emit path and with
   `--emit ../outside`.
2. Create a path inside the consumer whose existing ancestor is a symlink (or
   Windows junction) to a disposable outside directory; try to init beneath it.
3. Manually create configs with the same unsafe emit values and invoke both
   `skillfoo status` and `skillfoo sync`.
4. Inspect the consumer, outside directory, and registry cache.

Expected:

- Every command exits `1` before registry access or consumer mutation.
- Diagnostics identify the unsafe `emit` configuration without exposing a
  stack trace.
- No path outside the consumer is read as managed content, created, changed, or
  removed.
- Existing symlink or junction ancestors remain untouched.

## Preserved Conflict After Config Creation

1. Reset the consumer and create bespoke content at
   `.agents/skills/alpha/SKILL.md` with distinctive bytes.
2. Run `skillfoo init ../registry --skill alpha`.
3. Inspect config, bespoke content, lock, projections, and exit status.
4. Run `skillfoo status`.

Expected:

- Init retains the new valid `.skillfoo.yml`, applies any independently safe
  projection work, preserves the bespoke alpha bytes, and exits `3`.
- Output says the project was initialized but needs attention; it does not claim
  convergence.
- Skillfoo does not create a false managed baseline for the blocked skill.
- Status exits `3` and reports the same unmanaged-destination conflict.

## Operational Failure After Config Creation

1. In a controlled automated fixture, inject a filesystem failure after the
   exclusive config write but before first reconciliation completes.
2. Inspect config and all partially attempted projections.
3. Remove the injected failure and run `skillfoo status` followed by
   `skillfoo sync`.

Expected:

- Init exits `1`, states that config was created but reconciliation failed, and
  keeps the valid config.
- It does not attempt a misleading config-only rollback or delete unrelated
  content.
- Status truthfully reports the remaining plan, and ordinary sync can safely
  converge the project after the environmental failure is removed.

## Known Non-Goals

- Reinitializing or editing an existing config.
- Explicit conflict resolution, registry promotion, or intentional overrides.
- Config-only initialization or JSON output.
- Automatic git commits, pushes, pull requests, or hosted fan-out.
- Creating a registry, multiple registries, or compositional inheritance.
- GitHub OAuth/App login, hosted entitlements, or billing.
- Emit-root migration for a project with an existing managed lock.

## Not Tested

- Hosted behavior; init is intentionally local and accountless in this slice.
- Real production registries or repositories; all acceptance work uses
  disposable local fixtures or an isolated Git cache.
- Every Windows junction edge manually; automated Windows CI remains the
  required coverage for platform-specific path containment and adapters.

## Pass Criteria

- From a clean disposable repository, the packed `skillfoo` executable can
  initialize an explicit or dynamic skill selection, perform the first safe
  reconciliation, and finish converged, while every invalid, conflicting, or
  out-of-repository path preserves existing content and returns the documented
  recovery signal.
