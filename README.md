# skillfoo

Keep your team's agent skills in one place, synced to every repo.

skillfoo pulls skills from a single source-of-truth git repo — your **skills registry** —
into any project, as committed files an agent can read. Define a skill once; every repo
stays in sync instead of drifting apart.

> Early and evolving. Today it provides reconciliation through `sync` and read-only
> inspection through `status`. On the roadmap: `init` and GitHub-App PR fan-out.

## Install

Not yet on npm. From source:

```sh
git clone https://github.com/rawgroundbeef/skillfoo
cd skillfoo && npm install && npm link   # gives you a global `skillfoo`
```

## Usage

Add a `.skillfoo.yml` to any repo:

```yaml
registry: github.com/your-org/skills   # a local path or a git URL
# emit: .agents/skills                 # optional — this is the default
# skills: [slice, pr]                  # optional — omit to sync everything
```

Then:

```sh
skillfoo sync
```

That clones/reads the registry, writes each skill into `.agents/skills/<name>/`, updates a
managed `## Skills` block in `AGENTS.md`, and symlinks `.claude/skills/` so Claude Code
discovers them. Re-running is idempotent.

Commit `.agents/skills/`, `AGENTS.md`, `.claude/skills/`, and `.skillfoo.lock` in consumer
repos. Agents use those committed copies without contacting the registry; run `skillfoo sync`
again only when intentionally upgrading. The lockfile lets sync update clean skills while
preserving locally edited and bespoke skills. Deselecting a previously managed skill removes
its unchanged projections; local edits or foreign adapter content block removal and stay
managed so skillfoo does not discard the ownership evidence needed to resolve them safely.

Inspect the same ordinary reconciliation plan without changing the consumer project:

```sh
skillfoo status
skillfoo status --json
```

Status exits `0` when converged, `2` when ordinary sync can safely apply all pending work,
`3` when at least one conflict needs attention, and `1` for usage or operational failures.
Successful JSON output uses schema version 1 and writes only the JSON document to stdout;
registry progress and diagnostics use stderr.

## How it works

- **Registry** — one git repo of skills, each at `<name>/SKILL.md` (the source of truth).
- **Sync** — mirror each skill's whole directory into the consumer's neutral `.agents/skills/`.
- **Adapters** — a managed block in `AGENTS.md` (the index) plus `.claude/skills/` symlinks
  (the Claude Code adapter). More agent targets can be added the same way.

## License

MIT
