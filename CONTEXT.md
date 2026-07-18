# Skillfoo Reconciliation

Skillfoo reconciles a repository's selected shared skills with a source registry while preserving content it cannot prove that it manages.

## Language

**Desired skill**:
A registry skill selected by the repository's current configuration.
_Avoid_: Installed skill

**Managed skill**:
A repository skill whose ownership and baseline are recorded by skillfoo.
_Avoid_: Generated skill

**Bespoke skill**:
A repository skill with no skillfoo ownership record.
_Avoid_: Unmanaged skill, local skill

**Projection**:
A repository representation derived from the managed skill set.
_Avoid_: Copy, generated file

**Converged**:
A state in which ordinary reconciliation has no pending managed-skill or projection change and no conflict.
_Avoid_: Clean, synced

**Pending change**:
A managed-skill or projection difference that ordinary reconciliation can safely apply.
_Avoid_: Drift

**Conflict**:
A managed-skill or projection difference that reconciliation will preserve until a user makes an explicit choice.
_Avoid_: Error, pending change

## Relationships

- A **Desired skill** can become a **Managed skill** after reconciliation establishes ownership.
- A **Managed skill** can produce one or more **Projections**.
- A **Bespoke skill** is outside reconciliation unless its path conflicts with a **Desired skill**.
- A repository is **Converged** only when its managed skills and **Projections** have neither a **Pending change** nor a **Conflict**.

## Example dialogue

> **Dev:** "The registry has a newer version, but this **Managed skill** also has local edits. Is that a **Pending change**?"
> **Domain expert:** "No. It is a **Conflict** because ordinary reconciliation must preserve the local edits until the user chooses how to resolve them."

## Flagged ambiguities

- "Drift" previously referred both to any difference and specifically to local edits of a managed skill; resolved: **Pending change** is safely applicable, while **Conflict** requires a user choice and `drifted` remains one specific conflict state.
