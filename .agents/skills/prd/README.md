# PRD

Turn a feature conversation and the current codebase into a product
requirements document with explicit scope and implementation decisions.

The skill synthesizes known context, asks only the missing product questions,
explores existing patterns, sketches the modules involved, and confirms that
shape before writing the full PRD.

## What it produces

- A user-centered problem statement and solution.
- Detailed user stories covering happy paths, edge cases, errors, and
  accessibility.
- Architecture, data flow, schema, API, and integration decisions with
  rationale.
- Testing decisions, explicit non-goals, and honest open questions.

## Try it

```text
Use $prd to scope this feature and write a PRD grounded in the existing codebase.
```

The executable workflow and document template live in [SKILL.md](./SKILL.md).
