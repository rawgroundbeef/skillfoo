---
name: uat
description: Create concise, executable manual user-acceptance test plans from requirements, planning artifacts, a diff, branch, pull request, or working implementation. Use when asked for UAT, a manual QA script, demo validation, smoke testing, acceptance testing, or "how should I test this?". Focus on observable user behavior, durable side effects, guardrails, environment setup, and one demo-ready pass criterion.
---

# UAT

Write a manual test script a human can execute in the real application. Prefer
observable behavior over implementation explanation, distinguish accepted
limitations from failures, and never imply an environment-dependent check ran
when it did not.

## Gather scope

1. Read repository instructions such as `AGENTS.md` and their safety rules.
2. Check `git status --short --branch` and identify the requirement, planning
   artifact, diff, branch, pull request, or implementation under test.
3. When an associated `.planning/{NNNN-feature-slug}/` slice exists, read its
   `discovery.md`, `decisions.md`, and `prd.md` when present. Reuse its
   `uat.md`; do not create a competing plan.
4. Inspect changed files and the smallest surrounding routes, interfaces,
   services, and tests needed to recover the user path. Use `rg` for discovery.
5. Separate repository-observed facts, user-provided facts, and assumptions
   that still need confirmation.

When invoked by `$slice`, use the slice directory and return control after the
UAT is written; `$slice` owns the explicit human-approval gate before PRD work.
For standalone UAT with no existing slice, follow repository conventions or
write `uat-{feature-slug}.md` at the project root unless the user names a path.

## Identify the acceptance surface

Define these before writing scenarios:

- **Actor:** Who performs the workflow and what permissions or starting state
  they have.
- **Entrypoint:** The exact page, command, endpoint, device, or integration from
  which the workflow begins.
- **Visible outcome:** What the user can observe that proves the behavior works.
- **Durable effects:** Records, files, messages, jobs, external state, or the
  explicit absence of a write.
- **Environment:** Required services, accounts, fixtures, feature flags,
  credentials, sample data, and platform constraints.
- **Pass criterion:** One short statement that makes the change demo-ready.

Do not expose secrets in the plan. Prefer a local, test, sandbox, or staging
environment. Never require destructive production actions merely to prove UAT.

## Build the scenario set

Keep the plan short enough to run during a review or demo while covering the
risk actually introduced by the change.

1. Include one happy path that proves the primary user outcome end to end.
2. Add only relevant guardrails: authorization, ownership, validation,
   duplicate action, partial failure, explicit non-goals, or other risky edges.
3. Add reload, navigation, restart, or revisit checks when state should persist.
4. Add accessibility, responsive, platform, or non-interactive checks when the
   change touches those contracts.
5. Add network, log, database, queue, storage, or external-system observations
   only when they prove a hidden side effect or help diagnose the user path.
6. Use exact URLs, commands, prompts, payloads, filenames, accounts, and sample
   values when known. Never invent credentials or unsupported setup.

Do not turn UAT into a regression suite for unrelated areas. Prefer the
cheapest user-visible proof; do not require internal inspection when the public
behavior already establishes the acceptance criterion.

## Write the plan

Use imperative steps and place expected results directly under each scenario.
Make actions reproducible by someone who did not participate in planning.
Call out non-goals so intended omissions are not reported as bugs.

Use this structure, omitting only sections that truly do not apply:

```markdown
# UAT: {Feature Name}

**Goal:** {One sentence describing the user-visible outcome.}

## Prerequisites

- {Branch, pull request, build, or deployment under test}
- {Required services, account state, flags, fixtures, or sample files}

## Happy Path

1. {User action}
2. {User action}

Expected:

- {Observable result}
- {Durable side effect or explicit no-op}

## Guardrails

### {Risk or boundary}

1. {Action that exercises the boundary}

Expected:

- {What happens}
- {What must not happen}

## Persistence / Revisit

1. {Refresh, navigate away, restart, or reopen}

Expected:

- {State persists or intentionally resets}

## Observability

- {Optional network, log, database, queue, storage, or external check}

## Known Non-Goals

- {Behavior intentionally outside this change}

## Not Tested

- {Environment-dependent or unavailable check and its residual risk}

## Pass Criteria

- {One decisive statement that makes the change demo-ready}
```

## Preserve discoveries

When UAT belongs to a slice, record bugs, deferred work, product questions,
cleanup, and environment notes in that slice's `follow-ups.md` rather than
letting them live only in the test conversation. Cross-reference existing
items instead of duplicating them.

Do not silently expand scope or implement fixes while writing the plan. If the
UAT reveals a mismatch with discovery, decisions, or the PRD, report the
contradiction and repair the upstream artifact that is wrong before treating
the acceptance plan as stable.
