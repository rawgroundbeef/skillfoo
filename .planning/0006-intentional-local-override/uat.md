# UAT: Intentional Local Override

**Status:** Approved by user on 2026-07-18

**Goal:** Prove that a developer can keep one locally edited Managed skill as
a durable, visible Override, continue editing it without recurring Conflict,
and later take the registry safely without changing unrelated repository
state.

## Prerequisites

- Use the completed implementation branch built from this slice; do not run
  these mutation scenarios in the skillfoo repository itself.
- Node.js 22 or 24, npm, Git, and a POSIX shell are available.
- From the skillfoo repository, run `npm ci` and `npm run build`, then record the
  absolute path to `dist/entrypoint.js` as `SKILLFOO_BIN`.
- Set `UAT_ROOT="$(mktemp -d)"`. Create sibling `registry/` and
  `consumer-template/` directories under it. Initialize both as Git
  repositories with local test-only user name/email settings.
- In the registry, create `alpha/SKILL.md` and `beta/SKILL.md`, each with valid
  frontmatter containing its name and a distinct registry description.
- Commit that registry baseline. All registry-update scenarios may alter its
  disposable working tree, but the commit remains the reset point.
- In `consumer-template/`, create this deliberately hand-formatted config so
  comment, unknown-key, and whitespace preservation are observable:

  ```yaml
  # disposable consumer policy
  registry: ../registry # local UAT source
  skills: [alpha, beta]
  future-settings:
    reviewer: "keep this" # unknown future key
  ```

- From `consumer-template/`, run `node "$SKILLFOO_BIN" sync`. Verify it
  succeeds, emits both skills, writes the lock and managed `AGENTS.md` block,
  and creates both Claude adapters. Commit the complete consumer baseline,
  including the lock and symlinks, so clones begin from identical bytes.
- Clone `consumer-template/` to sibling `consumer-happy/`. Run the Happy Path,
  Persistence, Registry Evolution, and Reversal sections sequentially only in
  `consumer-happy/`. In those sections, “the consumer” means that clone.
- Before Guardrails, restore the registry working tree to its committed
  baseline with `git -C "$UAT_ROOT/registry" restore --source=HEAD --staged
  --worktree .`. Every guardrail names its own fresh clone of
  `consumer-template/`; never reuse a dirty guardrail fixture.
- Keep byte snapshots and redirect sentinels as sibling files under
  `UAT_ROOT`, outside the consumer clone being tested.

## Happy Path: Keep One Local Skill

1. Record the exact `alpha` entry from `.skillfoo.lock`.
2. Edit `.agents/skills/alpha/SKILL.md` so its frontmatter description is
   `Alpha guidance customized in this repository.` and its body is visibly
   local. Add `.agents/skills/alpha/local-only.txt`.
3. Remove the correct `.claude/skills/alpha` adapter so target-only repair is
   also observable.
4. Run `node "$SKILLFOO_BIN" status --json` and record its exit status.
5. Run:

   ```sh
   node "$SKILLFOO_BIN" resolve alpha --keep-local
   ```

6. Run human status and JSON status again.

Expected:

- Initial status exits `3` and reports only `alpha` as `drifted` with reason
  `local_changes`; it does not mutate the consumer.
- Keep-local succeeds with exit `0`, names `alpha`, and says the repository
  version remains authoritative.
- Both local files retain their exact bytes. `beta` and every unrelated
  consumer file remain unchanged.
- `.skillfoo.yml` gains:

  ```yaml
  overrides:
    alpha: local
  ```

- The config retains its comments, unknown `future-settings` value, key order,
  and scalar quoting. Harmless flow-sequence whitespace normalization is
  acceptable.
- The recorded `alpha` lock entry remains exactly unchanged.
- The managed `AGENTS.md` introduction says the skills are `managed by
  skillfoo` and no longer gives blanket “edit in the source registry” advice.
  The `alpha` row uses the local description and ends with
  `(local override; edit in this repository)`. The `beta` row and content
  outside the managed markers are byte-for-byte unchanged.
- The missing target adapter is restored to the expected emitted directory;
  the existing `beta` adapter is unchanged.
- JSON is clean stdout with `schemaVersion: 2`, `outcome: "converged"`, an
  `alpha` record containing `state: "override"` and
  `registryState: "unchanged"`, and
  `summary.skills.overrides: 1`. Status exits `0`.

## Persistence: Later Local Edits Stay Intentional

