# Threat model: Publish the skillfoo CLI package

**Date:** 2026-07-21
**Status:** Applied to the approved slice

## Surface

**Assets:** The unscoped `skillfoo` npm name; the identity and integrity of
`skillfoo@1.0.0`; GitHub/npm release authority; credentials and local paths;
the documented process/schema contract; consumer repositories; downstream
agent behavior; maintainer reputation.

**Actors:** A package-name squatter; an external attacker; a compromised npm,
GitHub, registry, or maintainer account; a malicious or compromised skills
registry; a compromised dependency; adversarial consumer configuration or Git
output; untrusted repository/PR/tool text read by an agent; maintainer error.

**Sinks:** Creating a Git tag or GitHub release; publishing an npm package;
writing registry content into a consumer and its agent index; exposing data on
stdout/stderr or in caches; and causing a hosted consumer to act on status JSON.

**Sources:** `.skillfoo.yml`, registry repositories and Git diagnostics,
package source/lock/dependencies/lifecycle output, npm/GitHub responses and
local client state, repository/PR/user text, and human release inputs.

## Threats (ranked, impact × likelihood)

1. **[HIGH] An agent or maintainer publishes the wrong or unauthorized public
   artifact** — untrusted instructions or ambiguous release state reach the
   tag/release/npm sinks.
   - **Path:** Repository, PR, user, or tool text → agent/human decision → tag,
     release, or publication with the wrong commit, version, package, or file.
   - **Control:** Planning, implementation, CI, review, and artifact verification
     contain no npm credential or public-write capability. A no-write context
     builds and fully verifies one retained tarball, then emits a structured
     manifest binding commit, intended tag, package/version, path, hashes,
     integrity, and results. The human authorizes those exact identities and
     actions. A fresh narrow context can apply only the approved tag/draft
     release; the human publishes the unchanged file. After isolated public
     verification, the operator reports and stops on the exact still-draft
     GitHub release identifier/URL. A second explicit authorization and a new
     narrow identity check are required to make only that draft public.
   - **Class:** Mitigated.
   - **Residual:** A compromised GitHub/npm account, mistaken human approval,
     or malicious already-approved commit can still publish bad state. The
     first release has no signed tag, npm provenance, or multi-party approval.

2. **[HIGH · confirmed exposure] Registry credentials or attacker-controlled
   terminal data leak through process output** — registry config/Git output
   reaches stdout, stderr, logs, or an agent context.
   - **Path:** Credential-bearing URL, control characters, or malicious remote
     diagnostic → status JSON, progress/error rendering, or cache naming →
     captured output or terminal interpretation.
   - **Control:** Before config creation, output, network, or mutation, reject
     forbidden URL userinfo/query/fragment components and all registry-source
     control characters. Use parsed source classification rather than a loose
     prefix check. Never echo a rejected value. Derive accepted progress labels
     safely. Raw Git/helper/remote stderr is discarded rather than redacted;
     registry output is chosen from fixed non-interpolated lines of at most 160
     UTF-8 bytes excluding newline. Private Git authentication remains out of
     band. Tests use sentinels and prove no stream/new-state disclosure or
     pre-rejection side effect.
   - **Class:** Prevented by construction for embedded config secrets and raw
     Git diagnostics after the release change.
   - **Residual:** Fixed diagnostics lose low-level troubleshooting detail, and
     unexpected disclosure remains possible outside skillfoo's controlled
     streams. Release builds and agent contexts therefore remain credential-free.

3. **[HIGH · confirmed design boundary] A compromised registry poisons agent
   instructions** — registry authority reaches managed skill files and the
   agent index.
   - **Path:** Malicious/compromised configured registry → explicit `sync` →
     committed `SKILL.md` content → an agent with consequential tools follows
     attacker-authored instructions.
   - **Control:** Document that a configured registry is a trusted instruction
     authority, not sandboxed content. The CLI never executes skill text, uses
     path/ownership guards, exposes status before sync, and records content
     hashes for reconciliation. This release adds no hosted or automatic sync.
     Users review and trust registry changes before applying/committing them.
   - **Class:** Accepted design risk with mitigations.
   - **Residual:** Lock hashes detect content identity, not author authenticity;
     compromise of the selected registry authority can still deliver malicious
     instructions. Signed/pinned registry provenance and approval gates require
     a separate slice.

4. **[HIGH · confirmed exposure] A colliding cache substitutes a different
   registry's agent instructions** — configured source identity reaches a lossy
   shared cache directory without origin verification.
   - **Path:** Attacker-controlled registry URL primes a cache slug also produced
     by a trusted URL → later trusted status/sync reuses the attacker's `.git`
     directory → wrong `SKILL.md` catalog reaches consumer/agent decisions.
   - **Control:** Derive cache identity from the full SHA-256 of the exact
     normalized clone URL after deterministic shorthand expansion. Never reuse
     legacy slug-only caches. Before every reuse, normalize and compare the
     cached Git `origin`; missing/mismatch evidence causes that hashed directory
     alone to be re-cloned and verified before its catalog is read. Output stays
     on the fixed non-interpolated registry allowlist. Regression acceptance
     pre-seeds a valid wrong legacy cache and proves it remains byte-identical
     and cannot influence either colliding configured source.
   - **Class:** Prevented by construction for practical URL collisions;
     mitigated for local cache tampering.
   - **Residual:** A same-user local attacker able to rewrite cache and Git state
     between origin verification and catalog read may still race the process;
     local-account compromise is outside registry-authenticity guarantees.

