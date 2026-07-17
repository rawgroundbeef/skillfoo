# Planning

This directory is the engineering design record for skillfoo. Each change of any
size gets a numbered slice folder holding the thinking behind it — the problem,
the decisions and their rejected alternatives, the acceptance criteria, and the
implementation plan.

These artifacts are produced with skillfoo's own `slice` pipeline (`slice` →
`grill` → `uat` → `prd` → bootstrap → review). We plan skillfoo the way we expect
skillfoo's users to plan: it's dogfooding, and it doubles as a worked example of
the pipeline on a real codebase.

## Layout

```
.planning/
└── NNNN-slug/            one folder per slice, numbered in the order they happened
    ├── discovery.md      the problem, refined; domain terms; non-goals; code evidence
    ├── decisions.md      choices made, with rationale and rejected alternatives
    ├── uat.md            outside-in acceptance: what you can observe when it works
    ├── prd.md            the implementation spec, grounded in the above
    ├── bootstrap.md      the cold-start prompt to implement the slice
    └── follow-ups.md     real findings deferred out of this slice
```

The number belongs to the slice, not to any single PR — a slice that spans
multiple PRs keeps one number.

## Scope

Keep these docs **technical**. They're about how the software works and why it's
built the way it is: design, trade-offs, acceptance, implementation. That focus is
what makes the directory a high-signal reference for contributors.

Product and business material — positioning, pricing, commercial roadmap — is out
of scope here and lives with the maintainers. It's a separation of concerns, not a
place to look: this folder is the design history of the code, and nothing else.
