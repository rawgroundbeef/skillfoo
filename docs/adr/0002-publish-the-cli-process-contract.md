# Publish the CLI process contract

Skillfoo's supported public integration boundary is the exact versioned npm
package and its installed `skillfoo` executable, including arguments, stdout,
stderr channel discipline, exit statuses, and `status --json` schema 2;
internal JavaScript modules remain unsupported implementation details.
Starting at `1.0.0`, a breaking change to command grammar or machine semantics
requires a package major release, and a breaking JSON shape or meaning also
requires a schema-version increment. JSON object-key order/whitespace and exact
help prose are not compatibility surface. Documented arrays retain
case-sensitive ECMAScript UTF-16 relational ordering, and consumers reject
unknown schema versions while ignoring unknown object keys in schema 2.

Registry sources must not embed HTTP(S)/file user information, queries, or
fragments, or SSH passwords, queries, or fragments. Skillfoo rejects those
sources and terminal controls without echoing their contents. Every non-local
Git source is validated as the exact URL passed to Git after semantic expansion,
including hosted/generic shorthands and `git@host:path`; unsupported scheme-like
sources are rejected rather than interpreted as local paths. Private registries
use out-of-band Git authentication. Raw
Git/helper/remote stderr is not public process output; registry diagnostics are
fixed, non-interpolated lines from a seven-line allowlist, each at most 160 UTF-8
bytes excluding newline. Git cache identity uses the full SHA-256 of the exact
normalized clone URL, and a cache's normalized `origin` must match before every
reuse. `status` does not mutate the consumer repository,
although a Git-backed registry may perform network access and refresh
skillfoo's external registry cache. A configured registry is a trusted
instruction authority: explicit sync copies its files without semantic
sandboxing, and lock hashes do not authenticate its author. These boundaries
keep hosted consumers decoupled from internal TypeScript modules and protect
the machine channel, at the deliberate cost of subprocess/schema handling,
explicit Git-cache effects, and registry-author trust.
