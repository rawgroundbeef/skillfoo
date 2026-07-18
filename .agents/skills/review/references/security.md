# Security review

Review changed behavior for concrete security risk. Report only issues with a
plausible attack or abuse path in the repository's actual deployment model.

## Workflow

1. Trace each changed entrypoint to reads, privileged actions, and outputs.
2. Mark each trust boundary and identify who controls the input.
3. Inspect the smallest surrounding code needed to verify guards, ownership,
   validation, and safe handling.
4. Describe a realistic exploit or abuse scenario before raising a finding.

## Checklist

- **Authentication:** Establish identity server-side through trusted project
  mechanisms. Do not trust caller-provided identity.
- **Authorization and isolation:** Check ownership, role, tenant, and resource
  scope before reads and mutations, including indirect object references.
- **Input validation:** Parse bodies, parameters, headers, messages, file
  metadata, and worker payloads before use; reject unsupported forms.
- **Injection:** Check database, shell, template, path, URL, header, and log
  construction where untrusted values cross interpreter boundaries.
- **Files and paths:** Enforce size and type limits, safe names and paths,
  archive boundaries, storage-key ownership, and safe temporary-file handling.
- **Secrets and privacy:** Keep credentials, tokens, cookies, signed URLs,
  personal data, and sensitive errors out of clients, logs, traces, and output.
- **Output safety:** Treat rendered markup, Markdown, filenames, external
  content, and tool output as untrusted.
- **External requests:** Constrain user-influenced destinations, redirects,
  schemes, and hosts; consider SSRF and local-network access.
- **State changes and replay:** Check method semantics, CSRF assumptions,
  idempotency, duplicate delivery, races, and replay resistance.
- **Abuse and cost:** Bound unauthenticated or user-triggered expensive work
  with limits, quotas, pagination, queueing, or rate controls.
- **Dependencies and configuration:** Check new privilege, exposed services,
  unsafe defaults, dependency confusion, and production debug settings.

## Severity

- **Critical:** Direct authentication bypass, broad sensitive-data exposure,
  credential leak, remote code execution, or destructive unauthorized action.
- **High:** Realistic isolation failure, exploitable injection, sensitive leak,
  or practical production abuse path.
- **Medium:** Meaningful weakening of a security control, scoped exposure,
  replay, or denial-of-service risk.
- **Low:** Narrow hardening opportunity with limited impact.

Critical through Medium findings normally request changes. Low findings may be
Warn-level when the current change does not materially increase exposure.

For each finding, include severity, file and line, trust boundary, concrete
risk, exploit or abuse path, and the smallest practical fix. If none are found,
name the trust boundaries checked.
