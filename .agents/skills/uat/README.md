# UAT

Write a concise manual acceptance plan that proves a feature works from the
user's point of view.

`uat` turns requirements, planning artifacts, a diff, branch, pull request, or
working implementation into a test script a human can run during review or a
demo. It centers observable behavior and separates intended limitations from
actual failures.

## What it captures

- The actor, entrypoint, environment, and exact setup.
- One end-to-end happy path.
- Relevant authorization, validation, ownership, failure, and non-goal
  guardrails.
- Durable side effects and persistence or revisit behavior.
- Optional observability checks when user-visible behavior cannot prove a
  hidden effect by itself.
- One decisive pass criterion for demo readiness.

## Try it

```text
Use $uat to write a manual acceptance plan for this branch.
```

`uat` also serves as the human-alignment gate inside [⚔️ `slice`](../slice/):
the acceptance plan is approved before the PRD and implementation handoff are
allowed to harden.

The executable workflow lives in [SKILL.md](./SKILL.md).
