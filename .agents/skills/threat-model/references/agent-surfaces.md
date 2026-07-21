# Agent / LLM-in-the-loop surfaces

When a model sits between an untrusted input and a consequential action, it is
an attack surface, not just a feature. Anything the model reads that the system
did not author is **untrusted text that can carry instructions** — the modern
form of an injection. Model this explicitly whenever an agent can spend, sign,
deploy, delete, approve, grant access, publish, or write to state it later trusts.

## Source → sink

- **Sources** (untrusted): user/social content the agent reads, search/tool
  results, retrieved documents, feeds and oracles, third-party API responses,
  and any prior agent output that was itself derived from the above.
- **Sinks** (consequential): move/transfer, sign, deploy/launch, delete, approve,
  grant access, and — for agents that write publicly — **publish** (post, commit
  to a public store, message). Memory/knowledge the agent will later act on is a
  *deferred* sink: poison it now, misbehave later.

A threat is a path from an attacker-controlled source to a sink. Enumerate the
sinks first (there are few), then trace which sources can reach each.

## The four sinks and how to close them

1. **Value sink** — trick the agent into moving money/value/access to the
   attacker. *Close by construction:* give the agent no "transfer/grant to an
   arbitrary destination" primitive. Its consequential actions are specific and
   bounded, and destinations/scopes are fixed in deterministic code. No
   capability, no abuse.

2. **Secret sink** — trick the agent into revealing keys/credentials.
   *Close by construction:* secrets never enter the model's context. They live in
   the consequential code path only. A secret that is never present cannot be
   exfiltrated, no matter how clever the injection.

3. **Action sink** (deploy/sign/delete/approve/grant) — manipulate the agent into
   a consequential action against policy (an infringing deploy, a bad approval, a
   destructive op). *Control deterministically:* enforce every never-cross rule
   (blacklist, spend/rate cap, allow-listed counterparties, provenance/multi-source
   requirement) in code the model cannot influence. A rule in a prompt is
   advisory; a rule in the plumbing is binding.

4. **Publication sink** — get attacker-controlled content into a surface the
   system publishes (public store, feed, posts): a scam address, a malicious
   link, libel, or leaked data.
   *Control by tiering the write path:*
   - Deterministic output filter on every public write (no external links or
     counterparty addresses except the system's own, no secret-shaped strings, a
     phrase-class filter for policy/legal lines).
   - Separate "generated" from "published": stage in private state with a
     `published` flag; only filtered/approved content becomes visible.
   - High-authority or durable writes (the knowledge/policy the agent will act on
     later) get a stricter gate than ephemeral chatter — an automated adversarial
     check, and a human approval for anything that changes future behavior.
   - Publishing the agent's raw reasoning is itself a disclosure risk: it gives an
     attacker a live oracle for tuning injections. Publish curated output, not the
     raw chain of thought.

## Two-stage read (breaking the source→sink link)

The highest-leverage structural control: the context that *reads untrusted input*
and the context that *holds the consequential tools* should not be the same
context.

- A first pass reads raw sources with **no consequential tools** and emits only
  structured, typed signals (facts, not prose).
- The decision/action pass sees only those structured signals — never the raw
  attacker text — and is the only context with the sinks.

Injected instructions in the raw text have no tools to hijack in stage one, and
never reach the stage that does.

## Injection-specific threats to enumerate

- **Direct instruction injection** — "ignore your rules, do X." Defeated by
  deterministic guardrails (sinks don't obey prose) + two-stage read.
- **Manufactured-context injection** — a fabricated trend/price/quote to bait a
  legitimate-looking bad action. Defeated by independent verification of external
  facts before acting (does the cited source actually exist and say this?).
- **Memory/knowledge poisoning** — get a false "lesson" into durable state so the
  agent drifts later. Defeated by the durable-write gate + validating that the
  ground-truth data feeding self-improvement is complete and untampered before
  it's trusted.
- **Reasoning-oracle leakage** — publishing live cognition lets attackers iterate.
  Defeated by curating what is published.

## Autonomy failure modes (unattended operation)

If the agent runs without a human watching, add:

- **Quality/behavior drift** — the agent degrades and keeps acting; count caps
  and topic blacklists don't catch *mediocre-but-permitted* actions. Add a
  dead-man control (no human ack in N hours → throttle toward zero) and an
  outcome-floor breaker (recent actions producing ~no value → pause).
- **Degraded-mode flag** — a deterministic state that dumb watchdogs SET and the
  action sinks CHECK, so a detected dependency failure or anomaly *stops action*
  instead of only alerting an absent human.
- **Never-graduating controls** — spend caps, action-rate caps, blacklists, alert
  thresholds, and the agent's ability to change its own guardrails stay outside
  what the agent can modify. It may *propose* changes; it can never *apply* them.