1. Commit the healthy Override state in the disposable consumer.
2. Edit `alpha/SKILL.md` again, including a new local description, and modify
   `local-only.txt`.
3. Run JSON status.
4. Run ordinary sync, then run JSON status again.
5. Commit the repaired projection state and run
   `node "$SKILLFOO_BIN" resolve alpha --keep-local` a second time.

Expected:

- Before sync, `alpha` remains `override`; it never returns to
  `drifted` / `local_changes`. Status may exit `2` solely because the local
  description makes the managed `AGENTS.md` row a safe projection update.
- Ordinary sync preserves every local `alpha` byte, updates its managed row
  from the new local description, and reconciles unrelated safe work normally.
- Sync's headline and tally identify reconciliation and the Override without
  claiming that `alpha` content was copied from the registry.
- After sync, status is Converged, exits `0`, and still counts one Override.
- The repeated keep-local call succeeds and leaves `git status --short` empty:
  no config, content, lock, row, or adapter rewrite occurs.

## Registry Evolution: Changed and Missing Source

1. Record the complete local `alpha` tree and lock entry.
2. Change registry `alpha` to a visibly newer description and body.
3. Run human and JSON status, then ordinary sync.
4. Remove registry `alpha` completely and repeat human status, JSON status,
   and ordinary sync.

Expected:

- With the updated registry, `alpha` remains a healthy Override with
  `registryState: "changed"`; the repository remains Converged and exits `0`
  when no unrelated work exists.
- With registry `alpha` removed, status still succeeds and reports
  `state: "override"`, `registryState: "missing"`, and exit `0`.
- Neither sync replaces nor removes local content, advances the lock baseline,
  removes policy, changes the local row description, or removes the adapter.
- The exact recorded local tree and lock entry survive both registry changes.

## Reversal: Take the Registry

1. Restore registry `alpha` with the newer registry content.
2. Run:

   ```sh
   node "$SKILLFOO_BIN" resolve alpha --take-registry
   ```

3. Inspect config, emitted content, lock, managed row, adapter, and JSON status.
4. Commit the result and repeat the same take-registry command.
5. Manually add valid `overrides: { alpha: local }` policy while content still
   matches the registry, then run status once more.

Expected:

- The first take-registry succeeds with exit `0`, removes the final
  `overrides` block, replaces the complete local tree with the current registry
  tree, advances the target lock baseline, removes the override suffix from
  the target row, and retains the neutral managed-block introduction.
- Unrelated config, `beta`, its row, its lock entry, and its adapter are
  unchanged.
- JSON reports `alpha` as `unchanged`, with
  `summary.skills.overrides: 0`, and the repository is Converged.
- Repeating take-registry is a successful byte-for-byte no-op.
- The manually authored, ownership-consistent matching policy is honored:
  status reports a healthy `alpha` Override with
  `registryState: "unchanged"`. Matching content never clears policy
  implicitly.
- Run take-registry once more to return the disposable consumer to a clean
  source-managed state before the remaining guardrails.
- Restore the registry to its committed baseline. Do not use this
  `consumer-happy/` checkout for any guardrail below.

## Guardrails

### Strict resolver grammar causes no access or writes

1. From an empty disposable directory with no config, run each command:

   ```sh
   node "$SKILLFOO_BIN" resolve alpha
   node "$SKILLFOO_BIN" resolve --keep-local
   node "$SKILLFOO_BIN" resolve alpha beta --keep-local
   node "$SKILLFOO_BIN" resolve alpha --keep-local --keep-local
   node "$SKILLFOO_BIN" resolve alpha --keep-local --take-registry
   node "$SKILLFOO_BIN" resolve alpha --keep-local --unknown
   node "$SKILLFOO_BIN" resolve ../alpha --keep-local
   node "$SKILLFOO_BIN" resolve alpha -- --keep-local
   ```

2. Run `resolve --help` from the same directory.

Expected:

- Every invalid form exits `1`, leaves stdout empty, prints a concise usage or
  safe-name diagnostic to stderr, and creates no files or registry cache work.
- Help exits `0`, documents both exclusive directions and `0`/`1`/`2`/`3`
  meanings, and does not require project state.

### Contradictory or unowned policy fails closed

1. Clone `consumer-template/` to a fresh sibling `guard-policy/` and work only
   there.
2. Save exact config bytes. Configure an override for
   `alpha` while changing explicit `skills:` to `[beta]`, then run status and
   `status --json`.
