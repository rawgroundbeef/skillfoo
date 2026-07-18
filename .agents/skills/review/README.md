# Review

Run a read-only, evidence-based merge-readiness review over a branch, pull
request, commit range, working-tree diff, or selected files.

The review starts with changed behavior and nearby call sites, distinguishes
new problems from pre-existing ones, and reports only findings with a plausible
failure mode in the actual codebase.

## Review passes

1. Correctness, architecture, and repository standards
2. Security
3. Performance
4. Maintainability
5. Testing coverage

Findings are either **Request changes** or **Warn**, include precise evidence
and a smallest practical fix direction, and lead to an explicit **APPROVE** or
**REQUEST CHANGES** verdict. The skill reports fixes rather than implementing
them; its only optional write is preserving non-blocking findings in an
existing slice's follow-ups.

## Try it

```text
Use $review to check this branch for anything that should block the merge.
```

The executable workflow lives in [SKILL.md](./SKILL.md), with focused reference
passes under [`references/`](./references/).
