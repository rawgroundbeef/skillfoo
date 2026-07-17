# skillfoo

Keep your team's agent skills in one place, synced to every repo.

skillfoo pulls skills from a single source-of-truth git repo — your **skills registry** —
into any project, as committed files an agent can read. Define a skill once; every repo
stays in sync instead of drifting apart.

> Early and evolving. Today it's a small `sync` command. On the roadmap: `init`,
> drift/status, never-clobber reconcile, and GitHub-App PR fan-out.

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
preserving locally edited and bespoke skills.

## How it works

- **Registry** — one git repo of skills, each at `<name>/SKILL.md` (the source of truth).
- **Sync** — mirror each skill's whole directory into the consumer's neutral `.agents/skills/`.
- **Adapters** — a managed block in `AGENTS.md` (the index) plus `.claude/skills/` symlinks
  (the Claude Code adapter). More agent targets can be added the same way.

## License

MIT
