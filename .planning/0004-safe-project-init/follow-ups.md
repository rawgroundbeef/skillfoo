# Follow-ups: Safe Project Initialization

Date: 2026-07-18

## Bugs Discovered

- _(none deferred; emit containment is scheduled into this slice)_

## Deferred Slice Ideas

- **2026-07-18 · Explicit conflict resolution.** Add take-source, promote-local,
  intentional override, force-removal, and managed-to-bespoke workflows after
  initialization ships.
- **2026-07-18 · Selection management.** Add commands for changing desired
  skills in an already initialized project without hand-editing YAML.
- **2026-07-18 · Git-native publishing.** Make reconciled changes visible as an
  intentional commit/publish workflow without creating a second source of truth.

## Product Questions

- _(none)_

## Cleanup / Refactor Notes

- **2026-07-18 · Legacy sync parsing.** Migrate sync to strict `parseArgs` in a
  separate compatibility-covered change if command parsing is revisited.
- **2026-07-18 · Repeated skill walks.** Continue tracking the cold-path registry
  walk duplication deferred from earlier reconciliation slices.

## Environment / Testing Notes

- **2026-07-18 · Global executable not linked in this shell.** Local dogfood
  currently invokes `node dist/entrypoint.js`; package UAT must install the
  tarball into a disposable project and invoke the npm-created binary.
- **2026-07-18 · Isolate remote registry cache.** Automated Git-backed init tests
  must not read, reset, or remove the developer's real `~/.skillfoo` cache.
