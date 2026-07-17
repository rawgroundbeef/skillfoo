# TypeScript CLI engineering reference

Use this reference to make stack and architecture decisions. Re-check version-sensitive facts against the linked primary documentation before adding or upgrading tools.

## Decision order

Choose in this order:

1. User and automation contract.
2. Supported runtime and operating systems.
3. Packaging and installation model.
4. Parser and interaction needs.
5. Internal architecture.
6. Build and test tools.

Starting from a fashionable framework reverses the important dependencies.

## Runtime and language

TypeScript is the default for a maintained Node CLI because command boundaries contain untrusted strings, optional values, parsed configuration, filesystem results, and subprocess outcomes. Types make those transitions explicit without adding a runtime.

Use another implementation language only for a concrete constraint, such as distributing one native executable to machines without Node, integrating deeply with a language-specific ecosystem, or meeting measured startup/resource limits. Do not switch languages merely to avoid a small build step.

For Node:

- Use supported LTS lines in production. Do not target Current merely because it is newest.
- Declare the supported range in `engines.node` and exercise that minimum in CI.
- Compile npm package contents to JavaScript. Node's built-in TypeScript support ignores `tsconfig.json`, performs no type checking, and does not execute `.ts` from `node_modules`; it is not a published-package strategy.
- Prefer ESM for greenfield packages. Avoid a dual ESM/CommonJS package unless consumers import a reusable library and actual compatibility requirements justify the extra surface.

## Parser selection

Use built-in `parseArgs` when all of these are true:

- The CLI is one command or has trivial dispatch.
- Options are booleans or strings with limited coercion.
- Help text is small enough to maintain directly.
- Parser errors and lifecycle customization are simple.

Use Commander when one or more of these are true:

- Multiple nested subcommands need consistent generated help.
- Arguments or options need reusable coercion and validation.
- Async action handlers, command hooks, aliases, or help customization are material.
- Tests need to override parser exit and output behavior.

Instantiate a local `Command` rather than importing Commander's global singleton. Call `parseAsync` when any handler or hook is asynchronous. Keep business behavior outside action callbacks.

Do not add a prompt, color, spinner, table, logging, or configuration library until the CLI needs that capability. When it does, select a focused library and test its non-TTY behavior.

## TypeScript configuration

Start with a build configuration shaped like this, then align the module/target pair to the supported Node line:

```json
{
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmitOnError": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "sourceMap": true,
    "declaration": false,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

Notes:

- Set `target` explicitly when using a fixed Node module mode or when the supported runtime requires it. `NodeNext` is intentionally a moving model of current Node behavior, so a fixed `node20`, `node18`, or similar mode may better express a long support window when available in the installed TypeScript version.
- Use `.js` in relative imports that will be `.js` at runtime under emitted Node ESM, even when the source file is `.ts`.
- Avoid `paths` aliases unless package `imports`, a bundler, or another runtime mechanism makes the emitted specifier real.
- Emit declarations only when consumers are expected to import a public programmatic API.
- Keep source maps for actionable stack traces. Test that packaged maps do not expose data that should not ship.
- `skipLibCheck` controls dependency declaration checking, not application strictness. Remove it when declaration compatibility itself is a release requirement.

## Package shape

A typical published CLI package needs:

```json
{
  "type": "module",
  "bin": {
    "my-command": "dist/cli.js"
  },
  "files": ["dist"],
  "engines": {
    "node": ">=SUPPORTED_MINIMUM"
  },
  "scripts": {
    "clean": "...",
    "typecheck": "tsc --noEmit",
    "build": "tsc -p tsconfig.build.json",
    "test": "...",
    "prepack": "npm run clean && npm run build"
  }
}
```

Adapt scripts to the repository's package manager and portability requirements. Do not use Unix-only cleanup commands in a package that contributors must build on Windows; use an existing portable tool or a tiny Node script when needed.

The executable output must retain `#!/usr/bin/env node`. npm creates platform-specific command shims from `bin`, including Windows wrappers. Validate installation through npm rather than checking only a direct Unix execution bit.

Use `files` as an allowlist and inspect `npm pack --json` or the created tarball. Confirm that required runtime files, source maps, licenses, and notices ship, while tests, credentials, local configuration, and unrelated sources do not.

## Architecture

Keep these boundaries explicit:

```text
executable -> parser -> validated command request -> command service
                                                   |-> filesystem/network/subprocess ports
command result or typed failure -> renderer -> stdout/stderr + exit status
```

