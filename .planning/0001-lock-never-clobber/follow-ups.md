# Follow-ups — `.skillfoo.lock` + never-clobber (slice 0001)

Real findings deferred out of this slice. Dated; specific enough to pick up cold.

## Bugs Discovered

- _(none yet)_

## Deferred Slice Ideas

- **2026-07-17 · Prune.** Remove managed skills that left the registry/config
  (e.g. a lingering `trello` copy). Deferred because deleting files is destructive
  and needs its own never-clobber-grade safety design. Note: this slice **drops**
  the lock entry for a deselected skill and leaves its files (see decisions.md D4),
  so the prune slice cannot rely on the lock alone to tell an orphaned-managed dir
  from a bespoke one — it will need its own orphan-detection (e.g. carry-forward
  "orphaned" entries, or scan + confirm). Design that in the prune slice.
- **2026-07-17 · `skillfoo status`.** A read-only command that reports the
  synced / clean / drifted / bespoke / blocked state without writing anything.
  This slice puts the classification into `sync`; `status` reuses it dry-run.
- **2026-07-17 · Reconcile / override UX.** The 3-way chooser for a drifted skill
  (use source / promote the edit up to the registry / keep as an intentional local
  override). This slice only skips + reports drift and offers `--force`. An
  "override" state that suppresses the drift report is part of this.
- **2026-07-17 · `--check` / CI mode.** Make `sync --check` exit non-zero when any
  skill is drifted or blocked, for CI gating. This slice keeps exit 0 for those
  safe states.
- **2026-07-17 · Adopt-on-identical for blocked.** When an untracked dir at a
  wanted skill's path is byte-identical to the registry, optionally adopt it into
  the lock instead of reporting `blocked`. This slice always reports `blocked`.

## Product Questions

- **2026-07-17 · Slice-skill vs on-disk structure drift.** The `slice` skill
  (registry-sourced) documents the per-slice file set but not the top-level
  `.planning/README.md` we added for the public repo. Decide whether to teach the
  `slice` skill about a directory-level README (update it in the registry
  `github.com/rawgroundbeef/skills`) or keep the README a repo-local addition.
  Non-blocking; the per-slice folder itself is compliant.

## Cleanup / Refactor Notes

- **2026-07-17 · Shared skill-dir walk.** `walkFiles` + `SKIP` currently live in
  `src/sync.js`. This slice factors them (plus `hashSkillDir`) into a shared module
  so hashing and mirroring can never diverge. Keep that module the single source
  of the "what files make up a skill" rule.
- **2026-07-17 · Dangling Claude symlink on deselect.** `linkClaudeAdapter`
  (`src/emit.js`) only creates/refreshes symlinks for the managed set; it never
  removes them. Deselecting a skill (dropped from `cfg.skills`) removes its AGENTS.md
  line but leaves a `.claude/skills/<name>` symlink pointing at the now-bespoke dir.
  Prune-adjacent — clean up when prune lands (prune, too, must not delete bespoke).

## Environment / Testing Notes

- **2026-07-17 · Cross-OS hash determinism.** The manifest hash must normalize
  relative paths to `/` before hashing (Windows `path.relative` yields `\`), or the
  committed lock's hashes won't match across machines. Called out in the PRD.
- **2026-07-17 · Verification is manual.** No test runner in the repo; verify by
  driving `node bin/skillfoo.js sync` through the UAT scenarios against
  `github.com/rawgroundbeef/skills` (skills grill / prd / slice).
- **2026-07-17 · This repo gitignores `.skillfoo.lock`.** Regenerated dogfood
  state. Real consumer repos should commit it (README states this). Don't be
  surprised the flagship repo doesn't commit its own lock.
