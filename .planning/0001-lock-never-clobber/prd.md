# PRD — `.skillfoo.lock` + never-clobber (slice 0001)

Grounded in `discovery.md`, `decisions.md`, and the approved `uat.md` (the
observable acceptance contract — read it alongside this). One PR.

## Goal

Make `skillfoo sync` non-destructive and idempotent by introducing a
`.skillfoo.lock` and a per-skill classification that never clobbers a developer's
local edits or bespoke skills.

## Scope

**In:** the lockfile; whole-dir content hashing; the sync classification
(added / updated / unchanged / drifted / blocked); `--force`; report + summary;
driving the emit adapters from the managed set; gitignore the lock in this repo;
README note that real repos commit it.

**Out (non-goals):** `skillfoo status`, reconcile/override UX, prune (no *whole
skill dir* is ever deleted — though a faithful update may remove a file *inside* a
managed skill it's writing; see D4), `.orig` sidecars, `--check`/non-zero-on-drift,
adopt-on-identical. See `follow-ups.md`.

## Design

### New module: `src/skilldir.js` (shared walk + hash)

Factor the "what files make up a skill" rule out of `src/sync.js` so hashing and
mirroring use one definition and cannot diverge.

- Export `SKIP` (`{'.git', '.DS_Store'}`) and `walkFiles(dir, base = dir)` — moved
  verbatim from `sync.js`.
- Export `hashSkillDir(dir) -> "sha256:<hex>"`:
  1. `files = walkFiles(dir)`; normalize each relative path to `/` separators
     (`rel.split(sep).join('/')`) — **required** so the committed lock's hashes are
     identical across OSes.
  2. Sort the normalized paths.
  3. For each, `fileHash = sha256(readFileSync(join(dir, rel)))` (raw bytes).
  4. `digest = sha256(paths.map(p => `${p}\n${fileHash(p)}`).join('\n'))`.
  5. Return `sha256:${digest}`.
  - Use `node:crypto` `createHash('sha256')` — core module, no new dependency.

### New module: `src/lockfile.js` (read/write `.skillfoo.lock`)

- `LOCK_NAME = '.skillfoo.lock'`, path = `join(cwd, LOCK_NAME)`.
- `readLock(cwd) -> { lockfileVersion, skills }`. Missing file →
  `{ lockfileVersion: 1, skills: {} }`. Parse with `JSON.parse`; default a missing
  `skills` to `{}`. **Fail closed — never silently empty:**
  - Malformed JSON → throw a clear error (`.skillfoo.lock is corrupt: <msg>`). Do
    **not** treat as empty: an empty lock would turn every managed skill into a
    `blocked` collision and drop all drift protection.
  - `lockfileVersion` greater than the known version (`1`) → throw
    (`.skillfoo.lock was written by a newer skillfoo; upgrade`). Equal or less →
    proceed.
- `writeLock(cwd, lock)` — **deterministic** serialization:
  - Rebuild `skills` with keys inserted in **sorted** order (V8 preserves string-key
    insertion order), each entry as `{ source, hash }`.
  - `JSON.stringify({ lockfileVersion: 1, skills }, null, 2) + '\n'`.
  - No timestamps or other nondeterministic fields — an unchanged sync must yield a
    byte-identical file (UAT Scenario 2).
  - Skill names are directory names (non-numeric in practice), so sorted insertion is
    alphabetical; determinism holds regardless of order. (A pure-integer name would
    be iterated numerically-first by V8 — harmless for determinism, only cosmetic for
    diffs.)

Lock shape:

```json
{
  "lockfileVersion": 1,
  "skills": {
    "grill": { "source": "github.com/rawgroundbeef/skills", "hash": "sha256:…" }
  }
}
```

### Rework `src/sync.js`

Replace the per-file status decision in `syncSkillDir` with a **skill-level**
classification via three hashes, then mirror only when the action writes.

- `mirrorSkillDir(srcDir, destDir)` makes `destDir` **exactly equal** `srcDir`: the
  existing byte-compare writer (writes only changed files, avoids mtime churn)
  **plus removal of any file in `destDir` not present in `srcDir`** (diff
  `walkFiles(src)` against `walkFiles(dest)`). This scoped removal is required for
  idempotency after an upstream file deletion/rename — see decisions.md D4 "Faithful
  mirror (not prune)". It only ever runs on a skill skillfoo is writing this run
  (added / updated / forced), never on bespoke / blocked / drifted-skipped /
  unchanged skills, and never removes a whole skill dir.
- `destExists` means a real skill dir is present: `existsSync(destDir) &&
  walkFiles(destDir).length > 0`. An existing-but-empty dir counts as **absent**, so
  it is restored (`+ added`) rather than reported `drifted` — removing the
  deleted-folder vs emptied-folder asymmetry.
- `fileCount` for the `(N files)` display = `walkFiles(srcDir).length` (the registry
  file count; we already walk `src` for `R`), shown when `> 1` as today — for **every**
  row, including non-writing ones.
- Import `walkFiles`/`hashSkillDir` from `skilldir.js`; import `readLock`/`writeLock`.
- Signature: `sync(cwd, { force = false } = {})`.

Per `name` in `wanted` (= `cfg.skills ?? available`), with `R = hashSkillDir(src)`,
`L = lock.skills[name]?.hash`, `destExists`, `D = destExists ? hashSkillDir(dest) : null`:

| Lock `L`? | `destExists` | Condition          | Action → lock entry written                         |
| --------- | ------------ | ------------------ | --------------------------------------------------- |
| no        | no           | —                  | **added** — mirror; `{source, hash: R}`; managed    |
| no        | yes          | —                  | **blocked** — no write; **no** lock entry; not managed (even with `--force`) |
| yes       | no           | —                  | **added** (restored) — mirror; `{source, hash: R}`; managed |
| yes       | yes          | `D === L && R === L` | **unchanged** — no write; `{source, hash: L}`; managed |
| yes       | yes          | `D === L && R !== L` | **updated** — mirror; `{source, hash: R}`; managed |
| yes       | yes          | `D !== L && D === R` | **unchanged** (converge) — no write; `{source, hash: R}` (heal); managed |
| yes       | yes          | `D !== L && D !== R && force`  | **updated** — mirror; `{source, hash: R}`; managed |
| yes       | yes          | `D !== L && D !== R && !force` | **drifted** — no write; `{source, hash: L}` (keep old); managed |

- "managed" = the entry goes into the new lock and the name joins the set that
  drives the emit adapters. `blocked` is the only non-managed outcome.
- `source` = `cfg.registry`.
- `newLock.skills` is built **fresh** from this run's managed results only — do not
  mutate or carry over the object returned by `readLock`. A skill in the old lock but
  not in `wanted` this run therefore drops out (decisions.md D4); its files are left
  untouched.
- After the loop: `writeLock(cwd, newLock)` always (even if only `unchanged`/
  `blocked`), so the file materializes and stays canonical.

### Report + summary

Markers: `+` added · `~` updated · `=` unchanged · `!` drifted · `⊘` blocked.

- Per skill: `  <mark> <name>[ (N files)]` plus a short note for the non-obvious
  states:
  - drifted: `! <name>  (drifted — local edits kept; run with --force to overwrite)`
  - blocked: `⊘ <name>  (an untracked directory is here; remove it to let skillfoo manage this skill)`
  - forced overwrite of a drift: `~ <name>  (overwrote local edits)`
- Summary: keep `N added · N updated · N unchanged`; append `· N drifted` and/or
  `· N blocked` when those counts are > 0.
- The trailing `synced N skill(s)` line counts **managed** skills
  (`managed.length`), not raw `wanted`; blocked skills are reported only in the
  tally, not as "synced".
- Note: the converge row shows `=` yet rewrites the lock (heals `L`→`R`). This is
  not a Scenario-2 path (that path is all-clean, no heal), so byte-determinism holds.
- **Exit code stays 0** for drifted/blocked (safe states). Only genuine errors
  (missing config/registry, git failure, corrupt/newer lock) exit 1 — unchanged from
  today via `cli.js`'s try/catch.

### Drive the emit adapters from the managed set

In `sync.js`, call `updateAgentsMd(cwd, cfg.emit, managed)` and
`linkClaudeAdapter(cwd, cfg.emit, managed)` with the **managed** names (skills now
in the lock), not raw `wanted`. This keeps `blocked` bespoke-collisions out of the
AGENTS.md block and out of `.claude/skills` symlinks. Drifted skills **are**
managed, so they remain listed/symlinked (Claude reads the local edited copy —
correct). `src/emit.js` itself is unchanged (it already takes a name list). Guard
the emit calls on `managed.length > 0` (replacing today's `if (n)` where
`n = wanted.length`), so an all-blocked run doesn't rewrite AGENTS.md to empty.

### CLI: parse `--force`

In `src/cli.js`, the `sync` case reads `const force = argv.includes('--force') ||
argv.includes('-f')` and calls `await sync(process.cwd(), { force })`. Add `--force`
to the `sync` line in `HELP`.

### `.gitignore` + README

- Add `.skillfoo.lock` to this repo's `.gitignore` (alongside `.agents/`,
  `.claude/`, `AGENTS.md` — regenerated dogfood state).
