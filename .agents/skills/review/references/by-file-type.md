# Review by file type

Use this as a routing checklist, not as a substitute for repository-specific
instructions.

| Changed area | Primary checks |
| ------------ | -------------- |
| Routes, controllers, handlers | Authentication, authorization, validation, thin transport boundary, response and error contracts |
| Domain models and services | Invariants, ownership, state transitions, transactions, failure semantics |
| Persistence and migrations | Data safety, constraints, query shape, indexes, tenancy controls, compatibility, rollback or roll-forward intent |
| Workers, queues, and scheduled jobs | Idempotency, retries, duplicate delivery, concurrency, poison messages, observability |
| External integrations and webhooks | Trust establishment, timeouts, retries, signature validation, replay, error mapping |
| Frontend components and pages | Observable behavior, accessibility, responsive states, rendering cost, server/client boundaries |
| Hooks, stores, and state machines | Stale state, races, cancellation, cleanup, retries, derived state, cache keys |
| Shared packages and libraries | API compatibility, dependency direction, consumer impact, runtime and bundle boundaries |
| CLI and scripts | Exit codes, stdout/stderr contracts, non-interactive safety, path handling, partial failure, portability |
| Configuration and build files | Environment assumptions, secret exposure, release artifacts, compatibility, dependency scope |
| Tests and fixtures | Risk coverage, realistic setup, determinism, assertion value, failure-path coverage |
| Documentation and planning artifacts | Agreement with shipped behavior, commands, constraints, non-goals, and follow-ups |

## Correctness and architecture questions

- Does the implementation satisfy its observable contract on success, empty,
  partial-failure, retry, and invalid-input paths?
- Are new states exhaustive and reachable only through valid transitions?
- Are mutations atomic where partial completion would corrupt behavior?
- Do errors preserve the distinction callers need for retry, user feedback,
  and operator diagnosis?
- Does logic live at the repository's established ownership boundary?
- Do changed public types, schemas, flags, output formats, or APIs remain
  compatible with all known consumers?
- Do planning docs, runtime behavior, and tests describe the same feature?

## Severity

- **Request changes:** A reproducible correctness issue, contract break,
  invalid state, unsafe migration, must-level rule violation, or architecture
  choice likely to cause defects in this change.
- **Warn:** A low-risk inconsistency or cleanup that can safely wait.
