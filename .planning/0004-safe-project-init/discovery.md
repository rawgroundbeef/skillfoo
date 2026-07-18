# Discovery: Safe Project Initialization

Date: 2026-07-18

## Kickoff

Add `skillfoo init` as the first-project connection workflow after the safe
reconciliation foundation shipped in slices 0001–0003. Initialization should
scaffold `.skillfoo.yml`, let the user choose desired skills, and run the first
ordinary safe reconciliation.

The private product plan identifies this as the M1/M2 entry immediately after
read-only status and before explicit conflict resolution or git publishing.

## Problem Evidence

- A new user must currently hand-author `.skillfoo.yml` before any CLI command
  can inspect a registry or project. Both `sync` and `status` fail when the file
  is absent.
- The public README documents the schema, but the CLI does not help choose a
  registry, inspect its available skills, validate a desired selection, or
  establish the first managed baseline.
- `src/config.ts` owns config parsing and defaults but has no creation path.
- Existing config validation accepts any string for `emit`; the planner resolves
  it against cwd without checking that it remains inside the consumer. Adding a
  first-class `init --emit` flag requires an explicit containment decision
  rather than silently exposing an out-of-project write target.
- `src/registry.ts` already resolves local and Git-backed registries and routes
  progress through an injected reporter.
- `src/plan.ts` already enumerates registry directories containing `SKILL.md`,
  normalizes and validates desired names, rejects missing selections, and
  computes every managed-skill and projection action without consumer writes.
- `src/sync.ts` already executes that plan with never-clobber and safe-removal
  behavior. Initialization should reuse it rather than inventing a second
  installation path.
- `src/cli.ts` uses strict `parseArgs` for `status`, while legacy `sync`
  parsing still accepts any argv containing `--force` or `-f`. `init` needs a
  strict public command grammar without broadening this slice into a sync parser
  migration.
- The CLI I/O seam exposes cwd, stdout, and stderr but no prompt or TTY input
  boundary. Interactive selection therefore requires an explicit, testable
  input capability rather than reading global stdin throughout command logic.

## Refined Problem Statement

`skillfoo init` should turn a repository with no skillfoo configuration into a
configured, safely reconciled consumer using a validated registry and an
intentional desired-skill selection. It must work predictably for both a human
terminal and automation, refuse to replace existing configuration, and reuse
ordinary reconciliation so first-project safety is identical to every later
sync.

## Domain Language

- **Project initialization**: Establishing a repository's first
  `.skillfoo.yml` and managed reconciliation baseline from a chosen registry.
- **Desired-skill selection**: The explicit configured set of registry skills,
  or an intentional all-skills policy, used by ordinary reconciliation.
- **First reconciliation**: The ordinary non-force reconciliation run
  immediately after configuration is established.

Existing terms such as **Desired skill**, **Managed skill**, **Bespoke skill**,
**Pending change**, **Conflict**, and **Converged** retain their meanings from
[`CONTEXT.md`](../../CONTEXT.md).

## Required Behavior Established by Existing Product Decisions

1. Initialization is a local, accountless CLI capability. Hosted identity and
   entitlement decisions do not enter this slice.
2. The workflow accepts local and Git-backed registries already supported by
   ordinary registry resolution.
3. A new `.skillfoo.yml` records the registry and intentional desired-skill
   policy using the existing schema.
4. Initialization runs the first ordinary safe reconciliation; it never uses
   force semantics or a separate installer.
5. Existing `.skillfoo.yml` content is never overwritten. An already
   initialized project should be directed to `status` or `sync`.
6. Registry access and desired skill names are validated before skill or
   projection writes begin.
7. First reconciliation preserves bespoke content and reports conflicts using
   the same planner and executor behavior as later syncs.
8. Repeated invocation must not silently change an existing configuration or
   desired selection.
9. `emit` must be a relative path contained within the consumer repository.
   Existing path ancestors must be real directories rather than links or other
   entries that could redirect writes outside the consumer.

## Constraints

- Command names, options, output streams, configuration bytes, and exit status
  are public CLI behavior.
- Interactive input is allowed only on a TTY and must have an explicit
  non-interactive equivalent.
- Do not add a prompt framework unless native Node input proves insufficient.
- Validate untrusted argv, registry contents, and selected names before
  mutation.
- Reject absolute, escaping, or redirected emit roots at the shared config and
  project-inspection boundary before registry or consumer mutation.
- Create `.skillfoo.yml` without an overwrite race; a preflight existence check
  alone is insufficient protection.
- The configured project may remain non-converged when ordinary reconciliation
  encounters a conflict. Never destroy local content to make initialization
  appear successful.
- Preserve existing `sync` and `status` contracts outside the init command.
- Verification must exercise the compiled and packed executable, not only an
  imported service.

## Non-goals

- Explicit conflict resolution, promotion to the registry, or intentional
  local override state.
- Automatic git commits, pushes, pull requests, or cross-repository fan-out.
- Hosted GitHub OAuth/App onboarding, billing, or entitlement checks.
- Creating or seeding the registry itself.
- Org/team/repo inheritance or multiple registries.
- Editing an existing `.skillfoo.yml` or providing add/remove selection
  commands.
- Migrating legacy `sync` argument parsing.

## Implementation Seams to Verify During Planning

- Extract registry skill enumeration from `src/plan.ts` so initialization can
  present and validate the same available set the planner uses.
- Add shared emit validation plus a config renderer/writer beside `loadConfig`
  in `src/config.ts`; keep file creation atomic and fail closed when the path
  already exists.
- Add a narrow initialization service that resolves the registry, chooses a
  desired policy, writes config, then delegates to ordinary `sync`.
- Parse and validate init argv in `src/cli.ts` with Node `parseArgs`.
- Extend CLI I/O only with the input/TTY capability required by the chosen
  selection UX, keeping it injectable for tests.
- Add process tests for non-interactive execution, output streams, exit status,
  partial outcomes, reruns, and paths containing spaces/non-ASCII characters.

## Resolved Grill Questions

- **Selection UX:** With no selection flags in a TTY, show the sorted available
  skills and prompt for a comma-separated selection or `all`. In automation,
  require explicit skill flags or an all-skills flag. If no TTY and no selection
  flag are available, exit without writing configuration or consumer content.
- **Command grammar:** Use
  `skillfoo init <registry> [--skill <name> ... | --all] [--emit <path>]`.
  The registry is the only positional, `--skill` is repeatable, `--skill` and
  `--all` are mutually exclusive, and `--emit` defaults to `.agents/skills`.
  Init always attempts first reconciliation. This slice adds neither
  `--no-sync` nor JSON output, and it rejects unknown flags or extra positionals
  before writing.
- **Partial outcome:** Once a valid `.skillfoo.yml` is created, retain it even
  if first reconciliation preserves conflicts or fails operationally. Apply all
  safe actions and preserve conflict content. Exit `3` when initialization
  completes with attention required, `1` on an operational failure, and `0`
  only when the project finishes converged. Output must distinguish “config was
  created” from “reconciliation converged” and direct recovery through status
  or sync.
- **All-skills policy:** `--all` and interactive `all` omit the `skills` key.
  This intentionally desires every valid registry skill now and on future
  reconciliation. A named selection writes an explicit list and does not absorb
  later registry additions.
- **Emit containment:** Both init and manually authored config reject absolute
  or escaping emit paths. Existing ancestors between the consumer root and emit
  root must be real directories rather than links or non-directories. Validation
  fails before registry or consumer mutation.
