# skillfoo

Keep your team's agent skills in one place, synced to every repo.

skillfoo pulls skills from a **skills registry** into any project as committed files an
agent can read. The registry is the default authority for Managed skills; a project can
explicitly keep a repository version authoritative as a local Override.

> The CLI is preparing its first public package. Today it provides local project
> initialization, safe reconciliation, consumer-repository read-only status, and targeted
> resolution of locally edited Managed skills. GitHub-App PR fan-out remains on the roadmap.

## Install

The release candidate is `skillfoo@1.0.0`. After its public release, install that exact
version with:

```sh
npm install --save-exact skillfoo@1.0.0
```

The package is not yet published while release readiness is under review. Do not substitute
a branch, global link, or source checkout for package verification.

## Quickstart

Connect an empty project to a local or Git-backed registry and choose its desired skills:

```sh
skillfoo init github.com/your-org/skills --skill slice --skill pr
```

`init` validates the registry and selection, creates `.skillfoo.yml`, and immediately runs
the first ordinary safe reconciliation. Repeat `--skill` to preserve an explicit desired
order, or use `--all` to desire every current and future registry skill:

```sh
skillfoo init ../skills-registry --all
skillfoo init ../skills-registry --skill slice --emit tools/agent-skills
```

When run in a terminal without `--skill` or `--all`, init lists the available skills and
prompts for exact comma-separated names or `all`. Non-interactive use must always provide
one of those selection flags. Init never replaces an existing `.skillfoo.yml`.

Init exits `0` only when the first reconciliation finishes converged, `3` when it preserves
a conflict that needs attention, and `1` for usage or operational failure. If reconciliation
fails after config creation, the valid config is retained so `status` and `sync` can recover.

## Configuration reference

Projects may also author `.skillfoo.yml` directly:

```yaml
registry: github.com/your-org/skills   # a local path or a git URL
# emit: .agents/skills                 # optional — this is the default
# skills: [slice, pr]                  # optional — omit to sync everything
# overrides:                           # optional live local-authority policy
#   slice: local
```

`emit` must be a non-empty relative path contained by the project. Existing path ancestors
must be real directories, not symlinks, junctions, files, or special entries.

`overrides` must map a selected, already Managed skill name to the exact value `local`. An
Override remains Managed, keeps its prior source baseline in `.skillfoo.lock`, and accepts
later safe repository edits until the policy is explicitly reversed.

Configure only a registry whose instruction authors you trust. Explicit `sync` copies its
skill files without semantically sandboxing or approving their contents, and downstream
agents may follow those instructions. Lockfile hashes identify reconciliation content; they
do not authenticate the registry author. Remote registries should use Git credential helpers,
SSH keys, or other out-of-band authentication rather than credentials embedded in a URL.

## Reconciliation

After initialization, reconcile the configured desired policy at any time:

```sh
skillfoo sync
```

That clones/reads the registry, reconciles registry-authoritative skills into
`.agents/skills/<name>/`, preserves healthy Overrides, updates a managed `## Skills` block in
`AGENTS.md`, and symlinks `.claude/skills/` so Claude Code discovers them. Re-running is
idempotent.

Commit `.agents/skills/`, `AGENTS.md`, `.claude/skills/`, and `.skillfoo.lock` in consumer
repos. Agents use those committed copies without contacting the registry; run `skillfoo sync`
again only when intentionally upgrading. The lockfile lets sync update clean skills while
preserving locally edited, overridden, and bespoke skills. A healthy Override is excluded
from registry content replacement while its managed index row and adapter remain reconciled.
Registry updates or removal do not replace or delete Override content. Deselecting a previously managed skill removes
its unchanged projections; local edits or foreign adapter content block removal and stay
managed so skillfoo does not discard the ownership evidence needed to resolve them safely.

Inspect the same ordinary reconciliation plan without changing the consumer project:

```sh
skillfoo status
skillfoo status --json
```

Status exits `0` when converged, `2` when ordinary sync can safely apply all pending work,
`3` when at least one conflict needs attention, and `1` for usage or operational failures.
Successful JSON output uses schema version 2 and writes only the JSON document to stdout;
registry progress and diagnostics use stderr.

Status never writes the consumer repository. A local-path registry is read without network
or skillfoo cache effects. A Git-backed registry may access the network and create, fetch,
reset, or safely replace skillfoo's external registry cache. See the complete
[`status --json` schema 2 contract](docs/status-json-v2.md) for records, ordering, streams,
exit statuses, and compatibility rules.

### Resolve one local-edit conflict

When status reports a Managed skill as `drifted` because of `local_changes`, choose one
authority for that skill only:

```sh
skillfoo resolve slice --keep-local
skillfoo resolve slice --take-registry
```

`--keep-local` preserves the repository tree, records `overrides: { slice: local }`, retains
the lock baseline, and labels the managed row with local editing guidance. The Override is a
visible, non-conflicting state: later safe local edits stay intentional, and a repository with
only healthy Overrides can be converged. If overridden content becomes missing or unsafe,
skillfoo reports a Conflict and does not restore, traverse, or replace it implicitly.

`--take-registry` is destructive: it permanently discards local edits and local-only files
inside the named skill. It also reverses an Override by clearing policy while installing the
current registry content and advancing the target baseline. The explicit skill name and
exactly one direction are required; the command is non-interactive and accepts no broad-force
or confirmation aliases.

Resolution changes only the named Desired, Managed skill and its dependent policy, baseline,
managed `AGENTS.md` row, and missing safe Claude adapter. Keep-local never changes skill bytes
or the lock entry. Take-registry replaces content and advances the target baseline as needed.
Unrelated safe updates and conflicts remain untouched. A foreign or unsafe target adapter is
preserved as a separate conflict rather than being claimed by the content-resolution choice.

The action is staged and verified first. During mutation, skillfoo keeps a temporary recovery
manifest and exact before-snapshots, uses atomic root-metadata replacement, and restores prior
target-dependent state after a handled failure. A failed rollback reports the exact retained
recovery path; a successful resolution leaves no backup or transaction artifact.

Running the same direction again is retry-safe when the Managed skill is already current or
the healthy Override and its target projections are already satisfied. Safe updates,
lock-only updates, removal candidates, Bespoke collisions, unsafe paths, and other conflict
reasons are refused without consumer writes; inspect those cases with `skillfoo status` and
apply safe work with `skillfoo sync`.

Successful resolution output goes to stdout and reports the remaining repository outcome:

- `0` — the target resolved and the repository is converged.
- `2` — the target resolved, but unrelated safe changes remain; run `skillfoo sync`.
- `3` — the target resolved, but another conflict remains; run `skillfoo status`.
- `1` — invalid syntax, refusal, stale evidence, rollback trouble, or operational failure;
  no successful resolution was committed.

The former repository-wide `skillfoo sync --force` and `skillfoo sync -f` forms are removed.
They fail as invalid usage and are never reinterpreted as ordinary sync.

## How it works

- **Registry** — one git repo of skills, each at `<name>/SKILL.md` (the default Managed authority).
- **Override** — explicit project policy that makes one safe repository skill authoritative.
- **Sync** — reconcile Managed skills into `.agents/skills/` while preserving Overrides.
- **Adapters** — a managed block in `AGENTS.md` (the index) plus `.claude/skills/` symlinks
  (the Claude Code adapter). More agent targets can be added the same way.

## License

MIT
