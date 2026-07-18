---
name: review
description: Review a branch, pull request, commit range, working-tree diff, or selected files for correctness, architecture, security, performance, maintainability, and testing risks. Use when asked for a code review, final review, merge-readiness check, quality pass, risk assessment, or "anything else before merge?". Report findings without implementing fixes.
---

# Review

Run an evidence-based, read-only review of changed behavior. Do not implement
fixes. The only permitted write is recording accepted non-blocking findings in
an existing slice's `follow-ups.md` as described below.

## Establish scope

Use the scope named by the user. Otherwise infer it without stopping:

1. Review uncommitted changes when the working tree has relevant changes.
2. Otherwise review the current branch against its merge base with the
   repository's default or configured integration branch.
3. For a pull request, include its patch, review target, and relevant metadata.

State the chosen scope. Identify unrelated dirty files and exclude them. Review
changed files first, then inspect only the surrounding code, callers, tests,
configuration, and documentation needed to understand their effects.

## Gather shared context

Read once and reuse across passes:

- Repository instructions such as `AGENTS.md`, including verification gates.
- `git status --short --branch`, the diff stat, and the relevant patch.
- Planning artifacts or ADRs changed by or governing the work.
- Nearby implementations and call sites found with `rg`.
- Applicable repository skills for changed zones, when available.

Distinguish problems introduced by the reviewed diff from pre-existing issues.
Report a pre-existing issue only when the change makes it reachable, more
severe, or materially harder to fix.

## Review order

Run these passes in order:

1. **Correctness, architecture, and standards** — trace the changed behavior,
   invariants, ownership, error paths, compatibility, and repository rules. Use
   [Review by file type](./references/by-file-type.md) to route checks.
2. **Security** — inspect trust boundaries, authorization, validation, secrets,
   output safety, replay, and abuse. Read [Security](./references/security.md).
3. **Performance** — inspect hot paths, I/O, resource use, fan-out, payload
   growth, and client cost. Read [Performance](./references/performance.md).
4. **Maintainability** — inspect duplication, boundary drift, complexity,
   naming, and future change cost. Read
   [Maintainability](./references/maintainability.md).
5. **Testing** — judge coverage after the behavior and risks are understood.
   Read [Testing](./references/testing.md).

When the diff introduces or materially changes a sensitive surface—money
movement, authentication, secrets, personal data, a public endpoint, webhook,
file handling, or a privileged action—use a repository threat-model skill when
one exists and fold its concrete findings into the Security pass.

## Finding standard

Report only actionable findings supported by the diff and surrounding code.
For each finding include:

- Severity: **Request changes** or **Warn**.
- Category and a concise title.
- A precise file and line reference.
- The observed behavior and the scenario that triggers it.
- Why it matters.
- The smallest practical fix direction.

Use **Request changes** for a correctness bug, violated must-level repository
rule, security risk, likely production performance regression, meaningful
maintenance hazard, or missing coverage for high-risk behavior. Use **Warn**
for low-risk cleanup or a useful follow-up that should not block this change.

Do not report speculative risks, style preferences, or generic best practices
without a plausible failure mode in this codebase. Deduplicate exact repeats;
when one issue crosses categories, keep one primary finding and note the
secondary impact.

## Verification

Run the repository's required checks when feasible and proportionate to the
scope. Start with focused tests for changed behavior, then broader lint, type,
test, or build gates required by repository instructions. Review is still
read-only even when a command generates ignored caches or build output.

Record each command and result. If a command cannot run, state the exact
environmental blocker and the residual risk; do not imply it passed.

## Durable follow-ups

If the branch clearly belongs to an existing `.planning/{NNNN-slug}/` slice,
append each Warn-level finding not recommended for this change to that slice's
`follow-ups.md`. Use a dated `## Code Review Follow-ups` section with the file
path, one-line risk, and smallest fix. Cross-reference existing items instead
of duplicating them.

Do not create a slice or guess between multiple candidates. When no associated
slice can be identified, keep warnings in the report and say they were not
recorded durably.

## Output

Lead with findings, ordered by severity and then category. Omit empty warning
sections.

```markdown
## Review — {scope}

**Scope:** {N files} · **Concerns:** {changed areas}

### Request changes

- **[Category] Title** — `path/file.ts:line`
  {Observed behavior, impact, and smallest fix direction.}

### Warn

- **[Category] Title** — `path/file.ts:line`
  {Low-risk concern and smallest follow-up.}

Recorded in `.planning/{NNNN-slug}/follow-ups.md`.

### Verification

| Command | Result |
| ------- | ------ |
| ...     | pass / fail / blocked |

### Verdict

APPROVE | REQUEST CHANGES
```

When there are no findings, say so explicitly, summarize the behavior and risk
surfaces inspected, list verification results, and return **APPROVE**. Do not
use **APPROVE** when any Request changes finding remains.
