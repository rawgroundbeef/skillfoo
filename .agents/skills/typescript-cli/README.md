# TypeScript CLI

Build, migrate, or review a Node.js command-line application as a stable public
interface—not a script that happened to accumulate flags.

The skill covers command grammar, stdout/stderr contracts, exit statuses,
configuration precedence, non-interactive safety, subprocess and filesystem
behavior, packaging, and cross-platform release confidence.

## What it emphasizes

- A thin executable with importable, testable command behavior.
- The smallest reliable parser, build, and test stack for the command surface.
- Compiled JavaScript packages that work after a real `npm pack` installation.
- Explicit handling for TTYs, JSON output, cancellation, destructive actions,
  secrets, and child processes.
- Outside-in tests of the built executable and supported Node/platform matrix.

## Try it

```text
Use $typescript-cli to build this Node CLI for reliable npm distribution.
```

```text
Use $typescript-cli to migrate this JavaScript CLI without breaking its command contract.
```

The executable workflow lives in [SKILL.md](./SKILL.md). Detailed guidance is
split between [CLI engineering](./references/engineering.md) and
[JavaScript migration](./references/migration.md).
