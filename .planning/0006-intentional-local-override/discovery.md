# Discovery: Intentional Local Override

Date: 2026-07-18

## Kickoff

Continue the M2/M5 three-way resolution model after slice 0005 shipped the
targeted “take registry” outcome. This slice plans the complementary outcome
for one locally edited, Desired and Managed skill: intentionally keep its
repository version authoritative without converting it to Bespoke content or
recreating the same Conflict after every edit.

The sibling `../skillfoo-planning` repository supplied durable product
direction but remained read-only. Its active-progress prose predates merged
slices 0004 and 0005, so only the stable product model and prototype evidence
were treated as authoritative.

## Refined problem

Today a locally edited Managed skill is reported as `drifted` with reason
`local_changes`. Ordinary sync preserves it, and slice 0005 lets the user
discard it with:

```sh
skillfoo resolve <skill> --take-registry
```

There is still no way to say that the repository version should remain the
intentional winner. Leaving the bytes alone is insufficient: without durable
policy, the planner reports the same Conflict indefinitely and every later
edit requires another resolution choice.

The new outcome must persist user intent, remain visible, preserve Managed
ownership, keep target-dependent projections truthful, exclude the target’s
skill content from ordinary registry replacement, and be explicitly and
safely reversible.

## Product and repository evidence

- `../skillfoo-planning/context.md` defines the durable M2/M5 choices as use
  source, promote the repository version to the registry, or retain an
  intentional override. Its state machine includes `override` alongside
  synced, pending, and drifted.
- The M2 prototype in
  `../skillfoo-planning/scratchpad/site-prev12-merged.html` says choices are
  saved to config and shows `local` override policy. The M5 copy promises that
  the local version remains tracked and excluded from sync.
- `CONTEXT.md` defines Desired, Managed, Bespoke, Projection, Pending change,
  Conflict, and Converged. The grill added Override as a durable policy rather
  than a renamed Conflict. An Override remains Managed and can coexist with a
  Converged repository.
- `docs/adr/0001-live-local-overrides.md` records the durable live-policy
  choice and why hash-pinning was rejected.
- `.planning/0005-targeted-conflict-resolution/` established a one-name,
  one-direction resolver, strict CLI parsing, target-only projection work,
  freshness checks, handled-failure rollback, residual `0`/`2`/`3` exits, and
  the removal of broad `sync --force`.
- `src/config.ts` currently models only `registry`, `emit`, and `skills`.
  Creation uses a narrow deterministic renderer; mutation of an existing
  config needs document-aware editing so comments and unknown future keys are
  not erased.
- `src/lockfile.ts` records source and source-content hash as ownership and
  baseline evidence. It has no user-policy field and should not gain one for
  this outcome.
- `src/plan.ts` performs the current three-way comparison: registry hash,
  prior lock hash, and current local hash. A local hash distinct from both the
  registry and baseline becomes `drifted` / `local_changes`. A valid override
  must intercept that content classification without weakening path or
  ownership checks.
- `src/status.ts` publishes skill states, summaries, outcomes, and the
  versioned JSON contract. Slice 0003 declared JSON keys, states, reasons,
  ordering, summary meanings, and exit statuses public automation API.
- `src/sync.ts` executes every safe planner action and renders managed
  projections. Override content therefore has to be excluded in the shared
  plan rather than skipped only in a CLI presentation branch.
- `src/resolve.ts` already stages, revalidates, mutates, rolls back, and
  post-classifies one take-registry target. The keep-local path changes config
  and projections rather than content and lock, while take-registry must be
  extended to clear policy in the same transaction as replacement.
- `src/emit.ts` and `src/lockfile.ts` currently write root metadata in place,
  and their normal reads follow a root-level symlink. The targeted resolver
  cannot inherit that behavior: config, lock, and an existing `AGENTS.md` are
  transaction evidence and must be inspected without following a redirected
  entry, then written through a consumer-local atomic replacement when their
  bytes change.
- `src/emit.ts` owns the generated `AGENTS.md` span. Its current introduction
  tells readers to edit every skill in the source registry, which is false for
  an Override. The generated advice must become neutral, and an overridden row
  must identify its local authority explicitly.
- Current tests prove the safety boundaries to preserve: one-segment names,
  non-traversal of top-level links and files, lock compare-and-set, exact
  unrelated-row retention, adapter ownership checks, target-only resolution,
  stale-evidence refusal, rollback, clean stdout/stderr, and residual outcome
  exits.

## Resolved domain model

An **Override** is a live, mutable local policy. It does not pin one accepted
local hash. Once established, later edits within the safe local skill
directory remain intentional and do not recreate a Conflict. The policy lasts
until the user explicitly takes the registry version or removes the policy.

