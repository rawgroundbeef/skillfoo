# Decisions — `.skillfoo.lock` + never-clobber (slice 0001)

## D1 — Lock format: separate `.skillfoo.lock`, JSON

**Decision.** A separate `.skillfoo.lock` file, serialized as JSON.

Shape:

```json
{
  "lockfileVersion": 1,
  "skills": {
    "grill": { "source": "github.com/rawgroundbeef/skills", "hash": "sha256:9f2b1c…" },
    "prd":   { "source": "github.com/rawgroundbeef/skills", "hash": "sha256:4a8e0d…" }
  }
}
```

- `lockfileVersion` (int) — schema version for forward-compat.
- `skills` — object keyed by skill name; each entry has `source` (the registry
  spec it came from) and `hash` (whole-dir content hash, `sha256:<hex>`).
- Serialized with **sorted keys** and 2-space indent; **no timestamps** or other
  nondeterministic fields, so an unchanged sync produces a byte-identical lock and
  never a spurious diff.

**Why not a section in `.skillfoo.yml`.** `.skillfoo.yml` is hand-authored config;
the lock is tool-written state. Merging them means the tool rewrites the user's
file on every sync (edit-vs-regenerate conflicts). Same reason `package-lock.json`
is separate from `package.json`.

**Why JSON not YAML.** The lock is machine-written and never hand-edited: YAML's
readability edge doesn't apply. JSON gives deterministic output (`JSON.stringify`
+ sorted keys), reads unmistakably as "generated — don't touch," and needs no
dependency (`JSON` is built in; the `yaml` dep stays reserved for config).
*(User confirmed JSON, 2026-07-17.)*

**Rejected:** YAML lock (visual consistency with config didn't outweigh
determinism + don't-edit-me signal); `lock:` section inside `.skillfoo.yml`.

## D2 — "Bespoke" = not in the lock (no marker)

**Decision.** A skill is bespoke iff it has **no entry in `.skillfoo.lock`**. The
lock is the complete record of what skillfoo wrote; everything else in the emit
dir is the developer's and is invisible to skillfoo — never written, never pruned.

**Corollary — first-sync collision.** If the config *wants* a skill but an
untracked directory already occupies its emit path, skillfoo does **not** clobber
it: report `blocked`, don't write, don't add to the lock. The remedy is for the
developer to remove the dir and re-sync. `--force` does **not** override this.

**Rejected:** explicit marker (marker file / frontmatter flag) — adds ceremony and
a "forgot to mark it → clobbered" failure mode.

## D3 — On drift: skip + report `drifted`, `--force` to override

**Decision.** When a managed skill is locally edited (local hash ≠ lock hash, and
≠ registry hash), `skillfoo sync` **skips** it and reports it `drifted`, leaving
the local edit untouched. `skillfoo sync --force` re-asserts the registry version
(overwrites) for managed drifted skills only.

- Non-interactive and non-destructive by default — a local edit is never lost.
- Drift is sticky (keeps re-reporting) until reverted or `--force`d.
- Convergence: if a local edit happens to equal the newer registry content
  (local hash == registry hash), the lock is healed silently — not reported as
  drift.

**Rejected:** `.orig` sidecars (litters the tree, pre-empts the deferred reconcile
UX); skip-with-no-escape-hatch (chosen `--force` as a minimal, well-understood
override).

## D4 — Prune deferred to a follow-up slice

**Decision.** This slice does **not** implement prune — removing a *whole* managed
skill because it left the registry/config (e.g. the lingering `trello` copy). Such
dirs linger untouched; whole-skill deletion is destructive and deserves its own
never-clobber-grade safety design in a later slice.

**Faithful mirror (not prune).** Distinct from prune, and required for idempotency:
when skillfoo *writes* a managed skill (added / updated / forced), it makes the
destination dir **exactly** equal the registry source — including **removing files
inside that skill's own dir** that the registry no longer contains. If the mirror
left orphaned files behind, the updated dir would never equal the registry hash `R`
and the skill would read as sticky `drifted` forever (the classic idempotency trap
when a registry file is deleted or renamed). This scoped, within-skill removal only
ever runs on a skill skillfoo is writing this run — never on a bespoke, blocked,
drifted-skipped, or unchanged skill, and it never removes a whole skill dir.

**Lock rebuild rule this slice:** the new lock contains an entry for each
**wanted** skill that skillfoo currently manages (added / updated / unchanged /
converged / drifted). A skill that is in the old lock but no longer wanted
(deselected, or removed from the registry) has its **entry dropped**; its files
are **left on disk untouched** (no prune). Those files thereby become bespoke
(protected) going forward.

**Known trade-off (noted for the prune slice):** dropping the entry loses the
"skillfoo wrote this" provenance, so the future prune slice can't rely on the lock
alone to distinguish an orphaned-managed dir from a bespoke one — it will need its
own orphan-detection design. Recorded in follow-ups.md.

## D5 — Hashing: sha256 manifest, shared walk, raw bytes, built-in `crypto`

**Decision.** Whole-dir content hash = sha256 over a sorted manifest of
per-file `sha256(bytes)` keyed by relative path (see discovery.md for the exact
construction). Stored `sha256:<hex>`.

- **Same walk as the mirror** (`walkFiles` + `SKIP`), factored into one shared
  function so hashing and mirroring can never diverge.
- **Raw bytes**, no normalization (mirror is byte-exact).
- Mode/exec bit **not** included (mirror doesn't preserve it).
- Node built-in `crypto` — no new dependency.

## Operational — lock committed vs gitignored

**Decision.** In real consumer repos, **commit `.skillfoo.lock`** (like
`package-lock.json`): it's the shared baseline that makes never-clobber work
across machines and survives a fresh clone. The README states this.

In **this** dogfood repo specifically, `.skillfoo.lock` is **gitignored** alongside
the other regenerated artifacts (`.agents/`, `.claude/`, `AGENTS.md`), because this
repo regenerates all synced state from its own registry on every sync. Consistent
rule: *this repo gitignores everything skillfoo generates.*

## No ADRs

None of these meet the grill ADR threshold (hard-to-reverse + surprising +
genuine trade-off) at a level that outlives the slice. The lock format is the
closest, but it's captured here and in the README; revisit if a v2 changes it.