3. Restore config, save exact lock bytes, remove only the `alpha` lock entry,
   configure `alpha: local`, and run status again.

Expected:

- Each command exits `1`, writes no successful stdout or JSON document, and
  names the contradictory or unowned override with an actionable diagnostic.
- The command changes no config, content, lock, row, or adapter bytes beyond
  the deliberate fixture edits. Restore the saved config and lock afterward.

### Missing overridden content is a Conflict, not an implicit restore

1. Clone `consumer-template/` to a fresh sibling `guard-missing/`. Edit
   `alpha` locally and run `--keep-local` to create a healthy Override.
2. Move the complete emitted `alpha` directory to a backup outside the
   consumer.
3. Run human and JSON status, then ordinary sync.
4. Remove only the `alpha` managed row and its adapter, then run ordinary sync
   again.
5. With registry `alpha` available, run
   `node "$SKILLFOO_BIN" resolve alpha --take-registry`.

Expected:

- Status exits `3` and reports `drifted` with reason
  `override_content_missing`; policy and lock remain intact.
- Ordinary sync does not recreate the missing directory, clear policy, or
  alter the initially existing target row/adapter. After the deliberate row
  and adapter removal, the second sync leaves both absent until safe local
  content returns.
- JSON omits the degraded target's adapter projection record rather than
  reporting the absent adapter as unchanged or safely pending.
- Take-registry explicitly restores the registry directory, clears policy,
  updates the baseline and row, and returns the residual repository outcome.

### Unsafe overridden content is preserved

1. Clone `consumer-template/` to a fresh sibling `guard-unsafe/`. Edit
   `alpha` locally and run `--keep-local` to create a healthy Override.
2. Move its directory outside the consumer and put a regular file at the
   emitted `alpha` path.
3. Save the file bytes, then run status and ordinary sync.
4. Remove only the `alpha` managed row and its adapter, then run ordinary sync
   again.
5. Run
   `node "$SKILLFOO_BIN" resolve alpha --take-registry`, and
   `node "$SKILLFOO_BIN" resolve alpha --keep-local`.

Expected:

- Status exits `3` with `emitted_path_not_managed_directory` and never tries to
  read the file as a skill directory.
- Sync preserves the file, config policy, lock, row, and adapter.
- After the deliberate target row and adapter removal, the second sync does
  not synthesize either projection from registry or unsafe content.
- Both resolver directions refuse with exit `1` and actionable diagnostics;
  neither replaces the unsafe file nor changes any other consumer state.

### Foreign adapter remains a separate Conflict

1. Clone `consumer-template/` to a fresh sibling `guard-adapter/`. Edit
   `alpha` locally, remove its Claude adapter, and place a foreign regular file
   at that adapter path.
2. Run `node "$SKILLFOO_BIN" resolve alpha --keep-local`.

Expected:

- Keep-local successfully records the Override and preserves local skill
  content, but returns residual exit `3` because the adapter Conflict remains.
- The foreign adapter bytes are unchanged. Status reports `alpha` as an
  Override and its adapter as blocked; the skill-content choice does not claim
  adapter ownership.

### Handled write failure restores prior state

1. Clone `consumer-template/` to a fresh sibling `guard-rollback/`.
2. On POSIX, prepare a source-managed local-change Conflict, save exact config,
   lock, skill, `AGENTS.md`, and adapter state, and record the config and
   `AGENTS.md` modes with:

   ```sh
   node -e "const fs=require('node:fs'); for (const p of ['.skillfoo.yml','AGENTS.md']) console.log(p, (fs.statSync(p).mode & 0o777).toString(8))"
   ```

3. Make `AGENTS.md` read-only.
4. Run keep-local and restore the file permissions afterward.

Expected:

- The command exits `1`, reports failure and successful restoration, and does
  not claim that the Override was kept.
- Config and `AGENTS.md` are restored to their exact prior bytes and recorded
  modes. Content, lock, and adapter shape match the saved state, and no
  transaction artifact remains.
- If the environment does not enforce the permission failure, record this
  scenario as not exercised and rely on deterministic injected-failure tests;
  do not report it as passed.

### Redirected config is never mutated

1. Clone `consumer-template/` to a fresh sibling `guard-config-redirect/` and
   create a local-change Conflict.
2. Move `.skillfoo.yml` to a sentinel under `UAT_ROOT` and replace it with a
   symlink to that external file.
