# Testing review

Judge whether the changed behavior has enough useful coverage to merge with
confidence. Review tests after the other passes reveal the important contracts
and failure modes.

## Workflow

1. Inspect changed modules and existing nearby tests.
2. Use `rg` to find callers, fixtures, integration tests, and end-to-end paths.
3. Map each risky changed behavior to an assertion at the cheapest reliable
   test level.
4. Check that a proposed regression test would fail without the implementation.

## Checklist

- **Core behavior:** Cover observable success, empty, invalid-input, and error
  paths introduced or changed by the diff.
- **Authorization and isolation:** Cover missing identity, insufficient role,
  wrong owner or tenant, and allowed access for sensitive operations.
- **Validation and contracts:** Reject malformed, unsupported, oversized, and
  boundary inputs; pin meaningful output and error shapes.
- **Persistence:** Assert state transitions, ownership, deduplication,
  transactions, partial failure, and failure mapping.
- **Concurrency and replay:** Cover duplicate requests or delivery, retries,
  races, idempotency, cancellation, and recovery where relevant.
- **External integrations:** Pin requests, callbacks, timeouts, retries,
  fallback behavior, and error mapping without depending on live services in
  the default unit suite.
- **Frontend behavior:** Cover user-visible states and interactions at the
  repository's established level; identify residual manual QA explicitly.
- **Compatibility:** Cover changed public APIs, schemas, commands, output,
  configuration, migrations, and representative existing consumers.
- **Regression value:** Prefer behavior assertions over implementation details.
  Avoid snapshots or source-string checks that can pass while behavior breaks.
- **Reliability:** Watch nondeterministic time, randomness, order, shared state,
  network access, environment dependence, and fixtures unlike production.

## Severity

- **High:** Missing or misleading coverage for authorization, isolation,
  destructive mutation, sensitive exposure, money movement, migration safety,
  or a broad user-visible workflow.
- **Medium:** Meaningful integration, persistence, state-transition, contract,
  or failure branch is uncovered.
- **Low:** Useful edge case, fixture cleanup, brittle assertion, or manual-QA
  gap with small blast radius.

High and material Medium gaps normally request changes. Low gaps should be
Warn-level unless they are the only guard for a known regression.

For each finding, include severity, file and line, uncovered behavior, why it
matters, and the smallest test scenario as setup, action, and assertion. If
coverage is adequate, name the tests and behaviors that support that conclusion.
