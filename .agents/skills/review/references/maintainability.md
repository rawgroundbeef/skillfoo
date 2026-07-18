# Maintainability review

Review ownership, duplication, complexity, and whether the next likely change
will be harder or riskier than necessary.

## Workflow

1. Inspect changed files and nearby patterns. Use `rg` for repeated constants,
   schemas, guards, query shapes, state mapping, and helper logic.
2. Identify which pieces must change together and who should own them.
3. Separate harmless local duplication from rules likely to drift.
4. Recommend only pragmatic refactors with named callers and boundaries.

## Checklist

- **Business-rule duplication:** Authorization, scoping, validation, status
  mapping, identifiers, and state transitions should have one authoritative
  owner when copies must stay synchronized.
- **Schema and type ownership:** Shared contracts should live at the boundary
  that owns them and be reused by producers and consumers where appropriate.
- **Layer boundaries:** Keep transport, domain policy, persistence, and
  presentation responsibilities aligned with repository conventions.
- **Lifecycle complexity:** Flag modules that mix I/O, retries, cancellation,
  progress, caching, state transitions, and presentation without a clear seam.
- **Repeated UI or behavior:** Extract stable repeated concepts, not snippets
  that merely look alike.
- **Size and complexity:** Investigate long files or functions when size comes
  from mixed responsibilities, branching state, or difficult failure paths;
  do not enforce arbitrary line limits alone.
- **Naming drift:** Use one term and unit for the same domain concept across
  code, APIs, storage, tests, and documentation.
- **Public API shape:** Avoid leaky abstractions, boolean traps, surprising
  side effects, and changes that force unrelated consumers to know internals.
- **Dead or stale material:** Remove code, flags, imports, types, tests, and
  docs made obsolete by the change.
- **Test maintainability:** Prefer behavior helpers and fixture builders over
  copied setup, timing dependence, and source-string assertions.
- **Product-stage pragmatism:** Do not require an abstraction because two small
  snippets resemble each other. Require one when they represent a shared rule
  or are likely to drift.

## Severity

- **High:** Tangled or duplicated logic likely to cause bugs, security drift,
  data inconsistency, or repeated costly work.
- **Medium:** Clear maintenance hazard in code likely to change again.
- **Low:** Cleanup, naming consolidation, fixture improvement, or extraction
  candidate with limited present risk.

High and material Medium findings may request changes. Low findings and bounded
Medium debt are Warn-level when safely deferrable.

For each finding, include severity, file and line, the coupled or tangled
locations, expected maintenance failure, and smallest useful refactor. If the
code is maintainable enough now, state what future change would justify a split.
