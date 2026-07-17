# JavaScript-to-TypeScript CLI migration

Use an incremental migration unless the CLI is tiny and already well-covered. Separate behavior preservation from module-format, parser, or UX improvements so regressions have an obvious cause.

## 1. Capture the current contract

Before renaming files:

- Run the existing checks and record the supported Node version and package manager.
- Exercise help, version, success, invalid usage, expected operational failure, and a non-interactive invocation as child processes.
- Record stdout, stderr, and status separately. Add focused characterization tests for behavior that is public but untested.
- Run `npm pack`, inspect the contents, install the tarball in a temporary project, and prove the installed bin works.
- Inventory command names, flags, aliases, environment variables, config files, prompts, status codes, and destructive actions.

Fix only blockers needed to create a reliable baseline. Put unrelated behavioral improvements in follow-up changes.

## 2. Add TypeScript without changing runtime semantics

- Install TypeScript and the matching Node type declarations as development dependencies.
- Give source and emitted output separate directories. Never emit over the JavaScript inputs.
- Start with `allowJs` when incremental conversion is safer. Turn on `checkJs` or rename a leaf/boundary module at a time.
- Set `noEmitOnError` before the built artifact becomes authoritative.
- Preserve CommonJS versus ESM initially. A module-format conversion is a separate compatibility decision.
- Preserve runtime-valid import specifiers. Under Node ESM, TypeScript source generally imports the emitted `.js` path.
- Replace ESM-incompatible globals such as `__dirname` only if the package is actually moving to ESM.

Do not silence migration errors with broad `any`, unchecked casts, or a project-wide `@ts-nocheck`. At untyped boundaries, accept `unknown`, validate it, and return a narrow type.

## 3. Convert boundary-first

Prioritize the places where TypeScript catches real CLI failures:

1. Parsed argv and parser option types.
2. Environment and config loading.
3. Error normalization in `catch` blocks.
4. Filesystem and subprocess results.
5. Command request/result types.
6. Internal pure helpers.

Remember that environment lookups and indexed records can be absent. Keep `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `useUnknownInCatchVariables` enabled rather than casting away those cases.

Extract a thin executable if the old entrypoint mixes parsing, I/O, and business behavior. Keep an import side-effect guard so tests can import modules without running the command.

## 4. Move execution to built JavaScript atomically

Do not point `package.json#bin` at `dist` until the clean build reliably creates the target with its shebang. Update together:

- Build and clean scripts.
- `bin`, `files`, and any `main`/`exports`/`types` fields.
- Development invocation and test commands.
- CI caches/artifacts and release scripts.
- Ignore rules for generated output.

Keep TypeScript and build-only tools in `devDependencies`. Confirm every import in emitted JavaScript is either built-in, shipped in the tarball, or declared in runtime `dependencies`.

Node can execute erasable TypeScript directly on supported releases, but npm-installed packages should still ship JavaScript. Native type stripping ignores `tsconfig.json`, does not type-check, and rejects TypeScript in `node_modules`.

## 5. Prove parity, then tighten

Run the baseline characterization tests against the compiled CLI. Compare stdout, stderr, and status independently. Re-run the tarball installation smoke test.

After parity:

- Enable the remaining strict options and remove temporary JavaScript inclusion.
- Replace characterization tests with intentional contract tests where appropriate.
- Improve parser, UX, architecture, or module format only in separately reviewable steps.
- Test the minimum supported Node version and Windows when packaging, paths, or subprocess behavior is involved.

The migration is complete when source JavaScript is no longer authoritative, a clean checkout can build and test, the packed artifact contains only intended runtime files, and the installed command behaves like the baseline except for explicitly approved changes.
