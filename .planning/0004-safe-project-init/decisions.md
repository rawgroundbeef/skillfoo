# Decisions: Safe Project Initialization

Date: 2026-07-18

## D1: Initialization Is First-Project Connection

`skillfoo init` owns the M1/M2 local entrypoint: establish configuration and
run the first safe reconciliation. It is not merely a YAML template generator,
and it does not include hosted account connection.

This follows the private product build sequence after the safe-sync foundation.

## D2: Reuse Ordinary Reconciliation

Initialization delegates its managed-skill, lock, AGENTS.md, and adapter work
to ordinary non-force reconciliation. It must not grow a parallel installation
engine or weaken conflict preservation for the first run.

## D3: Existing Configuration Is an Ownership Boundary

If `.skillfoo.yml` already exists, init refuses to replace or edit it and
directs the user to existing commands. The first slice does not add re-init,
merge, or force behavior.

The file must be created with exclusive filesystem semantics so a concurrent
or late-arriving file cannot be overwritten between inspection and write.

## D4: Local Init Remains Accountless

Initialization of a direct local or Git-backed registry uses filesystem state
and existing Git credentials. It does not require skillfoo identity or a paid
entitlement. Hosted actions remain a separate product boundary.

## D5: No ADR Yet

This command composes existing configuration, registry, planning, and sync
boundaries. No hard-to-reverse architecture choice has been made beyond the
existing git-native reconciliation model, so an ADR is not warranted.

## D6: Selection Is Interactive Only When a TTY Is Available

When no selection flags are provided and interactive terminal input is
available, init lists the registry's available skills in deterministic order and
prompts for a comma-separated selection or `all`.

Automation must provide an explicit named selection or all-skills flag. A
non-interactive invocation with neither fails before writing `.skillfoo.yml` or
any managed projection. Init never interprets absent input as permission to
install everything.

This keeps the default human workflow approachable without making scripts
prompt-dependent or surprising.

## D7: Use One Positional Registry and Explicit Selection Flags

The command grammar is:

```text
skillfoo init <registry> [--skill <name> ... | --all] [--emit <path>]
```

- `<registry>` is the single required positional source.
- `--skill <name>` is repeatable and preserves the user's selection order.
- `--all` and `--skill` are mutually exclusive.
- `--emit <path>` defaults to `.agents/skills`.
- Unknown flags, missing option values, and extra positionals fail before any
  write.
- `init --help` inspects no project or registry state.

Init always attempts the first reconciliation after config creation. This slice
does not add `--no-sync`, `--json`, aliases, or alternate registry flags.

## D8: Retain Valid Configuration Across Partial Reconciliation

After init creates a valid `.skillfoo.yml`, it keeps that file even when first
reconciliation encounters a preserved conflict or an operational failure.

- Init executes every safe ordinary-reconciliation action and preserves
  conflict destinations.
- Exit `0` means the initialized project is converged.
- Exit `3` means configuration was created and safe work ran, but at least one
  conflict still requires attention.
- Exit `1` means invocation or reconciliation failed operationally. Output says
  whether config creation already succeeded and directs the user to `status` or
  `sync` for recovery.

There is no init exit `2`: safe pending work is executed as part of init, while
an inability to execute it is an operational failure rather than a successful
changes-available preview.

Rolling back only the config would hide the desired state and cannot reliably
undo managed files or projections already written. Recovery therefore moves
forward from the retained configuration.

## D9: All Skills Is a Dynamic Policy

`--all` and the interactive `all` choice omit `skills` from `.skillfoo.yml`,
preserving the existing schema meaning that every valid registry skill is
desired. Future registry additions therefore appear as pending additions on
status and are installed by ordinary sync.

A named selection writes an explicit `skills` list. That list is stable until
the user edits configuration or a future selection-management command changes
it. Snapshotting current names for `--all` was rejected because it would make
the flag misleading and duplicate the meaning of an explicit list.

## D10: Emit Paths Stay Inside the Consumer Repository

Both `init --emit` and manually authored configuration require a non-empty
relative path whose resolved destination is the consumer root or a descendant.
Absolute paths and relative paths that escape cwd are rejected before registry
access or consumer mutation.

Existing ancestors between cwd and the emit root must be real directories.
Links, junctions, files, and special entries are rejected rather than followed
through to a physical location outside the consumer. Missing safe ancestors may
be created later by ordinary reconciliation.

The same validator belongs at the shared config/project boundary so init,
status, and sync cannot disagree about whether a destination is safe. Supporting
out-of-repository emit roots was rejected because skillfoo's lock, projections,
and ownership language are repository-scoped.

## D11: Render a Minimal Deterministic Config

The generated `.skillfoo.yml` uses stable LF-terminated YAML:

- Always write `registry` using the user's validated source spelling.
- Omit `emit` when it is `.agents/skills`; write it for a non-default path.
- Omit `skills` for the dynamic all-skills policy.
- Write named selections as an explicit list after first-occurrence duplicate
  normalization, preserving the user's order.
- Add no generated comments; command help and the public README own schema
  explanation.

Create the file with exclusive write semantics. A late or concurrent existing
file is an expected init failure and is never truncated.

## D12: UAT Approved

The user approved [`uat.md`](./uat.md) on 2026-07-18 as the outside-in behavior
for this slice. The PRD and bootstrap must preserve that acceptance contract.

## D13: Keep Initialization Behind Five Ownership Boundaries

The user approved this module shape on 2026-07-18:

1. Configuration lifecycle owns emit validation, deterministic rendering, and
   exclusive creation.
2. Registry catalog owns deterministic available-skill discovery shared with
   reconciliation.
3. Initialization service owns preflight, validated selection, config creation,
   delegation to ordinary sync, and the init result.
4. CLI boundary owns strict argv parsing, TTY prompting, help, streams, and exit
   translation.
5. Ordinary reconciliation exposes its completed plan/outcome to init without a
   second planner or duplicate registry refresh.

Tests and public documentation verify these boundaries from the installed
executable outward.

## Open Decisions

- _(none before UAT alignment)_