“Tracked” means the repository records explicit policy and Managed ownership;
it does not mean the lockfile advances to each local edit. The lock entry
continues to record the prior source baseline so ownership and registry
evolution remain observable.

An Override is not:

- a Conflict that status ignores;
- a conversion from Managed to Bespoke;
- a snapshot of one approved local hash;
- permission to traverse or replace an unsafe path;
- permission to overwrite a foreign adapter;
- promotion of local content into the registry.

## Configuration contract

The public schema is:

```yaml
registry: ../registry
skills:
  - alpha
  - beta
overrides:
  alpha: local
```

Rules:

- `overrides` is optional; omission or `{}` means no override policy.
- It must be a mapping. `null`, a sequence, or a scalar is invalid.
- Every key must be a YAML string scalar using the existing cross-platform
  safe one-segment skill-name grammar. Keys are skill identities, not emitted
  filesystem paths; non-string or complex YAML keys are invalid even if a
  generic object parser could coerce them to text.
- Prototype-shaped but otherwise safe names such as `__proto__` remain valid
  skill identities. Override storage and membership checks must preserve them
  as own entries rather than inheriting object-prototype behavior.
- Every value must be exactly the string `local`.
- Duplicate YAML mapping keys remain parse errors.
- A configured Override must have a lock entry because Override is a Managed
  state.
- When `skills:` is an explicit list, every override name must also appear in
  that list. Explicit deselection plus local override is contradictory config.
- With implicit all-skills selection, an Override that has prior Managed
  ownership remains valid if its registry entry later disappears.
- With explicit selection, a selected, previously Managed Override likewise
  remains valid after registry removal.
- An entry that is neither currently in the registry nor previously Managed
  is invalid.
- A syntactically valid, ownership-consistent manually authored policy is
  honored even when the local directory currently matches the registry. The
  engine cannot distinguish that case from a resolver-created live Override
  whose content later returned to matching bytes, and matching content never
  clears policy implicitly.
- Missing or unsafe materialized content does not make the YAML invalid; it is
  a degraded managed state classified by the planner.

Malformed or semantically contradictory config exits `1`, writes a concise
diagnostic to stderr, emits no successful status JSON, and causes no consumer
mutation.

The command editor must use the YAML document model rather than regenerate the
file through the narrow config renderer. It guarantees semantic preservation
of unrelated values plus preservation of comments, unknown keys, key order,
and scalar style. Harmless YAML whitespace normalization is allowed. Adding a
new override appends the block after existing keys; adding to an existing map
does not reorder its entries. Removing the final policy removes the empty
`overrides` block. A healthy idempotent retry does not rewrite the file, and
rollback restores its exact original bytes. A mutating resolver requires
`.skillfoo.yml` itself to be a real regular file, never a symlink or special
entry. It stages validated bytes in a sibling temporary file, preserves the
existing file mode, and atomically replaces the target so it cannot follow a
redirect outside the consumer or expose partial YAML.

## Healthy and degraded classification

For a syntactically and semantically valid Override:

| Local materialization | Registry state | Classification | Ordinary content action |
| --- | --- | --- | --- |
| Safe real directory | Baseline unchanged | `override` / `unchanged` registry | None |
| Safe real directory | Source or content changed | `override` / `changed` registry | None |
| Safe real directory | Skill absent from registry | `override` / `missing` registry | None |
| Missing | Present or missing | `drifted` / `override_content_missing` | None; explicit choice required |
| File, symlink, or other unsafe top-level shape | Any | `drifted` / `emitted_path_not_managed_directory` | None; never traverse or replace |

An unsafe `emit:` ancestry remains a global config/operational failure because
the engine cannot safely inspect any target below it.

For a degraded Override, preserve any existing target managed row and adapter
byte-for-byte. Do not add or rewrite a missing row when no local description
can be proven, and do not create a missing adapter pointing at absent or unsafe
content. The shared managed-block header and unrelated projections may still
follow their ordinary safe plan. Omit the target adapter projection record
while local content is degraded rather than falsely calling an absent adapter
unchanged or safely creatable. Target adapter inspection and projection repair
resume after the local path is restored as a safe real directory.

Registry updates never replace healthy Override content or advance its lock
baseline. Registry removal likewise preserves the local directory, lock entry,
policy, managed row, and adapter. A missing source is not itself a Conflict.
Taking the registry is unavailable until a source exists.

Removing an override entry manually does not authorize replacement. When the
skill still has a selected registry source and local content differs from the
retained baseline, the existing three-way plan returns to
`drifted` / `local_changes`. If implicit selection no longer desires a
source-missing skill, existing removal inspection preserves the edited target
as `removal_blocked` / `local_changes`; an explicit missing non-Override
selection retains its existing configuration/registry failure. None of these
paths lets ordinary sync overwrite or delete local edits.