- README: a short line that real consumer repos should **commit** `.skillfoo.lock`
  (the shared never-clobber baseline; survives a fresh clone).

## Files touched

- `src/skilldir.js` — **new** (SKIP, walkFiles, hashSkillDir).
- `src/lockfile.js` — **new** (readLock, writeLock, LOCK_NAME).
- `src/sync.js` — classification, mirror helper, lock read/write, emit from managed set.
- `src/cli.js` — `--force` parse + HELP.
- `.gitignore` — add `.skillfoo.lock`.
- `README.md` — one line on committing the lock in real repos.

## Verification (maps to `uat.md`)

No test runner; drive the CLI against `github.com/rawgroundbeef/skills` (grill /
prd / slice). Walk the UAT scenarios in order:

1. Fresh sync → all `+ added`; `.skillfoo.lock` written with a `sha256:` hash per
   skill (Scenario 1).
2. Re-sync → all `=`; byte-compare the lock before/after (`cp` then `diff`, **not**
   `git diff` — the lock is gitignored here) shows it unchanged (Scenario 2).
3. Edit `.agents/skills/prd/SKILL.md` → sync → `! drifted`, edit intact, lock hash
   for `prd` unchanged, exit 0 (Scenario 3).
4. `sync --force` → `~ updated`, edit gone, lock hash re-matches; plain sync then
   `=` (Scenario 4).
5. Add a bespoke `.agents/skills/my-thing/` → sync → not mentioned, untouched, no
   lock entry (Scenario 5).
6. Put your own `grill/` where none is locked → sync → `⊘ blocked`, unchanged;
   `--force` still `⊘ blocked`; delete it → sync → `+ added` (Scenario 6).
7. Change a skill upstream → sync → `~ updated` (Scenario 7).
8. Delete a synced dir → sync → `+ added` (restored) (Scenario 8).

Confirm throughout: **no whole skill dir is ever deleted** and no bespoke/drifted
skill is ever modified (a faithful update removing a registry-dropped file *inside*
a managed skill is expected — Scenario 7), and no `.orig` appears.

## Constraints

- Node ESM. One runtime dependency (`yaml`); `crypto` is a core module and does not
  change that.
- Keep the command surface small: only `sync` gains a `--force` flag.
- Sync writes plain files; every change stays a reviewable diff. The lock is the
  only new piece of tool-written state, and it too is a plain committed file.
