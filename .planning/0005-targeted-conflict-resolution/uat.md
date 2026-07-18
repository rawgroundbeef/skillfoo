# UAT: Targeted Conflict Resolution

**Goal:** Prove that a user can intentionally replace one locally edited
Managed skill with its current registry version without changing any unrelated
skill, while failures preserve recoverable state.

## Prerequisites

- Check out the `targeted-conflict-resolution` branch after implementation.
- Use Node.js 22 or newer in a disposable Unix-like shell environment. Windows
  path and junction behavior remains an automated-test requirement.
- From the skillfoo repository root, build the executable and prepare a local
  registry:

```sh
npm run build
SKILLFOO_REPO="$PWD"
SKILLFOO_UAT_ROOT="$(mktemp -d)"
mkdir -p "$SKILLFOO_UAT_ROOT/registry/alpha"
mkdir -p "$SKILLFOO_UAT_ROOT/registry/beta"
printf '%s\n' '---' 'name: alpha' 'description: alpha registry guidance.' '---' '' '# Alpha registry' > "$SKILLFOO_UAT_ROOT/registry/alpha/SKILL.md"
printf '%s\n' '---' 'name: beta' 'description: beta registry guidance.' '---' '' '# Beta registry' > "$SKILLFOO_UAT_ROOT/registry/beta/SKILL.md"
```

- Invoke the built CLI as:

```sh
node "$SKILLFOO_REPO/dist/entrypoint.js" ...
```

All destructive actions below are confined to `SKILLFOO_UAT_ROOT`.

## Happy Path: Take the registry version for one skill

1. Initialize a consumer with `alpha`:

   ```sh
   mkdir "$SKILLFOO_UAT_ROOT/happy"
   cd "$SKILLFOO_UAT_ROOT/happy"
   node "$SKILLFOO_REPO/dist/entrypoint.js" init ../registry --skill alpha
   ```

2. Replace `.agents/skills/alpha/SKILL.md` with locally edited content whose
   description is `alpha local guidance.` Run ordinary sync once so the managed
   `AGENTS.md` row reflects the preserved local description, then remove the
   expected `.claude/skills/alpha` adapter.
3. Run `node "$SKILLFOO_REPO/dist/entrypoint.js" status --json` and confirm
   `alpha` is `drifted` with reason `local_changes` and exit status `3`.
4. Run:

   ```sh
   node "$SKILLFOO_REPO/dist/entrypoint.js" resolve alpha --take-registry
   ```

Expected:

- The command exits `0`, names `alpha`, and says the registry version won and
  local edits were discarded.
- `.agents/skills/alpha/` is byte-for-byte equivalent to `../registry/alpha/`,
  including deletion of local-only files.
- The `alpha` lock entry records the current registry source and hash.
- Only the managed `alpha` row in `AGENTS.md` changes back to
  `alpha registry guidance.`; surrounding bespoke content is unchanged.
- The missing `.claude/skills/alpha` adapter is recreated with the expected
  target.
- No staging, recovery, or backup directory remains after success.
- A subsequent `skillfoo status` exits `0` and reports the repository as
  Converged.

## Guardrails

### A second Conflict remains untouched

1. Create a fresh consumer named `isolation`, initialize both `alpha` and
   `beta`, and edit both emitted `SKILL.md` files locally with distinct content
   and descriptions.
2. Run ordinary sync so both Conflicts are preserved and their managed rows use
   the local descriptions.
3. Snapshot the complete emitted `beta` directory, its lock entry, its managed
   `AGENTS.md` row, and its adapter target.
4. Resolve only `alpha` with
   `node "$SKILLFOO_REPO/dist/entrypoint.js" resolve alpha --take-registry`.

Expected:

- `alpha` takes the registry version.
- The command exits `3` and reports that another Conflict remains.
- The emitted `beta` directory, lock entry, managed row, and adapter are
  byte-for-byte unchanged from the snapshot.
- `skillfoo status` reports `alpha` as `unchanged` and `beta` as `drifted` with
  `local_changes`.

### An unrelated safe update remains pending

1. Create a fresh consumer named `pending`, initialize both skills, and edit
   only emitted `alpha` locally.
2. Change the registry's `beta/SKILL.md` after initialization without changing
   emitted `beta`; snapshot emitted `beta`, its lock entry, managed row, and
   adapter.
3. Resolve only `alpha`.

Expected:

- The command exits `2` and reports that safe changes remain.
- `alpha` takes the registry version.
- Emitted `beta`, its lock entry, managed row, and adapter remain byte-for-byte
  unchanged.
- `skillfoo status` reports `beta` as `update`; ordinary `skillfoo sync` is
  still required to apply it.

### Ineligible targets and invalid syntax write nothing

1. Create a fresh consumer with a Bespoke `alpha` directory occupying the
   desired emit path, then initialize it against the registry with `alpha`
   selected. Confirm initialization preserves the collision and exits `3`.