3. Save the external file bytes and run keep-local.

Expected:

- The resolver exits `1` with an unsafe-config diagnostic before mutation.
- The config symlink, external config bytes, local skill, lock, managed row,
  and adapters remain unchanged; no sibling temporary file remains.

### Metadata redirects fail before either resolver direction mutates

1. On a platform that supports symlinks, test the Cartesian product of
   `.skillfoo.yml`, `.skillfoo.lock`, and `AGENTS.md` with `--keep-local` and
   `--take-registry`. For each of the six cases, clone
   `consumer-template/` to a uniquely named fresh sibling and create a local
   `alpha` Conflict.
2. Move only the metadata file under test to a unique external sentinel under
   `UAT_ROOT`, replace the consumer entry with a symlink to that sentinel, and
   save a complete consumer tree snapshot.
3. Run the selected resolver direction and compare the sentinel and consumer
   tree to the snapshot.

Expected:

- Every case exits `1` before mutation and names the unsafe metadata path.
- The symlink identity, external sentinel bytes, local skill, config, lock,
  row, and adapters are unchanged, apart from the deliberate fixture setup.
- No sibling staging file or resolver recovery directory remains.

### Metadata hardlinks cannot redirect resolver writes

1. On POSIX, use fresh clones to exercise each metadata write: config under
   keep-local, config under Override reversal, `AGENTS.md` under both
   directions, and lock under take-registry. Set up the local Conflict or
   healthy Override required for the chosen direction.
2. Before resolving, create an external hardlink sentinel for the metadata
   file under test. Record its bytes, mode, and inode.
3. Run the eligible resolver action and inspect both paths.

Expected:

- The eligible command succeeds with its residual `0`/`2`/`3` outcome.
- The external hardlink retains its exact original bytes, mode, and inode.
- When the consumer metadata bytes changed, its path now names the atomically
  installed replacement inode with the expected new bytes and preserved mode.
- Keep-local never rewrites the lock. Automated tests cover the complete
  changed/no-change hardlink matrix on supported platforms.

### Config mode survives successful policy changes

1. Clone `consumer-template/` to a fresh sibling `guard-config-mode-keep/`.
   On POSIX run `chmod 640 .skillfoo.yml`, edit `alpha` locally, record the
   mode with Node as above, run keep-local, and record it again.
2. Clone a second fresh sibling `guard-config-mode-take/`, create a healthy
   Override, run `chmod 600 .skillfoo.yml`, record the mode, run
   take-registry, and record it again.

Expected:

- Both commands retain the configured mode exactly while changing the policy
  document.
- Automated injected-failure tests prove exact mode restoration on rollback
  even when the manual permission scenario cannot induce a failure.

## Durable Side Effects

- Keep-local adds one explicit config policy and may update only the generated
  managed-block introduction, target row, and missing safe target adapter.
- It never changes the target skill bytes or lock baseline.
- Healthy Override policy persists across process restarts, later local edits,
  registry updates, registry removal, status calls, and ordinary sync.
- Take-registry removes the policy together with its authorized target
  content, lock, and projection changes.
- Status never mutates the consumer. A Git-backed registry may still refresh
  only skillfoo's private cache; this local-registry UAT does not exercise that
  network behavior.

## Known Non-Goals

- Promote local content to the registry.
- Replace Bespoke content, unsafe target shapes, or foreign adapters.
- Force-remove an Override or add selection-management commands.
- Add a proactive keep-local CLI action for unchanged content; valid manual
  config is supported.
- Add commit/publish, hosted fan-out, crash journaling, fsync guarantees, or
  restart-time transaction recovery.

## Not Tested Manually

- Windows junction, hardlink, and permission behavior; automated
  cross-platform tests must cover safe path inspection, adapters, atomic root
  metadata replacement, mode/attribute handling, and rollback.
- A deliberately incomplete rollback that preserves a recovery directory;
  deterministic command-service tests must assert the exact reported path and
  inspect its durable manifest and before-snapshots.
- Process termination or machine failure during mutation, which is an accepted
  non-goal rather than a passing scenario.
- Git-remote registry refresh; existing registry-cache tests remain the
  regression boundary.

## Pass Criteria

- Demo-ready when the disposable consumer can keep `alpha`, edit and sync it
  without recurring Conflict, observe changed and missing registry states,
  reverse it with take-registry, and pass every preservation/refusal check
  without any unrelated consumer mutation.
