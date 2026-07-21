---
name: threat-model
description: >-
  Threat-models a system, feature, or attack surface from first principles —
  assets, actors, and the paths from untrusted input to consequential action —
  then ranks risks and recommends controls worst-first, pushing each catastrophic
  outcome toward impossible-by-construction. Strongest where a failure is hard
  to reverse: moving money or value, handling keys/secrets, granting access,
  taking autonomous/agent actions, deleting or publishing. Use when designing
  something sensitive, evaluating a new attack surface, hardening a
  consequential flow, or asked "what could go wrong and who could cause it."
---

# Threat Model

Structured, adversarial "what could go wrong and who could cause it." Reason from
first principles about how a system breaks, rank by impact × likelihood, and
recommend controls worst-first — always stating the residual risk that remains.

The method is domain-agnostic. It bites hardest on surfaces where a failure is
**hard to reverse or contain**: money and on-chain actions, key/secret handling,
access and privilege grants, autonomous/agent actions, destructive operations,
and anything published. Those are recurring examples below, not the scope.

## Activation triggers
- "threat model this", a new sensitive feature or attack surface
- "what could go wrong / who could attack this"
- before shipping anything that touches money, keys, auth, access, or PII
- an autonomous or agentic flow that can spend, sign, delete, publish, or grant

## Methodology

1. **Assets.** What is valuable or consequential to protect: funds and positions;
   keys, credentials, and secrets; PII and confidential data; the integrity of
   records; availability of the critical path; access and authority; and — for
   anything published — reputation and legal standing.
2. **Actors.** External attacker, malicious insider, compromised account,
   compromised dependency (a library, service, feed, or model), and — for any
   system that reads input it did not author — **untrusted input as an actor.**
   Assume every input the system did not produce is potentially adversarial.
3. **Map source → sink.** The productive move: enumerate the **sinks** — the
   actions with real consequence (move/transfer, sign, deploy/launch, delete,
   grant access, approve, publish) — and the **sources** — every input that can
   reach a sink (request params, webhooks, feeds, files, user content, third-party
   responses, and any text a model reads). A threat is a path from an
   attacker-controlled source to a sink. There are usually few sinks; start there.
4. **Prevent-by-construction test.** Before writing mitigations, ask of each
   catastrophic outcome: *is it possible at all?* The strongest control is an
   outcome that cannot happen — see the invariant test below. Classify each as
   prevented-by-construction, mitigated, or accepted, and push toward the first.
5. **Completeness pass.** Walk the six classic categories so no class is missed —
   spoofing, tampering, repudiation, information disclosure, denial of service,
   elevation of privilege (the STRIDE checklist). Definitions, examples, and
   mitigations: [`references/checklist.md`](references/checklist.md). This is a
   backstop, not the spine — the source→sink and prevent-by-construction work is.
6. **Agent-in-the-loop lens.** If a model/agent sits between a source and a sink,
   run [`references/agent-surfaces.md`](references/agent-surfaces.md): prompt
   injection, secret exfiltration, memory/knowledge poisoning, the publication
   sink, and unattended-autonomy failure modes.
7. **Rank** each real threat by impact × likelihood, weighting *irreversibility*
   up — a signed transaction, a deletion, or a public post can't be rolled back
   like a database row.
8. **Control per threat, worst-first.** Prefer deterministic controls in code the
   attacker (or the model) cannot influence over controls that depend on a
   component behaving. State the residual risk that remains after each.

## The invariant test

Check whether each catastrophic outcome is *possible by construction* before
reaching for mitigations. An outcome that cannot happen needs no control:

- **Secrets never enter a context that can be exfiltrated.** Keys and credentials
  live only where the consequential code runs — never in logs, error output, a
  model's context, or a published surface. A secret that is never present cannot
  leak, which beats scanning output for it.
- **No capability = no abuse.** If a dangerous primitive doesn't exist (an
  arbitrary-destination transfer, an unbounded delete, a raw-SQL path), no input
  can trigger it. Grant only the specific, bounded actions the job needs;
  fix destinations and scopes in code.
- **Enforce guardrails outside the influenceable component.** Caps, allow-lists,
  blacklists, and rate limits enforced in deterministic code hold even if a
  model is manipulated or an upstream is compromised; the same rule as a prompt
  or a client-side check does not.
- **Bound the blast radius.** The online/hot authority holds a small amount; the
  bulk of value or power sits behind a separate, offline authority. One
  compromise loses the float, not the whole.

## Output

```
## threat-model — <surface>
**Assets:** <list>
**Actors:** <list>
**Sinks:** <consequential actions>   **Sources:** <untrusted inputs>

### Threats (ranked, impact × likelihood)
1. [HIGH] <threat> — <source → sink path>
   - Path: <how an attacker gets from source to sink>
   - Control: <mitigation; note if deterministic/outside-model or dependent>
   - Class: prevented-by-construction | mitigated | accepted
   - Residual: <what still remains>
```

Separate confirmed exposure from theoretical. Note where a control is missing vs.
present-but-weak, and flag every guardrail that lives only in a prompt or a
client the attacker controls.