5. **[HIGH] Reviewed source and the public npm bytes diverge** — tampering,
   stale build output, cache/config state, or operator error reaches publish.
   - **Path:** Dirty/wrong checkout, changed lockfile/dependency, rebuilt
     tarball, registry override, or local/global package → npm publication.
   - **Control:** Commit and review the complete range; build clean output once
     from the exact merged commit that will be tagged; fully verify the retained
     supplied tarball; record it in the release manifest; prohibit repacking;
     recompute/match SHA-256, npm shasum, and npm integrity immediately before
     both draft-release attachment and human npm publication; then verify
     through the explicit public registry with isolated config/cache.
   - **Class:** Mitigated.
   - **Residual:** The first release has no cryptographic provenance chain, and
     compromise of npm/GitHub or the release machine remains possible.

6. **[HIGH impact, MEDIUM likelihood] Another account claims the unscoped npm
   name before first publication** — public intent and elapsed release time
   reach npm's first-publisher namespace decision.
   - **Path:** Public repository/PR or independent discovery → name squatter →
     `skillfoo` is unavailable when the approved tarball is ready.
   - **Control:** Privately establish human account/2FA/public-package readiness
     before tagging, recheck the explicit public registry immediately before
     irreversible actions, minimize the tag-to-publish interval, and stop on
     any conflict. Do not treat `E404` as ownership or publish a placeholder.
   - **Class:** Accepted until legitimate first publication.
   - **Residual:** The name is not reserved and can still be claimed at any time
     before npm accepts `skillfoo@1.0.0`.

7. **[MEDIUM] A compromised dependency or lifecycle executes during release
   preparation** — lock/package input reaches the build machine.
   - **Path:** Malicious dependency/lock change or package lifecycle → `npm ci`,
     build, pack, or temporary install → filesystem/network access.
   - **Control:** Add no dependencies, review the complete lock diff, use
     lockfile installs, build without release credentials, keep the payload
     allowlisted, and verify in disposable paths with isolated npm state.
   - **Class:** Mitigated.
   - **Residual:** Lock integrity does not protect against compromise of an
     already-approved dependency or the package registry itself.

8. **[MEDIUM] A hosted consumer misinterprets output and takes an unsafe action**
   — malformed/unknown output reaches hosted decision logic.
   - **Path:** Changed schema, mixed prose/JSON, ambiguous exit, or unstable
     ordering → consumer treats attention/failure as safe reconciliation.
   - **Control:** One JSON document on stdout, diagnostics on stderr, explicit
     `0`/`1`/`2`/`3` meanings, exact deterministic array comparator, complete
     document parsing, and mandatory rejection of unknown schema versions.
   - **Class:** Mitigated.
   - **Residual:** Consumer bugs and unsupported assumptions about JSON
     formatting remain outside the package's control.

9. **[MEDIUM] A remote registry stalls or exhausts the process** — an
   unavailable/malicious Git source reaches synchronous Git operations.
   - **Path:** `status`, `sync`, or `resolve` → clone/fetch without a CLI timeout
     → hung automation or resource use.
   - **Control:** This release documents Git-backed network/cache effects and
     leaves hosted process timeout/cancellation to the caller, as explicitly
     scoped by the kickoff non-goals.
   - **Class:** Accepted for this release.
   - **Residual:** The standalone CLI has no bounded Git-operation timeout;
     cancellation/backoff is a future hardening slice.

## Prevent-by-construction invariants

- npm credentials, OTPs, and user `.npmrc` contents never enter repository,
  agent, build, CI, artifact, or public-verification context.
- No tag, release, or publication workflow/script exists in release readiness;
  a no-public-write context must emit an exact release manifest before the
  human can authorize a separate narrow tag/draft context. Making the verified
  draft public is a later distinct sink that requires authorization naming the
  exact draft identifier/URL and another fresh narrow context.
- Rejected registry secrets/control data cannot reach output, network, caches,
  or consumer files.
- The human publishes the exact already-built and fully tested manifest-bound
  artifact; both public artifact sinks revalidate all approved hashes, and
  neither execution nor authenticated terminal repacks it.
- Unknown machine-schema versions are rejected before their data is interpreted.

## STRIDE completeness result

- **Spoofing:** npm/GitHub/registry authority and package-name ownership are the
  primary identity boundaries; private human readiness, exact tag/version, and
  public metadata verification mitigate them.
- **Tampering:** committed-range review, lock integrity, clean commit-bound
  once-build, supplied-artifact verification, manifest authorization,
  checksums/integrity, payload allowlisting, and public reinstall cover the
  artifact path; signed provenance remains deferred.
- **Repudiation:** tag, GitHub release, npm record, checksum report, exact draft
  identifier/URL, and the two explicit human authorizations form the release
  record; signed tags/multi-party approval are absent.
- **Information disclosure:** embedded registry data and build credentials are
  the main risks; pre-access rejection and credential-free build/agent contexts
  are required.
- **Denial of service:** remote Git operations remain unbounded and are an
  accepted documented gap for this release.
- **Elevation of privilege:** untrusted text must not acquire publication
  authority. Separating implementation, manifest-authorized tag/draft work,
  human-only npm publication, and separately authorized final draft publication
  limits that path; trusted registry content remains a deliberate downstream
  agent authority.
