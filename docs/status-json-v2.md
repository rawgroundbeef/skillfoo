# `skillfoo status --json` schema 2

The supported automation boundary is an exact installed `skillfoo` package and the
npm-created `skillfoo` executable. Internal package files are implementation details, not a
supported JavaScript or TypeScript import API.

On a successful repository observation, `skillfoo status --json` writes one complete,
undecorated JSON document to stdout. Registry progress goes to stderr. Usage and operational
failures write diagnostics to stderr, leave stdout empty, and exit `1`.

## Top-level document

Every schema 2 document has these fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | number | Exactly `2`. Consumers must reject every other value before interpreting the document. |
| `outcome` | string enum | `converged`, `changes_available`, or `attention_required`. |
| `registry` | string | The validated registry source from `.skillfoo.yml`. Unsafe URL components and control characters fail before this field can be rendered. |
| `emit` | string | The configured repository-relative Managed skill projection root. |
| `skills` | array | One record per desired or previously Managed skill relevant to reconciliation. |
| `projections` | array | The repository-index projection followed by Claude adapter projections. |
| `summary` | object | Counts for the two record sections. |

JSON object-key order, indentation, and trailing whitespace are not schema surface. Parse the
entire stdout document structurally. Repeated output from one unchanged build and fixture is
deterministic, but consumers must not compare formatting bytes across releases.

## Skill records

Each `skills` element contains:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string | yes | Original, unnormalized skill name. |
| `state` | string enum | yes | `unchanged`, `override`, `add`, `update`, `lock_update`, `remove`, `drifted`, `blocked`, or `removal_blocked`. |
| `reason` | string enum | no | Conflict reason: `local_changes`, `override_content_missing`, `unmanaged_destination`, `unrepresented_local_structure`, `emitted_path_not_managed_directory`, or `adapter_ownership_unproven`. |
| `registryState` | string enum | no | For an `override`, whether its registry baseline is `unchanged`, `changed`, or `missing`. |

Skill records are ordered by case-sensitive ECMAScript relational string comparison (`<` and
`>`) over the original strings. This is lexicographic UTF-16 code-unit order without locale
collation, Unicode normalization, or case folding. For example, `Zulu`, `alpha`, `éclair` is
the required order.

## Projection records

The repository-index projection is:

```json
{ "kind": "agents_md", "state": "unchanged" }
```

Its `state` is `unchanged` or `update`. It is always ordered before Claude adapter records.

A Claude adapter projection is:

```json
{
  "kind": "claude_adapter",
  "skill": "alpha",
  "state": "blocked",
  "reason": "unmanaged_destination"
}
```

`skill` is required, `state` is `unchanged`, `update`, or `blocked`, and `reason` is optional.
When present, the reason is `unmanaged_destination` or `adapter_ownership_unproven`. Adapter
records use the same ECMAScript name comparator as skill records.

## Summary

`summary.skills` contains non-negative integer counters `unchanged`, `overrides`, `changes`,
and `conflicts`. `summary.projections` contains `unchanged`, `changes`, and `conflicts`.
The counters classify the emitted records: `add`, `update`, `lock_update`, and `remove` are
skill changes; `drifted`, `blocked`, and `removal_blocked` are skill conflicts; projection
`update` is a change and projection `blocked` is a conflict.

Conflict takes outcome precedence over a safe change. Any conflict produces
`attention_required`; otherwise any change produces `changes_available`; otherwise the result
is `converged`.

## Streams, exits, and effects

| Exit | JSON stdout | Meaning |
| --- | --- | --- |
| `0` | one schema 2 document | The repository is converged. |
| `2` | one schema 2 document | Ordinary safe changes are available. |
| `3` | one schema 2 document | At least one conflict requires attention; safe changes may also exist. |
| `1` | empty | Usage or operational failure; diagnostics are on stderr. |

Status does not write the consumer repository. For a local-path registry it performs only
local reads and has no network or skillfoo registry-cache effect. For a Git-backed registry it
may access the network and create, fetch, hard-reset, or safely re-clone skillfoo's external
registry cache. Registry progress and fixed diagnostics stay on stderr and never decorate JSON
stdout.

## Minimal consumer guard

Pin the exact package version and spawn its installed executable. Accept repository outcomes
`0`, `2`, and `3`; treat `1` or any other exit as an invocation failure. Check the schema
version before reading any outcome or records:

```js
import { spawnSync } from 'node:child_process';

const result = spawnSync(installedSkillfooPath, ['status', '--json'], {
  cwd: consumerRepository,
  encoding: 'utf8',
  shell: false,
});

if (result.status !== 0 && result.status !== 2 && result.status !== 3) {
  throw new Error(`skillfoo failed with exit ${String(result.status)}`);
}

const document = JSON.parse(result.stdout);
if (document === null || typeof document !== 'object' || document.schemaVersion !== 2) {
  throw new Error('unsupported skillfoo status schema version');
}

// It is now safe to interpret document.outcome, skills, projections, and summary.
```

Consumers must ignore unknown object keys in a known schema. They must not best-effort parse an
unknown top-level schema version or infer machine state from human output.

## Compatibility

Removing or renaming a field; changing a field's type, requiredness, meaning, enum vocabulary,
or documented array ordering; or otherwise making schema 2 interpretation unsafe is a schema
break. It requires both a schema-version increment and a package major release.

New optional object fields or summary counters that preserve existing meanings and ordering
may be backward-compatible schema 2 additions. Backward-compatible commands or machine data
use a package minor release; contract-preserving fixes use a patch release. Any breaking
change to supported commands, arguments, streams, or exit meanings requires a package major
release even when the JSON shape is unchanged.
