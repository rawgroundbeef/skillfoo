# ⚔️ Slice

Turn a rough feature idea into a vertical slice another agent can implement
from a clean context without guessing what everyone meant.

`slice` is the planning pipeline I use when a feature deserves more than an
ad-hoc checklist. It forces the problem, language, user-visible behavior,
technical decisions, and handoff to agree before implementation begins.

## The pipeline

1. **Establish scope** — start from the integration branch, name the slice, and
   create a numbered `.planning/{NNNN-slug}/` home.
2. **Grill the idea** — challenge terminology, constraints, domain rules,
   alternatives, and non-goals against the actual codebase.
3. **Write UAT first** — describe the outside-in workflow a human will use to
   decide whether the slice works.
4. **Stop for alignment** — require explicit human approval of the UAT before
   hardening the implementation plan.
5. **Write the PRD** — ground scope and technical decisions in the approved
   behavior, discovery evidence, and repository boundaries.
6. **Build the bootstrap** — produce a compact cold-start prompt that points a
   fresh agent at the durable artifacts in the right order.
7. **Attack the plan** — run an adversarial cold read, repair contradictions at
   their source, and report whether the handoff really passes.
8. **Implement fresh** — clear context and execute from the documents, not from
   memory of the planning conversation.
9. **Review the implementation** — send the finished diff to a fresh `$review`
   subagent, address blocking findings, rerun verification, and repeat until the
   reviewer approves.

## What it leaves behind

| Artifact | Job |
| -------- | --- |
| `discovery.md` | Problem framing, evidence, vocabulary, constraints, and open questions |
| `decisions.md` | Chosen trade-offs, rejected alternatives, and links to durable ADRs |
| `uat.md` | The human-approved, user-visible acceptance contract |
| `prd.md` | Product scope, implementation decisions, acceptance, and non-goals |
| `bootstrap.md` | The fresh-context implementation entrypoint |
| `follow-ups.md` | Bugs, deferred slices, product questions, cleanup, and environment notes |
| `mock/` | Optional visual evidence that would otherwise disappear with the planning session |

## The hard gates

- UAT is written before the PRD and approved by a human.
- Planning artifacts are the source of truth once they exist.
- Adversarial review must stop producing blocking findings before handoff.
- The planning session stops after reporting that pass; implementation begins
  in a fresh context.
- If the cold-start documents are insufficient, fix the documents instead of
  leaning on remembered conversation.
- Implementation is not ready for handoff until repository checks pass and a
  fresh `$review` pass approves the final diff.

Those gates are the point. The skill is trying to prevent a smooth planning
conversation from masquerading as a durable shared understanding.

## Try it

```text
Use $slice to shape this feature into a vertical slice before we implement it.
```

Or hand it a kickoff brief, issue, rough requirements, or an existing PRD and
let it recover the missing discovery and decisions from the repository.

The executable workflow lives in [SKILL.md](./SKILL.md). It composes naturally
with [`grill`](../grill/), [`uat`](../uat/), [`prd`](../prd/), and
[`review`](../review/).
