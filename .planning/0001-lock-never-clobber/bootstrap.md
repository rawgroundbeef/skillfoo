# Bootstrap — implement slice 0001: `.skillfoo.lock` + never-clobber

Cold-start prompt for a fresh context. Execute from these documents and the code,
not from any remembered conversation.

## What you're building

Make `skillfoo sync` non-destructive and idempotent. Today `src/sync.js` mirrors
every wanted registry skill over the emit dir unconditionally — it clobbers local
edits and can't tell a developer's own skills apart from synced ones. Add a
`.skillfoo.lock` (records what skillfoo wrote + a content hash per skill) and a
per-skill classification that never overwrites a local edit or a bespoke skill.

Working dir: `/Users/rawgroundbeef/Projects/skillfoo` (the PUBLIC CLI repo). Branch
`0001-lock-never-clobber` is already created off `main`.

## Read in this order

1. `.planning/0001-lock-never-clobber/prd.md` — the implementation contract:
   modules, function signatures, the classification table, lock shape, report
   format. Build to this.
2. `.planning/0001-lock-never-clobber/uat.md` — the approved acceptance contract
   (8 scenarios). This is how you verify; do not regress any scenario.
3. `.planning/0001-lock-never-clobber/decisions.md` — the five decisions + why, so
   you don't relitigate them.
4. `.planning/0001-lock-never-clobber/discovery.md` — problem framing, the full
   classification table with conditions, and the exact hashing spec.
5. `.planning/0001-lock-never-clobber/follow-ups.md` — what is deliberately NOT in
   this slice; add to it, don't build it.
6. Current code: `src/sync.js`, `src/config.js`, `src/registry.js`, `src/emit.js`,
   `src/cli.js`, `bin/skillfoo.js`.

## Must not violate

- **Never clobber.** A managed skill edited locally (`localHash != lockHash` and
  `!= registryHash`) is reported `drifted` and left untouched unless `--force`.
- **Bespoke = not in the lock.** Anything in the emit dir without a lock entry is
  never written or removed. No marker files.
- **`--force` overrides managed drift only** — it must **not** overwrite a
  `blocked` untracked-collision dir (a skill skillfoo doesn't own).
- **No whole skill dir is ever deleted** this slice (prune is deferred), and no
  bespoke or drifted skill is ever modified. BUT a write (added / updated / forced)
  mirrors the registry **faithfully** — it removes files *inside* the managed skill
  dir that the registry dropped, so re-sync stays idempotent after an upstream file
  deletion/rename (see prd.md mirror spec + decisions.md D4 + UAT Scenario 7). No
  `.orig` sidecars.
- **Deterministic lock:** sorted keys, no timestamps — an unchanged sync produces a
  byte-identical `.skillfoo.lock` (UAT Scenario 2). This is the easiest thing to
  get wrong; verify it explicitly.
- **Hash = same walk as the mirror**, raw bytes, relative paths normalized to `/`
  for cross-OS stability. If the hash and the mirror disagree about the file set, a
  just-synced skill falsely reads as `drifted`.

## Implementation pointers (verified against the code)

- `src/sync.js` currently holds `SKIP`, `walkFiles(dir, base)`, and
  `syncSkillDir(srcDir, destDir)` (per-file byte-compare that always writes and
  decides added/updated/unchanged). Factor `SKIP` + `walkFiles` into a new
  `src/skilldir.js` and add `hashSkillDir` there; reshape the writer into a
  `mirrorSkillDir` that makes dest exactly equal src — writes changed files **and
  removes files in dest not in src** (the faithful mirror) — and returns `fileCount`.
- `sync(cwd)` becomes `sync(cwd, { force = false } = {})`. `wanted = cfg.skills ??
  available`; `available` comes from `listRegistrySkills(registryDir)`. The missing-
  skills validation and the `updateAgentsMd`/`linkClaudeAdapter` calls at the end
  stay — but pass the **managed** name set (skills that ended up in the lock), not
  raw `wanted`, so `blocked` skills are excluded.
- `src/emit.js` (`updateAgentsMd(cwd, emitRel, names)`, `linkClaudeAdapter(cwd,
  emitRel, names)`) is unchanged — it already takes a name list.
- `src/cli.js` `sync` case: parse `--force`/`-f` from `argv`, pass `{ force }`, and
  add `--force` to `HELP`. The try/catch → `skillfoo: <msg>` + exit 1 stays; drifted
  and blocked are **not** errors (exit 0).
- New `src/lockfile.js`: `readLock(cwd)` (missing → `{lockfileVersion:1,skills:{}}`),
  `writeLock(cwd, lock)` (sorted keys, trailing newline).
- Use `node:crypto` `createHash('sha256')`. No new npm dependency (`yaml` stays the
  only one).

## Verification gates

- `AGENTS.md` in this repo defines no extra gates; there is no test runner.
- Verify by driving the CLI: `node bin/skillfoo.js sync` (and `--force`) against
  `github.com/rawgroundbeef/skills` (skills grill / prd / slice), walking all 8 UAT
  scenarios in `uat.md`. Confirm no whole skill dir is deleted and no bespoke/drifted
  skill is modified (a faithful update removing a registry-dropped file inside a
  managed skill is expected — Scenario 7), and no `.orig` appears.
- Sanity: after a clean sync, run sync again and byte-compare `.skillfoo.lock`
  before/after — it must be identical.
- The `verify` skill can drive this end-to-end; use it before committing.

## Environment gotchas

- Registry is fetched to `~/.skillfoo/registries/<slug>` (`src/registry.js`); first
  sync clones, later syncs fetch + `reset --hard`. Needs network + git.
- The emit dir default is `.agents/skills/` (`cfg.emit`), gitignored here along with
  `.claude/` and `AGENTS.md`. Add `.skillfoo.lock` to `.gitignore` too (this repo
  regenerates all synced state). To exercise Scenario 6, you may need to clear a
  skill's lock entry / start from a clean emit dir.

## Out of scope (add to follow-ups.md, don't build)

`skillfoo status` · reconcile/override 3-way UX · prune (and its orphan-provenance
problem) · `--check`/non-zero exit on drift · adopt-on-identical for blocked. The
`.planning/README.md` public-scope guardrail is already in place — keep new
planning notes strictly technical.

## Final instruction

Implement from `prd.md` and the code, verify against `uat.md`, and update the
planning docs (not conversation memory) if anything is underspecified. Then run the
repo's verification (drive the CLI through the UAT) before handing back.
