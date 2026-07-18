# Bootstrap: Safe Project Initialization

Implement `skillfoo init` as the local, accountless first-project connection
workflow. It must create a new deterministic `.skillfoo.yml`, establish an
intentional desired-skill policy, and immediately run the same ordinary safe
reconciliation used by `skillfoo sync` without weakening any ownership or
never-clobber guarantee.

## Start Here

Work on the existing `safe-project-init` branch. Ship this slice as one pull
request.

Read these sources in order before editing:

1. [`AGENTS.md`](../../AGENTS.md) — repository instructions and available zone
   skills.
2. [`CONTEXT.md`](../../CONTEXT.md) — reconciliation vocabulary and ownership
   boundaries.
3. [`discovery.md`](./discovery.md) — problem evidence, constraints, code
   seams, and resolved grill questions.
4. [`decisions.md`](./decisions.md) — approved command, selection, config,
   outcome, and module contracts.
5. [`uat.md`](./uat.md) — user-approved outside-in behavior and pass criterion.
6. [`prd.md`](./prd.md) — user stories, implementation decisions, and testing
   expectations.
7. [`follow-ups.md`](./follow-ups.md) — adjacent work that must not leak into
   this slice.

Load `.agents/skills/typescript-cli/SKILL.md` and its required engineering
reference before changing parsing, prompting, filesystem behavior, packaging,
or CLI tests. After implementation and UAT, use the repository's `review`
skill for the merge-readiness pass and its `pr` skill to prepare the pull
request from the final diff.

The branch intentionally also contains dogfooded skillfoo projection updates
for the newly selected `review` and `uat` skills plus synced per-skill READMEs.
Preserve and include those generated changes in this PR; do not edit their
synced contents locally or treat them as initialization implementation.

## Contract That Must Not Be Violated

- The public grammar is
  `skillfoo init <registry> [--skill <name> ... | --all] [--emit <path>]`.
  Registry is the sole required positional. `--skill` repeats, `--all` and
  `--skill` are mutually exclusive, and unknown flags, missing values, or extra
  positionals fail before writes.
- When selection flags are absent, prompt only in a TTY. Show available skill
  names in deterministic order and accept exact comma-separated names or
  `all`. Invalid or empty input is retryable; cancellation writes nothing.
  Non-TTY use must supply `--skill` or `--all` and never silently means all.
- Named selections normalize duplicates by first occurrence and preserve user
  order. They write an explicit `skills` list. `--all` and interactive `all`
  omit `skills`, making future registry additions dynamically desired.
- The generated YAML is minimal, deterministic, and LF-terminated. Preserve
  the user's registry spelling, omit the default `.agents/skills` emit value,
  include a nondefault emit value, and add no generated comments.
- Create `.skillfoo.yml` with exclusive filesystem semantics. Existing or
  concurrently created config is never replaced, merged, truncated, or
  reformatted. Reject an existing config before registry access or cache work.
- `emit` is a non-empty relative path contained by the consumer. Absolute and
  lexically escaping paths are invalid. Every existing ancestor from the
  consumer toward the emit root must be a real directory, never a symlink,
  junction, file, or special entry. Validate this shared rule for init,
  status, and sync before registry access or consumer mutation.
- Validate the registry and every selected name before config creation. Use the
  exact same deterministic registry catalog as reconciliation.
- After config creation, run ordinary non-force reconciliation. Do not build a
  second installer or independently mutate skills, the lock, AGENTS.md, or
  adapters.
- Resolve and enumerate the registry once for an init attempt. The handoff to
  planning/execution must reuse that prepared registry state rather than
  planning twice or refreshing a Git registry again.
- Retain valid config if reconciliation conflicts or fails operationally.
  Execute independent safe actions, preserve all conflicts, and clearly say
  that configuration succeeded even when convergence did not.
- Init exits `0` only when the project finishes converged, `3` when safe work
  ran but a conflict requires attention, and `1` for usage or operational
  failure. Init has no exit `2`. Preserve the existing public exit/output
  behavior of direct `sync` and `status` commands.
- Local and Git-backed initialization remain accountless. Git access may use
  existing credentials and update only skillfoo's private registry cache
  before configuration exists.
- `init --help` reads no project or registry state and performs no mutation.
- Recovery after a retained config is through ordinary `status` and `sync`.
  Rerunning init refuses to change the established desired policy.

## Confirmed Ownership Boundaries

Keep the implementation behind the five boundaries approved in
[`decisions.md`](./decisions.md):

1. Configuration lifecycle owns shared emit validation, deterministic config
   rendering, and exclusive creation.
2. Registry catalog owns deterministic available-skill discovery shared with
   reconciliation.
3. Initialization service owns preflight, validated selection, config creation,
   delegation to ordinary reconciliation, and the structured init result.
4. CLI boundary owns strict argv parsing, TTY interaction, help, streams, and
   exit translation.
5. Ordinary reconciliation exposes the executed plan/outcome to init without a
   second plan or duplicate registry refresh.

If implementation pressure suggests collapsing these responsibilities or
adding a parallel mutation path, revisit the upstream artifacts before coding
around the contract.

## Verified Implementation Pointers