## Public status contract

`override` is a distinct public skill state: neither unchanged, pending work,
nor Conflict. Healthy Overrides receive their own count. A representative JSON
record and summary are:

```json
{
  "schemaVersion": 2,
  "outcome": "converged",
  "skills": [
    {
      "name": "alpha",
      "state": "override",
      "registryState": "changed"
    }
  ],
  "summary": {
    "skills": {
      "unchanged": 0,
      "overrides": 1,
      "changes": 0,
      "conflicts": 0
    },
    "projections": {
      "unchanged": 2,
      "changes": 0,
      "conflicts": 0
    }
  }
}
```

For Override records, `registryState` is always one of:

- `unchanged`: the current configured source and hash match the retained lock
  baseline;
- `changed`: the configured source or current registry content differs from
  that baseline;
- `missing`: the registry does not currently contain the skill.

`missing` requires a successfully resolved/refreshed registry catalog that
lacks the skill. An unavailable, unreadable, or failed remote registry remains
an operational failure with exit `1`; Override policy does not authorize a
stale-cache fallback or turn registry access failure into source absence.

The registry detail is informational and does not alter outcome precedence.
JSON moves to schema version 2 because a new public state, record field, and
summary shape would break exhaustive version-1 consumers.

Human status names the Override, says the repository version is authoritative,
and reports whether its registry baseline is unchanged, changed, or missing.
Human and sync summaries count Overrides separately. Ordinary sync must not
claim that every active skill was copied “from” the registry; its headline
uses reconciliation-neutral wording for the Managed set so a healthy or
source-missing Override is described truthfully.

Outcome and exit rules remain:

- A repository containing only healthy Overrides and current projections is
  `converged`, exit `0`.
- Any unrelated safe work produces `changes_available`, exit `2`.
- Any real skill or projection Conflict produces `attention_required`, exit
  `3`, even when Overrides and safe work also exist.
- Invalid config, inspection failure, refusal, stale evidence, rollback
  trouble, or another operational failure exits `1`.

Successful targeted resolution uses the same residual `0`/`2`/`3` result.
Ordinary sync continues to succeed after applying all safe work and preserves
both Overrides and Conflicts.

## Projection behavior

Override content is excluded from registry replacement, not from Managed
projection maintenance.

- The managed `AGENTS.md` introduction becomes neutral for all generated
  blocks: `Shared agent skills live in <emit>/ (managed by skillfoo):`. The
  prior generated advice to edit every skill in the source registry is
  removed.
- A healthy Override row uses the local `SKILL.md` description and appends
  `(local override; edit in this repository)`.
- Non-overridden rows remain canonical source-managed rows without the suffix.
- `--keep-local` updates only the target row plus the shared managed-block
  introduction. It retains unrelated managed rows and all content outside the
  managed markers byte-for-byte.
- A correct target Claude adapter remains unchanged. A missing adapter is
  created when its ancestors are safe.
- Foreign target adapter content or an unsafe adapter ancestor is preserved as
  its own residual projection Conflict. Keeping local skill content does not
  prove adapter ownership.
- A degraded missing or unsafe Override preserves its existing target row and
  adapter exactly and creates neither when absent; safe target projection
  maintenance resumes only when local content is a real directory again.
- Later ordinary syncs continue deriving the Override’s row from its local
  content while reconciling other safe work normally.
- `--take-registry` removes the local-override suffix and uses the registry
  description. Reversal does not restore the removed global editing advice.

The managed-header wording is a safe projection change for existing consumers
and may be reported independently before any Override exists.

## CLI and eligibility

The public grammar is:

```text
skillfoo resolve <skill> (--take-registry | --keep-local)
```

Exactly one safe skill-name positional and exactly one direction flag exactly
once are required. Both directions, neither direction, repeated directions,
unknown options, and extra positionals fail before config access, registry
refresh, or consumer mutation. `skillfoo resolve --help` remains
project-independent and documents both directions and exit meanings.
The parser retains its standard `--` end-of-options behavior: a direction
provided before the separator is parsed normally, while text after it is
positional and cannot masquerade as a direction.

`--keep-local` is eligible when the named skill is Desired, Managed, a safe
real directory, and currently `drifted` for `local_changes`. This first slice
does not create a proactive policy for an unchanged source-managed skill via
the CLI. A valid manually authored policy is still honored.

