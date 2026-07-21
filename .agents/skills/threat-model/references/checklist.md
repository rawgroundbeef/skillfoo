# Threat categories — definitions, examples, mitigations

A completeness checklist so no threat class is missed. Walk each against the
surface after the source→sink and prevent-by-construction work — this is the
backstop that catches a category you didn't think of, not the primary method.
These six are the classic STRIDE categories; the labels matter less than the
coverage. Examples span money, data, access, and agent surfaces.

---

**Spoofing** (pretending to be someone/something else)
- Examples: a forged webhook claiming to be a trusted partner; a fabricated
  price/oracle/data feed; a spoofed upstream response driving a downstream
  action; a stolen session token; an account impersonating a verified person; an
  API caller faking identity.
- Mitigations: strong authentication; MFA; cryptographically signed requests
  (HMAC / signing secrets — verify the raw body, not a re-serialized copy); mTLS
  between services; short-lived tokens; verify external facts against an
  independent source before acting on them. Bind account identity to a verified
  human out-of-band — a channel authenticates the *account*, never its *intent*.

**Tampering** (altering data in transit or at rest)
- Examples: changing an amount or a destination in flight; editing a stored
  balance or record directly; altering an audit log; mutating metadata; poisoning
  the state an autonomous system later learns from.
- Mitigations: TLS in transit; integrity checks / signatures; DB constraints and
  permissions so records can't be edited out of band; append-only logs
  (compensating entries, never edits); pin destinations/scopes in code so a data
  change can't redirect an action; treat any state derived from untrusted input
  as tainted until validated.

**Repudiation** (doing something and denying it, with no proof otherwise)
- Examples: a privileged action (by a human or an agent) with no record of
  who/what/when; a disputed action you can't evidence.
- Mitigations: append-only audit log of every privileged/consequential action —
  actor, inputs, decision, outcome; tamper-evident logs; signed operations; for
  agent actions, log the decision record and the source signals that drove it.

**Information disclosure** (seeing what you shouldn't)
- Examples: an endpoint returns another user's data (IDOR); secrets in
  logs/errors; a key or credential reaching a prompt, a log, or a published
  surface; PII over-exposed; cross-tenant leakage.
- Mitigations: authorization at the resource; least privilege; encrypt sensitive
  data; scrub secrets/PII from logs and error output; row-level security. Keep
  secrets out of any context that can be exfiltrated — absence beats redaction.

**Denial of service** (making it unavailable)
- Examples: flooding an expensive endpoint; unbounded query/complexity; resource
  exhaustion; a retry storm; a dependency outage that silently degrades a
  critical path; draining the resource (gas, float, quota) a flow needs to run.
- Mitigations: rate limits and quotas; backoff + jitter on retries; input
  size/complexity bounds; circuit breakers; autoscaling with caps; detect
  degraded dependencies and fail safe (stop acting) rather than acting on stale
  or empty data; keep critical resources funded with alerting before exhaustion.

**Elevation of privilege** (gaining rights beyond your role)
- Examples: a normal user reaches an admin function; mass assignment sets
  `isAdmin`; a low-tier key performs a high-tier action; **untrusted input steers
  an agent into a consequential action it should not take** (prompt injection is
  an EoP against an agent's tools); a forged approval passes an allowlist.
- Mitigations: deny by default; authorization checks at every privileged action;
  least privilege per role/key; tier operations by blast radius; step-up auth and
  multi-party approval for the most sensitive; for agents, enforce the
  consequential-action guardrails in deterministic code outside the model (see
  `agent-surfaces.md`).

---

# Ranking guide (impact × likelihood)
- Impact: money/value loss, key compromise, auth bypass, mass data exposure, or
  an irreversible action = high; single-record / cosmetic = low.
- Likelihood: reachable by an unauthenticated external actor, or by untrusted
  input that already flows into the system = high; requires insider + physical
  access = low.
- Rank = the product. Fix high-impact-high-likelihood first; document accepted
  residual risk for the rest. Weight *irreversibility* up — a signed transaction,
  a deletion, or a public post can't be rolled back like a database row.