Recommended properties:

- The executable imports a `main` or `runCli` function and assigns its returned status to `process.exitCode`.
- Parser construction is a function so tests receive a fresh parser and controlled output.
- Validation converts strings and `undefined` into domain-safe values once. Internal services do not repeatedly parse raw flags or environment variables.
- Command services return data rather than preformatted terminal strings when the same result can render as human text or JSON.
- Expected failures have stable categories or codes. Do not branch behavior by matching arbitrary error-message text.
- Side effects are owned by narrow adapters. Inject only boundaries worth controlling; avoid an abstraction for every one-line pure function.
- Read environment and current working directory at invocation time, not module import time, so tests and embedded use remain predictable.

## Output and status contract

Use stdout for the requested result. Use stderr for warnings, progress, usage errors, and operational diagnostics. A pipeline such as `command --json | jq ...` must receive only JSON on stdout.

Use a small documented status vocabulary. `0` means success; non-zero statuses should distinguish usage failure from operational failure only when callers benefit from the distinction. Preserve existing status codes during migration. Avoid exposing raw dependency-specific codes as a public contract without translation.

Do not call `process.exit()` after asynchronous writes. Await work, finish cleanup, set `process.exitCode`, and allow Node to exit naturally. Signal handlers are justified only when cleanup or child propagation is required; once installed, they must preserve conventional interruption behavior.

## Reliability and security

- Treat argv, environment variables, config files, stdin, remote data, and filesystem contents as untrusted.
- Validate before mutating state. For multi-step writes, prefer staging plus an atomic rename or a recoverable transaction.
- Make repeated execution safe where practical. Name partial and retry behavior explicitly.
- Bound network requests and child processes with timeouts and cancellation.
- Use `spawn`/`execFile` argument arrays with `shell: false`. If shell semantics are truly required, isolate the command construction and reject untrusted metacharacters rather than relying on ad hoc quoting.
- Prevent path traversal by resolving and verifying paths against an intended root before writing.
- Redact secrets from errors, debug logs, telemetry, and snapshots. Do not collect telemetry without clear disclosure and opt-out semantics.
- Avoid update checks on every invocation unless they are asynchronous, cacheable, failure-tolerant, and non-disruptive.

## Testing layers

Prefer behavior-focused coverage:

1. Parser tests: aliases, repeated flags, `--`, negative-looking values, unknown flags, missing values, and subcommand help.
2. Validation/config tests: defaults, precedence, malformed values, empty strings, absent environment variables, and config schema evolution.
3. Command service tests: success, expected failures, partial side effects, retries, timeouts, and cleanup using controlled adapters.
4. Process tests: spawn compiled JavaScript and assert exact status/stdout/stderr. Include spaces and non-ASCII characters in temporary paths.
5. Package smoke test: pack, install the tarball in an empty temporary project, and invoke the npm-created bin.

Test help and human-readable errors semantically unless exact wording is intentionally stable. Test JSON output structurally. Avoid broad snapshots that turn harmless formatting edits into noise.

CI should cover the minimum supported Node version and current Active LTS. Add Windows whenever the CLI touches paths, subprocesses, executable lookup, shell syntax, symlinks, or permissions. Add macOS for platform APIs or behavior not represented by Linux and Windows.

## Primary sources reviewed 2026-07-17

- [Node.js release policy and supported lines](https://nodejs.org/en/about/previous-releases)
- [Node.js TypeScript execution](https://nodejs.org/api/typescript.html)
- [Node.js `parseArgs`](https://nodejs.org/api/util.html#utilparseargsconfig)
- [Node.js process exit behavior](https://nodejs.org/api/process.html#processexitcode)
- [Node.js child processes](https://nodejs.org/api/child_process.html)
- [Node.js test runner](https://nodejs.org/api/test.html)
- [TypeScript Node module modes](https://www.typescriptlang.org/docs/handbook/modules/reference.html)
- [TypeScript strict mode](https://www.typescriptlang.org/tsconfig/strict.html)
- [TypeScript `noEmitOnError`](https://www.typescriptlang.org/tsconfig/noEmitOnError.html)
- [npm package metadata, `bin`, `files`, and `engines`](https://docs.npmjs.com/files/package.json/)
- [npm package tarballs](https://docs.npmjs.com/cli/commands/npm-pack)
- [Commander documentation](https://github.com/tj/commander.js)
- [NO_COLOR convention](https://no-color.org/)
- [Command Line Interface Guidelines](https://clig.dev/)
