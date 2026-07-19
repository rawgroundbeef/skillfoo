# Follow-ups: Intentional Local Override

Date: 2026-07-18

## Bugs Discovered

- **2026-07-18 · Non-resolver root metadata redirects.** Slice 0006 hardens
  `.skillfoo.yml`, `.skillfoo.lock`, and `AGENTS.md` inside the targeted
  resolver transaction because they are mutation evidence. Ordinary
  status/sync paths still follow existing root-metadata behavior. Design their
  compatibility and public-error contract before applying the same rule to
  every command; do not expand the resolver fix into an undocumented global
  behavior change.

## Deferred Slice Ideas

- **2026-07-18 · Registry promotion.** Add the third M2/M5 outcome as an
  explicit git-native workflow that commits local edits in the source registry
  and crosses repository boundaries deliberately; do not make the consumer
  resolver mutate a remote source implicitly.
- **2026-07-18 · Proactive Override management.** If real usage demands it, add
  a supported CLI policy-management workflow for creating an Override before a
  local-change Conflict exists. This slice honors valid manual config but keeps
  resolver creation conflict-driven.
- **2026-07-18 · Other destructive resolutions.** Separately design Bespoke
  adoption/replacement, unsafe emitted-shape replacement, foreign-adapter
  replacement, and force removal around their distinct ownership proofs.
- **2026-07-18 · Selection management.** Add a supported command for changing
  Desired skills and resolving selection/Override contradictions without
  hand-editing `.skillfoo.yml`.
- **2026-07-18 · Crash recovery.** If real-world failures justify it, design a
  durable transaction journal, fsync policy, restart-time discovery, and
  explicit recovery/cleanup command for interrupted resolution processes.

## Product Questions

- _(none deferred)_

## Cleanup / Refactor Notes

- **2026-07-18 · Repeated registry walks.** Reconciliation still walks registry
  skill directories repeatedly for hashes, counts, staging, and writes. Keep
  this a cold-path cleanup unless implementation exposes a correctness reason
  to centralize immutable catalog evidence.
- **2026-07-18 · Config document mutation seam.** Keep the document-aware YAML
  compare-and-set narrow for this slice. Generalize it only after a second
  config-mutating command proves the reusable API shape.

## Environment / Testing Notes

- **2026-07-18 · Disposable consumer UAT.** Run the approved UAT in a separate
  temporary Git repository with a sibling local registry; do not run resolver
  mutation scenarios in the skillfoo repository.
- **2026-07-18 · POSIX permission injection.** The manual read-only-AGENTS.md
  rollback check is environment-dependent. If the local environment does not
  enforce the failure, rely on deterministic injected command-service tests
  and report the manual scenario as not exercised.
- **2026-07-18 · Cross-platform filesystem coverage.** CI must retain Node
  22/24 coverage on Linux, macOS, and Windows for YAML replacement, junction or
  symlink safety, adapters, rollback, and compiled process behavior.
