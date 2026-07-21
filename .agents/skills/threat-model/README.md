# threat-model

A first-principles threat model for any system, feature, or attack surface —
strongest where a failure is hard to reverse or contain: moving money or value,
handling keys and secrets, granting access, taking autonomous/agent actions,
deleting, or publishing.

Rather than starting from a checklist, it reasons from **source → sink**:
enumerate the actions with real consequence (transfer, sign, deploy, delete,
grant, publish), enumerate the untrusted inputs that can reach them, and trace the
paths between. It ranks threats by impact × likelihood (weighting irreversibility)
and recommends controls worst-first, always stating the residual risk.

The distinctive part is the **invariant test**: for each catastrophic outcome, ask
whether it is possible *at all*, and push it toward *prevented by construction* —
secrets that never enter an exfiltratable context, capabilities that simply don't
exist to be abused, guardrails enforced in code the attacker can't influence, and
blast radius bounded to a small float. The classic STRIDE categories are kept as an
optional completeness backstop, not the spine. For systems with a model in the loop,
a dedicated lens covers prompt injection, secret exfiltration, memory poisoning,
the publication sink, and unattended-autonomy failure modes.

- [`SKILL.md`](./SKILL.md) — the agent workflow.
- [`references/checklist.md`](./references/checklist.md) — the six threat
  categories (the STRIDE backstop) with examples, mitigations, and the ranking
  guide.
- [`references/agent-surfaces.md`](./references/agent-surfaces.md) — the
  source→sink model, the four sinks and how to close each, the two-stage read,
  injection threats, and autonomy failure modes.

## Use it

```text
Use $threat-model on this flow before we build it.
```

Point it at a feature, an endpoint, a critical path, or an autonomous agent that
can spend, sign, deploy, delete, grant, or publish.
