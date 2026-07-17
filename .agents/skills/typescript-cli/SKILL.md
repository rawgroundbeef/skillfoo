---
name: typescript-cli
description: Build, migrate, or review reliable Node.js command-line applications in TypeScript. Use when creating a CLI, converting a JavaScript CLI to TypeScript, choosing a parser/build/test stack, designing flags and output, hardening subprocess or filesystem behavior, packaging an npm executable, or checking a CLI for release readiness and cross-platform automation safety.
---

# TypeScript CLI

Build a CLI as a stable user interface, not as a thin script that happened to grow flags. Prefer a small, conventional stack and prove the installed artifact works.

## Load the guidance

- Read [engineering.md](references/engineering.md) before choosing the stack, changing command behavior, or reviewing release readiness.
- Also read [migration.md](references/migration.md) when converting an existing JavaScript CLI. Preserve behavior before improving architecture.

## Establish the contract

Inspect the repository, its agent instructions, package manager, supported Node versions, tests, release process, and current CLI behavior before editing. Answer from code or docs when possible.

Define or recover:

- Command and subcommand grammar, including `--help`, `--version`, `--`, unknown options, and missing values.
- Human output, machine-readable output, diagnostics, and exit status for each outcome.
- Configuration precedence across flags, environment, config files, and defaults.
- Interactive versus non-interactive behavior, especially prompts and destructive actions.
- Supported operating systems, Node releases, installation methods, and whether the CLI exposes an importable API.

Treat command names, flags, environment variables, config keys, stdout formats, and exit statuses as public API. Do not change them accidentally during a migration or refactor.

## Choose the smallest reliable stack

Default to TypeScript on Node.js for a distributable, cross-platform CLI unless repository or deployment constraints point elsewhere.

- Support only non-EOL Node releases. For a greenfield CLI, target the current Active LTS and test the supported range. Re-check the Node release page instead of copying a version from this skill.
- Publish compiled JavaScript. Do not make an npm-installed executable depend on raw `.ts`, a loader, or Node's type stripping.
- Prefer ESM for greenfield work. Preserve the existing module format during migration unless changing it has a concrete payoff.
- Use `node:util` `parseArgs` for a small, flat command surface. Use Commander when subcommands, generated help, typed coercion, or parser lifecycle behavior justify a dependency. Do not hand-roll general argument parsing.
- Use `tsc` for type checking and emission by default. Add a bundler only for a demonstrated distribution, startup, or single-file requirement.
- Use `node:test` and `node:assert` by default for a Node-only CLI. Keep a repository's established test framework when it already provides a coherent testing surface.
- Add dependencies only for behavior that is difficult to implement and maintain correctly. Check maintenance status, Node support, license, install footprint, and transitive risk first.

Record the material choices and why they fit this CLI. Avoid presenting preferences as universal requirements.

## Design around a thin entrypoint

Keep the executable responsible for wiring only:

1. Accept `argv` and explicit I/O/dependency adapters.
2. Parse and validate untrusted input at the boundary.
3. Invoke command handlers that return results or typed failures.
4. Render output in one place.
5. Return or assign an exit status.

Keep command behavior importable without executing it. Avoid reading `process.argv`, mutating global process state, or writing directly to the console throughout domain modules. Pass filesystem, environment, clock, network, and subprocess capabilities where isolation materially improves tests.

Model expected user failures separately from programmer defects. Render expected failures concisely; reserve stack traces for a debug mode. Set `process.exitCode` after awaited work rather than calling `process.exit()` and risking truncated output.

## Implement the user experience

- Send primary data to stdout and diagnostics or progress to stderr. Keep `--json` stdout parseable and free of decoration.
- Make `--help` useful at every command level. Include examples only where syntax is otherwise ambiguous.
- Reject unknown flags and invalid values early with an actionable correction. Never silently reinterpret malformed input.
- Prompt only when stdin is a TTY, always provide a non-interactive equivalent, and support an explicit no-input mode when prompts exist.
- Require deliberate confirmation or a dry run for high-impact destructive operations. Keep automation possible without weakening the interactive guardrail.
- Disable color and animation for non-TTY output. Respect `NO_COLOR`; make forced color an explicit override if supported.
- Define timeouts and cancellation for network or child-process work. Leave Ctrl-C effective and clean up owned temporary resources.
- Pass subprocess arguments as an array with `spawn` or `execFile` and `shell: false`. Never interpolate untrusted input into a shell command.
- Do not accept secrets in ordinary command-line flags when they can leak through history or process listings. Prefer stdin, a protected file, or an OS credential facility.

## Build and package the actual executable

Use strict TypeScript settings appropriate to the selected Node/module target. Include `strict`, `noEmitOnError`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `noImplicitReturns`, and `noFallthroughCasesInSwitch` unless a documented repository constraint prevents one.

Point `package.json#bin` at compiled JavaScript included in the package. Ensure that file starts with `#!/usr/bin/env node`. Keep development-only tooling in `devDependencies`; keep every runtime import in `dependencies`.

Do not rely on TypeScript path aliases or development loaders unless the emitted package resolves them at runtime. Under Node ESM, use runtime-valid import specifiers and the matching Node-aware TypeScript module mode.

## Verify from the outside in

Run checks in this order and fix failures at their owning layer:

1. Typecheck and build from a clean output directory.
2. Unit-test parsing, validation, configuration precedence, and command services.
3. Spawn the built CLI as a child process and assert stdout, stderr, and exit status for success, usage errors, operational failures, help, version, and non-interactive execution.
4. Run `npm pack`, inspect the tarball contents, install that tarball in a temporary project, and invoke the installed command. Do not treat `node src/cli.ts` as packaging proof.
5. Test the minimum supported Node release and current LTS. Add Windows CI for filesystem, quoting, executable, or subprocess behavior; add macOS when behavior is platform-sensitive.
6. Re-run the repository's full checks and review the final diff for unintended command-contract changes.

Report the chosen stack, preserved or changed public behavior, verification performed, and any platform or release gaps that remain.