2. Snapshot the entire consumer tree.
3. Run each invocation separately:

   ```sh
   node "$SKILLFOO_REPO/dist/entrypoint.js" resolve alpha --take-registry
   node "$SKILLFOO_REPO/dist/entrypoint.js" resolve alpha
   node "$SKILLFOO_REPO/dist/entrypoint.js" resolve --take-registry
   node "$SKILLFOO_REPO/dist/entrypoint.js" resolve alpha beta --take-registry
   node "$SKILLFOO_REPO/dist/entrypoint.js" resolve alpha --take-registry --take-registry
   node "$SKILLFOO_REPO/dist/entrypoint.js" resolve alpha --take-registry --unknown
   node "$SKILLFOO_REPO/dist/entrypoint.js" sync --force
   node "$SKILLFOO_REPO/dist/entrypoint.js" sync -f
   ```

Expected:

- Every invocation exits `1`, writes no successful result to stdout, and emits
  one actionable diagnostic on stderr.
- The Bespoke collision and every other consumer byte remain unchanged.
- Removed `sync --force` and `sync -f` fail visibly; neither falls back to
  ordinary sync.
- Equivalent no-write refusal is covered for removal candidates, unsafe emitted
  path shapes, missing ownership, safe pending states, and non-`local_changes`
  Conflicts in automated command-service and process tests.

### A foreign target adapter remains a separate Conflict

1. Create a fresh consumer, initialize `alpha`, and edit its emitted skill
   locally.
2. Replace `.claude/skills/alpha` with a regular file containing
   `foreign adapter`.
3. Resolve `alpha` with `--take-registry`.

Expected:

- The emitted skill takes the registry version, its lock entry advances, and
  its managed `AGENTS.md` row uses the registry description.
- The foreign adapter file remains byte-for-byte unchanged.
- The command exits `3`. Status reports the `alpha` skill as `unchanged` and
  its adapter as `blocked` with `unmanaged_destination`.

### Failure restores the prior target state

1. In a fresh initialized consumer, create an `alpha` local-edit Conflict and
   snapshot the emitted skill, lockfile, `AGENTS.md`, and adapter.
2. As an ordinary non-root user on a POSIX filesystem that honors mode bits,
   remove owner write permission from `.skillfoo.lock` and confirm the file is
   not writable. Run the resolver, then restore permission before inspecting
   the fixture. If the environment can still write the file, mark this manual
   scenario blocked and use the deterministic transaction failure-injection
   integration test as the verification evidence.

Expected:

- The command exits `1` and reports the operational failure on stderr.
- The local `alpha` content, prior lockfile, managed row, and adapter match the
  snapshots; the registry version is not left partially applied.
- A completed rollback leaves no recovery artifact. If rollback cannot
  complete, the error names the preserved recovery path and the original local
  content is recoverable there.

## Persistence / Revisit

1. In the happy-path consumer, rerun:

   ```sh
   node "$SKILLFOO_REPO/dist/entrypoint.js" resolve alpha --take-registry
   ```

2. Run `node "$SKILLFOO_REPO/dist/entrypoint.js" status` again.

Expected:

- The repeated resolver exits `0`, reports that the still-Managed target already
  matches the current registry, and performs no content or projection writes.
- Status remains Converged.

## Observability

- Successful result text goes to stdout; usage, refusal, stale-evidence, and
  operational diagnostics go to stderr.
- Exit codes describe post-resolution repository state: `0` Converged, `2`
  unrelated safe changes, `3` another Conflict, and `1` no successful
  resolution.
- Help documents `resolve <skill> --take-registry` and no longer advertises
  `sync --force` or `sync -f`.

## Known Non-Goals

- Keeping local edits as an override or converting them to Bespoke content.
- Promoting local edits into the registry.
- Replacing a Bespoke collision, foreign adapter, or unsafe emitted path.
- Force-removing a deselected Managed skill.
- Resolving more than one named skill per invocation.
- Applying unrelated ordinary sync work.
- Creating a permanent backup, git commit, or remote pull request.

## Not Tested Manually

- A deterministic concurrent registry or consumer mutation at the final
  revalidation boundary; automated tests must inject changed hash evidence and
  prove no target replacement, no durable consumer change, and no leftover
  staging data.
- Windows junction creation and rollback; CI must retain Windows coverage for
  adapter and rename behavior.
- Process termination or machine failure during filesystem replacement. Crash
  consistency, fsync durability, restart-time transaction discovery, and
  automatic cleanup/recovery are outside this slice; only handled failures and
  in-process rollback are acceptance requirements.

## Pass Criteria

- In one demo, resolving `alpha` replaces only its local edits and dependent
  projections, leaves conflicting or safely outdated `beta` state untouched,
  returns the correct remaining-outcome code, retries safely, and restores the
  original target when an induced write fails.