A healthy existing Override is an eligible retry. It is byte-for-byte
non-mutating when its policy and projections are current; it may repair only
stale target-dependent projections after later local edits. A degraded
missing or unsafe Override cannot be blessed by repeating keep-local.

`--take-registry` retains its slice-0005 local-change behavior and becomes the
explicit reversal for an Override. With a current source, it removes the
target policy, installs or confirms the registry content, advances the target
lock baseline, and reconciles target projections together. A missing Override
directory may be restored this way. An unsafe top-level shape remains outside
the replacement authorization and is preserved. A missing registry source
causes refusal without mutation. After reversal, the existing exact
source-current Managed retry remains a successful no-op.

Every refusal names the observed state and gives a concrete next action.
Successful results go to stdout; registry progress and failures go to stderr.
The resolver never applies unrelated safe work or resolves unrelated
Conflicts.

## Mutation and rollback boundary

Keep-local stages and validates a document-aware config edit before durable
mutation. Immediately before writing it revalidates:

- config and lock real-file identity, mode, exact bytes, and parsed evidence;
- target selection and lock ownership entry;
- safe real-directory shape and local content hash;
- current registry evidence used for classification;
- target `AGENTS.md` presence or real-file identity, mode, and exact bytes; and
- target adapter state relevant to allowed creation.

`.skillfoo.yml` and `.skillfoo.lock` must exist as real regular files for
either resolver direction. `AGENTS.md` may be absent or a real regular file.
A symlink, directory, or special entry at any of those root metadata paths is
an unsafe operational refusal before mutation. Immediately before each
metadata install, revalidate the observed entry identity and bytes (or its
continued absence). Stage changed bytes beside the destination and install
them atomically without writing through the existing inode. Preserve the
existing mode. This also makes a metadata hardlink safe to update: the
consumer path receives a replacement inode while every other hardlink retains
its original bytes. A no-write target may retain its existing hardlink.

Before its first durable consumer mutation, the transaction writes a manifest
and exact before-snapshots under its reported recovery directory: config,
lock, and `AGENTS.md` bytes, mode, and presence; target content state for the
take-registry direction; and adapter state plus any transaction-created
ancestors. These snapshots are recovery inputs rather than in-memory-only
diagnostics and remain until post-classification commits.

Keep-local then writes the target config policy, target managed-row/header
projection, and missing safe target adapter as one handled-failure
transaction. It does not change the skill content or lock entry. A
post-mutation read-only plan must classify the target as a healthy Override
and confirm no target-dependent safe projection work remains before the
transaction commits.

Take-registry reversal extends the existing recovery transaction so clearing
the policy is atomic with registry content installation, target lock update,
target managed-row update, and missing adapter creation.

On handled failure, rollback atomically restores exact prior config and
`AGENTS.md` bytes and modes, target lock/content where that direction changed
them, and the prior adapter shape. It removes only empty adapter ancestors
created by the transaction. Recovery data remains live through
post-classification and is deleted only after success. If rollback is
incomplete, the diagnostic reports the exact preserved recovery path, whose
manifest and snapshots remain inspectable. Every restore is compare-and-set:
if config, `AGENTS.md`, lock, content, or adapter state no longer matches the
transaction's own output, preserve the concurrent state rather than
clobbering it and report rollback as incomplete.

The transaction does not promise process-crash consistency, fsync durability,
restart discovery, or automatic cleanup after machine failure. Those remain
the crash-journaling follow-up from slice 0005.

## Resolved scope

- Add the first intentional local outcome for one locally edited Desired and
  Managed skill.
- Persist live local policy in `.skillfoo.yml` and retain source baseline in
  `.skillfoo.lock`.
- Extend the shared planner, status, sync presentation, resolver, help, README,
  and tests around the new public state.
- Correct README's unconditional registry-source-of-truth wording: the
  registry is the default authority for Managed skills, while explicit local
  Override policy is the documented exception.
- Keep the resolver targeted to one name and its dependent state.
- Use a separate disposable consumer repository for UAT; do not exercise
  mutation scenarios against the skillfoo repository itself.

## Non-goals

- Promote local content into the source registry; that remains a separate
  git-native cross-repository slice.
- Convert a Managed skill to Bespoke content.
- Add a CLI workflow that proactively overrides an unchanged skill with no
  local-edit Conflict; valid manual config remains supported.
- Adopt or replace Bespoke content at a Desired path.
- Replace a file, symlink, special entry, foreign adapter, or unsafe adapter
  ancestor.
- Force removal of an overridden or locally changed Managed skill.
- Add selection-management commands.
- Add git commit/publish behavior, remote PR fan-out, or hosted state.
- Add durable crash journaling or restart-time recovery.

## Open questions

- _(none at the discovery/decision gate)_
