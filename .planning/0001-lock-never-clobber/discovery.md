# Discovery — `.skillfoo.lock` + never-clobber (slice 0001)

## Kickoff brief

Today `skillfoo sync` overwrites the consumer's skill directories unconditionally
(`src/sync.js` mirrors each registry skill dir over the emit dir, byte-comparing
per file). This is unsafe the moment a developer hand-edits a synced skill or
keeps their own bespoke skills next to synced ones.

Make sync safe by introducing a lockfile and never-clobber semantics:

- Write a `.skillfoo.lock` recording what skillfoo synced: skill name, source,
  and a content hash of the whole skill directory.
- On re-sync, if a managed skill's current content ≠ its lock hash, it was edited
  locally → do **not** clobber it; report it as `drifted` and skip.
- Skills **not** in the lock (the developer's own bespoke skills) are never
  touched — not written, not pruned.

## Refined problem statement

`skillfoo sync` must become idempotent *and* non-destructive. It needs a durable
record of exactly which skill directories it wrote, and the content it wrote, so
that on every subsequent run it can classify each skill and act safely:

- **Managed + clean** → update from the registry (or leave unchanged).
- **Managed + locally edited** → protect the local edit (`drifted`), never clobber.
- **Bespoke** (skillfoo never wrote it) → invisible; never touched.
- **First-sync name collision** (config wants a skill, but an untracked dir already
  occupies that path) → refuse to clobber; report `blocked`.

The lockfile is the primitive that makes managed-vs-bespoke coexistence, drift
detection, and (later) safe prune possible.

## Resolved terms

- **Registry** — the source-of-truth git repo (or local path) of skills. Resolved
  by `src/registry.js` (`github.com/rawgroundbeef/skills` for this repo).
- **Emit dir** — where skills are written in the consumer. Default `.agents/skills/`
  (`cfg.emit`). One subdirectory per skill.
- **Managed skill** — a skill directory skillfoo wrote and recorded in
  `.skillfoo.lock`. skillfoo owns it.
- **Bespoke skill** — a directory in the emit dir with **no** lock entry. The
  developer's own; skillfoo never writes or removes it. (Definition: *not in the
  lock* — no marker file/flag.)
- **Lock hash** — the content hash skillfoo last wrote for a managed skill,
  recorded in `.skillfoo.lock`.
- **Local hash** — the content hash of the skill dir currently on disk in the
  emit dir.
- **Registry hash** — the content hash of the skill dir in the registry.
- **Drifted** — a managed skill whose *local* hash ≠ its *lock* hash (and ≠ the
  registry hash): the developer edited it after it was synced. Protected.
- **Blocked** — config wants a skill, but an untracked directory already sits at
  its emit path (first-sync name collision). Refused, not clobbered.

## The classification (the core of the slice)

Per skill `name` in the **wanted** set (`cfg.skills`, or all registry skills when
omitted). Let `L` = lock hash (may be absent), `D` = local hash (null if the dir
doesn't exist), `R` = registry hash.

| Lock entry? | Dir on disk? | Condition          | Action                                              |
| ----------- | ------------ | ------------------ | --------------------------------------------------- |
| no          | no           | —                  | **added** — write, record `{source, hash: R}`       |
| no          | yes          | —                  | **blocked** — untracked dir in the way; don't write; not added to lock (even under `--force`) |
| yes         | no           | —                  | **added** (restored) — write, set lock hash = R     |
| yes         | yes          | `D == L`, `R == L` | **unchanged** — no write; lock stays                |
| yes         | yes          | `D == L`, `R != L` | **updated** — write registry, set lock hash = R     |
| yes         | yes          | `D != L`, `D == R` | **unchanged** (converge) — no write; heal lock to R |
| yes         | yes          | `D != L`, `D != R` | **drifted** — skip, keep local; lock stays. `--force` → overwrite, set lock hash = R |

Notes:
- `--force` overrides **managed drifted** skills only. It never touches a
  `blocked` (bespoke-collision) dir — overwriting a skill skillfoo doesn't manage
  would break the core guarantee even under force.
- The "converge" row (D≠L but D==R) heals the lock silently when a developer's
  edit happens to equal the newer registry content, avoiding a false `drifted`.
- Drift is **sticky**: a drifted skill keeps its old lock hash, so it re-reports
  `drifted` on every sync until reconciled or `--force`d. (Reconcile UX is out of
  scope — deferred.)
- When a write happens (added / updated / forced), the mirror makes the dest dir
  **exactly** equal the registry source — including removing files inside that
  skill's dir that the registry dropped — so `hashSkillDir(dest) == R` afterward and
  re-sync is idempotent even after an upstream file deletion/rename. This scoped,
  within-skill removal is not prune (which is about whole skills leaving the
  registry) and never touches a skill not being written this run. See decisions.md D4.

## Content hashing a multi-file skill dir

- sha256 over a **manifest**: for each file, compute `sha256(bytes)`, keyed by its
  path relative to the skill dir; sort by path; hash the joined
  `"<relpath>\n<filehash>"` lines into a final sha256. Stored as `sha256:<hex>`.
- Walk with the **same** rules as the mirror (`walkFiles` + `SKIP = {.git,
  .DS_Store}` in `src/sync.js`) so a freshly-synced dir hashes identically to its
  registry source. This is a hard invariant — the walk used for hashing and the
  walk used for mirroring must be one shared function.
- **Raw bytes**, no line-ending normalization — the mirror is byte-exact, so the
  hash must be too (a CRLF/LF change is real drift because sync would rewrite it).
- File mode / exec bit is **not** hashed (the current mirror uses `writeFileSync`
  and doesn't preserve it — hashing it would report phantom drift).
- Uses Node's built-in `crypto` — a core module, so the "one dependency (`yaml`)"
  constraint is untouched.

## Non-goals (this slice)

- `skillfoo status` command (dedicated drift report) — deferred.
- Reconcile / override UX (3-way chooser: use source / promote up / keep as
  override) — deferred; drift is simply skipped + reported.
- Prune (removing managed skills that left the registry/config) — deferred. Files
  are **never** deleted this slice.
- `.orig` sidecars — rejected (litters the tree, pre-empts reconcile UX).
- Non-zero exit / `--check` mode for CI on drift — deferred; drift and blocked are
  safe states, exit stays 0.
- Adopt-on-identical for the blocked case (auto-managing a pre-existing dir that
  already equals the registry) — deferred; blocked is always reported.

## Open questions

- None blocking. The lock's commit-vs-gitignore treatment in *this* dogfood repo
  is resolved in decisions.md (gitignore here; README says commit in real repos).

## Evidence from code

- `src/sync.js` — `walkFiles(dir)` + `SKIP` define the exact file set to hash;
  `syncSkillDir` currently decides add/update/unchanged per-file and always
  writes. This slice moves the decision to the **skill** level (via the three
  hashes) before writing, and threads the lock through.
- `src/config.js` — `loadConfig` gives `{registry, emit, skills|null}`; `wanted =
  cfg.skills ?? available`.
- `src/emit.js` — `updateAgentsMd` / `linkClaudeAdapter` are currently driven by
  `wanted`; they must be driven by the **managed** set (skills now in the lock) so
  `blocked` bespoke collisions don't get an AGENTS.md entry or a symlink.
- `src/cli.js` — `sync` dispatch needs to parse a `--force` flag.
