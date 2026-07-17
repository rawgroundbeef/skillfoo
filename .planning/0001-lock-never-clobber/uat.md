# UAT — `.skillfoo.lock` + never-clobber (slice 0001)

Outside-in acceptance for the CLI. "User-visible" = terminal output + files on
disk. Run from a consumer repo with a valid `.skillfoo.yml`
(`registry: github.com/rawgroundbeef/skills`, skills `grill` / `prd` / `slice`).
Command under test: `node bin/skillfoo.js sync` (and `… sync --force`).

Legend for the per-skill markers in sync output:
`+` added · `~` updated · `=` unchanged · `!` drifted (skipped) · `⊘` blocked.

---

## Scenario 1 — First sync writes the lock

**Do:** In a repo that has never synced, run `skillfoo sync`.

**See:**
- Each skill reported `+ added`.
- A summary line including the counts, e.g. `3 added · 0 updated · 0 unchanged`.
- A new `.skillfoo.lock` file exists with a `skills` entry per synced skill, each
  carrying a `source` and a `sha256:…` `hash`, plus `lockfileVersion: 1`.
- The skills are present in the emit dir (`.agents/skills/<name>/`), AGENTS.md's
  skillfoo block lists them, and `.claude/skills/<name>` symlinks exist — same as
  today.

## Scenario 2 — Re-sync is idempotent and quiet

**Do:** Immediately run `skillfoo sync` again (nothing changed anywhere).

**See:**
- Every skill reported `= unchanged`.
- `.skillfoo.lock` is **byte-for-byte identical** to after Scenario 1 (no
  timestamps, stable key order). Verify by copying the lock before the second sync
  and byte-comparing after — e.g. `cp .skillfoo.lock /tmp/lock.before && node
  bin/skillfoo.js sync && diff /tmp/lock.before .skillfoo.lock` shows nothing.
  **Not** `git diff`: this repo gitignores the lock, so `git diff` is always empty
  and would falsely "pass".

## Scenario 3 — A locally edited managed skill is protected (drifted)

**Do:** Edit a synced skill in the emit dir (e.g. append a line to
`.agents/skills/prd/SKILL.md`). Run `skillfoo sync`.

**See:**
- `prd` reported `! drifted` with a message that its local edits were kept and
  that `--force` would overwrite (e.g.
  `! prd  (drifted — local edits kept; run with --force to overwrite)`).
- The other skills report normally (`=`/`~`).
- The summary counts the drift, e.g. `… · 1 drifted (skipped)`.
- The edit is **still there** — the file was not reverted or overwritten.
- `.skillfoo.lock`'s hash for `prd` is **unchanged** (still what skillfoo last
  wrote), so the drift keeps re-reporting on further syncs until resolved.
- Exit code is `0` (drift is a safe, expected state, not an error).

## Scenario 4 — `--force` re-asserts the registry version

**Do:** With `prd` still drifted from Scenario 3, run `skillfoo sync --force`.

**See:**
- `prd` reported `~ updated` (overwritten from the registry; the local edit is
  gone).
- `.skillfoo.lock`'s `prd` hash now matches the registry content again.
- A subsequent plain `skillfoo sync` reports `prd` as `= unchanged` (drift
  resolved).

## Scenario 5 — A bespoke skill is invisible and untouched

**Do:** Create a directory `.agents/skills/my-thing/SKILL.md` with your own content
(a name that is **not** in the registry and **not** in the lock). Run
`skillfoo sync`.

**See:**
- `my-thing` is **not mentioned** in the sync output at all.
- Its files are unchanged.
- It gets **no** `.skillfoo.lock` entry, **no** AGENTS.md skillfoo-block line, and
  its presence does not affect the managed skills.

## Scenario 6 — First-sync name collision is blocked, not clobbered

**Do:** Create `.agents/skills/grill/SKILL.md` with your **own** content, then
ensure `grill` is not yet in the lock (fresh state / remove its lock entry). With
`grill` wanted by the config, run `skillfoo sync`.

**See:**
- `grill` reported `⊘ blocked` with a message that an existing untracked directory
  is in the way and must be removed for skillfoo to manage that name.
- Your `grill/SKILL.md` content is **unchanged** (not clobbered).
- `grill` gets **no** lock entry.
- Running `skillfoo sync --force` **still** reports `grill` as `⊘ blocked` — force
  never overwrites a skill skillfoo doesn't manage.
- After you delete `.agents/skills/grill/`, a normal `skillfoo sync` reports it
  `+ added` and records it in the lock.

## Scenario 7 — A clean managed skill updates when the registry moves

**Do:** With all skills synced and clean, change a skill upstream in the registry
(new commit), then run `skillfoo sync`.

**See:**
- The changed skill reported `~ updated`; unchanged ones report `=`.
- `.skillfoo.lock`'s hash for the updated skill now matches the new registry
  content.

**Then (file removal — the idempotency trap):** upstream, *delete* a file from that
skill (not just edit one), and sync again.

**See:**
- The skill reported `~ updated`; the deleted file is **gone from the emit dir too**
  (skillfoo mirrors the registry faithfully within the skill dir).
- A subsequent plain `skillfoo sync` reports it `= unchanged` — **not** a sticky
  `drifted`. (If it shows `drifted` here, the mirror failed to remove the dropped
  file — the exact bug this case exists to catch.)

## Scenario 8 — Restoring a deleted managed skill

**Do:** Delete a synced skill's directory from the emit dir (leaving its lock entry
in place). Run `skillfoo sync`.

**See:**
- The skill is re-created and reported `+ added` (restored from the registry).
- No error; other skills unaffected.

---

## Durable side effects that must exist

- `.skillfoo.lock` (JSON) accurately records every managed skill's `source` and
  whole-dir content `hash`, deterministically serialized.
- Managed-clean skills track the registry; managed-edited skills are preserved.
- AGENTS.md skillfoo block and `.claude/skills` symlinks reflect the **managed**
  set only (drifted skills included; blocked/bespoke excluded).

## Side effects that must NOT happen

- No local edit to a managed skill is ever lost without `--force`.
- No bespoke skill (no lock entry) is ever written, renamed, or removed.
- No **whole skill dir** is ever deleted (prune is out of scope) — a skill removed
  from the registry/config keeps its files, untouched. (Faithful mirroring may
  remove an individual file *inside* a managed skill that skillfoo is updating, when
  the registry dropped it — that is a correct update, not prune; see Scenario 7.)
- No `.orig` sidecars are written.

## Guardrails / non-goals / gotchas

- Non-goals: no `skillfoo status` command, no reconcile/3-way chooser, no prune,
  no CI `--check`/non-zero-on-drift. Drift and blocked exit `0`.
- Gotcha: the hash must use the *same* file walk as the mirror (skip `.git`,
  `.DS_Store`), or a just-synced skill would falsely read as drifted.
- Gotcha (this repo): `.skillfoo.lock` is gitignored here (regenerated dogfood
  state); in real consumer repos it should be committed.

## Single pass criterion (demo-ready)

Sync once (skills added + lock written) → edit a managed skill → sync again and
watch it report **drifted and keep your edit** → `sync --force` and watch it
**take the registry version back** → confirm a bespoke skill was **never touched**
and no whole skill was **deleted** throughout. Re-sync with no changes leaves
`.skillfoo.lock` **byte-identical**.
