# Grill

Stress-test a plan until its language, domain rules, and hard decisions are
precise enough to build against.

`grill` interviews one decision at a time, recommends an answer, and checks the
codebase before asking questions the repository can answer. It actively looks
for disagreement between the proposed design, existing code, `CONTEXT.md`, and
architecture decision records.

## What it does

- Challenges overloaded or conflicting domain terms.
- Walks concrete scenarios and edge cases through the model.
- Resolves dependencies between design decisions in sequence.
- Updates the domain glossary inline as terminology crystallizes.
- Offers an ADR only for decisions that are hard to reverse, surprising
  without context, and the result of a real trade-off.

## Try it

```text
Use $grill to challenge this plan against the domain model before I commit to it.
```

The executable workflow lives in [SKILL.md](./SKILL.md). The included
[context format](./CONTEXT-FORMAT.md) and [ADR format](./ADR-FORMAT.md) keep its
durable output consistent.
