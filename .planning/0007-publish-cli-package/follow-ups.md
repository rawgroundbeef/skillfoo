# Follow-ups: Publish the skillfoo CLI package

## Bugs Discovered

- **2026-07-21 · Resolved threat-model frontmatter defect.** Dogfooding exposed
  an unquoted `: ` sequence in the shared description: skillfoo safely copied
  the skill but rendered a blank managed `AGENTS.md` summary. The source was
  corrected and pushed as `rawgroundbeef/skills@c0e28cd`, then resynced through
  `.skillfoo.yml`; the managed summary is populated and status is converged.

## Deferred Slice Ideas

- **2026-07-21 · Registry instruction provenance.** Consider signed or
  commit-pinned registries plus an explicit review/approval gate before new
  `SKILL.md` content becomes agent-readable. Current lock hashes identify bytes
  for reconciliation but do not authenticate the instruction author.
- **2026-07-21 · Bounded Git operations.** Add timeout, cancellation, and
  bounded retry behavior for clone/fetch so a malicious or unavailable registry
  cannot hang the standalone CLI. Hosted process supervision remains a caller
  responsibility for 1.0.

## Product Questions

- **2026-07-20 · Future release automation.** After the first package exists,
  consider a separate slice for npm trusted publishing with OIDC, provenance,
  protected GitHub environments, and tag/release policy. Do not let that
  optional automation block or silently publish the first release.

## Cleanup / Refactor Notes

- **2026-07-21 · Share installed-package fixture paths.** The package verifier's
  lifecycle marker assertions reconstruct the installed consumer/package paths
  owned by `installArtifact`. Extract shared path helpers if either fixture
  layout changes so rejection tests cannot inspect a stale location.
- **2026-07-21 · Legacy registry-cache cleanup.** D022 intentionally stops
  reading lossy slug-only cache directories and creates full-digest identities
  instead. Do not broadly delete unknown cache state during the 1.0 migration;
  document that legacy entries can be removed manually, and consider a later
  narrowly owned cleanup command if stale disk usage becomes material.

## Environment / Testing Notes

- **2026-07-21 · npm name remains unreserved before publication.** A private
  terminal session confirmed npm CLI readiness, and the explicit public
  registry still returned `E404` for `skillfoo`. Do not record the npm username,
  authentication output, tokens, OTPs, or `.npmrc` contents. `E404` is current
  visibility only: it neither reserves the unscoped name nor guarantees first
  publication authority, so the release runbook rechecks readiness and name
  visibility immediately before creating a tag.
- **2026-07-20 · npm cache sandbox.** Local `npm pack --dry-run --json` required
  host npm-cache access because the managed sandbox cannot write the user's npm
  cache. The rerun succeeded and did not publish. Package smoke automation must
  use an isolated temporary project/cache where needed and must not rely on
  machine-global links.
- **2026-07-20 · Existing root-metadata gap.** The ordinary status/sync
  redirect issue remains tracked in
  `../0006-intentional-local-override/follow-ups.md` and is an explicit non-goal
  of this release slice.