- `src/cli.ts` dispatches `sync` and `status`, has injectable cwd/stdout/stderr,
  and already uses strict Node `parseArgs` for status. Add strict init parsing,
  init-specific help, and the smallest injectable TTY/line-input seam. Do not
  fold the deferred legacy sync parser migration into this slice.
- `src/config.ts` loads schema/defaults but has no writer and currently accepts
  unsafe emit strings. Put the shared contained-path validation on the config
  lifecycle so manual config and init config cannot diverge. Add a pure stable
  renderer and an exclusive creator rather than hand-writing YAML in the CLI.
- `src/registry.ts` resolves local and Git sources with injectable reporter and
  cache root. Expose a deterministic catalog operation that can be shared by
  init and `src/plan.ts`; keep Git test caches isolated.
- `src/plan.ts` currently owns the private sorted `listRegistrySkills`, desired
  normalization/validation, and complete reconciliation plan. Move catalog
  ownership without changing existing desired-set semantics. Add a narrow way
  to plan from already resolved registry state so init does not fetch twice.
- `src/sync.ts` plans internally, executes safe actions, renders the sync
  summary, and currently returns `void`. Let its service boundary return the
  completed reconciliation plan/outcome needed by init while preserving direct
  sync command output and exit behavior. Do not duplicate the executor.
- `src/status.ts` already maps plan outcomes to `0`, `2`, or `3`. Reuse the same
  outcome vocabulary for init's post-execution `0`/`3` decision rather than
  deriving a second conflict model.
- Add a focused initialization service module (for example `src/init.ts`) so
  config lifecycle, catalog, sync, and CLI orchestration remain independently
  testable.
- `test/config.test.ts` and `test/cli.test.ts` cover the current public seams;
  `test/index.ts` explicitly imports suites. Add focused config/catalog/init
  tests and compiled-process coverage, and register every new suite.
- `README.md` still tells users to hand-author YAML before sync. Make init the
  primary quickstart while preserving a concise manual config reference.
- The package is ESM TypeScript for Node 22+, uses Node's test runner, and ships
  the compiled `dist/entrypoint.js` npm binary. Preserve this stack and the
  Linux/macOS/Windows Node 22/24 CI coverage.

## Suggested Implementation Sequence

1. Add shared emit validation, deterministic config rendering, and exclusive
   config creation with focused filesystem tests.
2. Extract deterministic registry catalog enumeration and make the planner
   consume it without changing plan behavior.
3. Define structured init inputs/results and the already-resolved registry seam
   used by ordinary planning and execution.
4. Implement the initialization service: ownership preflight, selection
   validation, exclusive config creation, one ordinary reconciliation, and
   partial-outcome reporting.
5. Add strict CLI parsing, help, non-TTY enforcement, injectable TTY prompting,
   output routing, and exit mapping.
6. Add outside-in local-registry tests for explicit selection, dynamic all,
   conflict retention, operational recovery, reruns, and consumer immutability.
7. Add compiled-process coverage for streams/statuses, malformed invocation,
   paths with spaces and non-ASCII characters, and installed-binary behavior.
8. Update the quickstart and command documentation, then run the approved UAT.

Keep validation ordered so invalid invocation, existing config, and invalid
emit fail before registry/cache access; missing registry skills fail after
catalog access but before config or consumer writes. Do not roll config back
after reconciliation begins.

## Verification Gates

- Run focused unit and process tests while building the config, catalog, init,
  and CLI seams.
- Run `npm run check` for typecheck, build, and the complete automated suite.
- Run `git diff --check`.
- Build and run the compiled entrypoint for exact help, stream, and exit-status
  assertions.
- Run `npm pack`, inspect the package contents, install the tarball into a
  disposable empty project, and invoke the npm-created `skillfoo` executable.
- Execute every scenario in the user-approved [`uat.md`](./uat.md) with
  disposable registries and consumers. Snapshot the complete consumer tree,
  including ignored files and links, for no-mutation checks.
- Isolate Git-backed tests and UAT from the developer's real
  `~/.skillfoo/registries` cache by injecting a disposable cache root.
- Retain Windows CI coverage for path containment and junction behavior and
  Node 22/24 coverage across the supported matrix.
- Review the final diff for accidental legacy sync parsing changes, a second
  reconciliation implementation, unsafe path traversal, output-contract drift,
  or generated skill edits outside the skillfoo sync result.

The global `skillfoo` executable is not linked in this development shell. Use
the built entrypoint during development, and use the tarball-installed binary
for package acceptance.

## Out of Scope and Follow-ups

Do not implement re-init or config editing, selection-management commands,
config-only init, `--no-sync`, JSON output, aliases, conflict resolution,
intentional override, registry promotion, force removal, automatic commits or
publishing, hosted identity/billing, registry creation, multiple registries,
inheritance, emit-root migration, legacy sync parser cleanup, or repeated-walk
performance cleanup. Record new adjacent findings in
[`follow-ups.md`](./follow-ups.md).

## Final Instruction

Execute from these documents and verified repository code, not conversation
memory. Preserve the dogfooded projection updates already on the branch. When
implementation and UAT pass, run the repository's `review` skill, address its
findings, then use the `pr` skill to prepare the pull request from the final
diff.
