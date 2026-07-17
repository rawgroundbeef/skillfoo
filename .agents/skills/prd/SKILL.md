---
name: prd
description: Create a PRD through user interview, codebase exploration, and module design, then output as a markdown file. Use when user wants to write a PRD, create a product requirements document, plan a new feature, or scope out work before implementation. Triggers on "write a prd", "create a prd", "let's plan this feature", "scope this out", "product requirements", or any request to formalize feature planning into a document.
---

# PRD Skill

Turn conversation context and codebase understanding into a PRD markdown file.

## Process

### Step 1: Understand the Feature

Synthesize what you already know from the conversation. If context is thin, ask the user 3-5 focused questions:

- What problem does this solve?
- Who is the user?
- What does success look like?
- Any constraints or non-negotiables?
- What's explicitly out of scope?

Don't over-interview. If the conversation already covers these, move on.

### Step 2: Explore the Codebase

Explore the repo to understand the current state relevant to the feature. Look for:

- Existing patterns and conventions
- Models, services, and views that will be touched
- API contracts already in place
- How similar features were built

### Step 3: Sketch Modules

Identify the major modules to build or modify. Favor deep modules — ones that encapsulate significant functionality behind a simple interface.

Present the module sketch to the user and confirm before writing the full PRD. Keep it brief:

```
Here's what I'm thinking:
1. GifPicker — Tenor/Giphy API integration, search + trending
2. Post model — add gif_url field
3. Feed rendering — animate GIFs inline
4. Compose UI — GIF button + picker sheet

Does this match your thinking?
```

### Step 4: Write the PRD

Write the PRD to `prd-{feature-name}.md` in the project root. Use kebab-case for the filename.

## PRD Template

ALWAYS use this exact structure:

```markdown
# PRD: {Feature Name}

**Date:** {YYYY-MM-DD}
**Status:** Draft

## Problem Statement

The problem from the user's perspective. Why does this matter?

## Solution

The solution from the user's perspective. What will they experience?

## User Stories

Extensive numbered list. Each story follows:

> As a {actor}, I want {feature}, so that {benefit}

Cover the happy path, edge cases, error states, and accessibility. Be thorough — 10-20 stories minimum.

## Implementation Decisions

Decisions about how to build it:

- Modules to build or modify
- Architecture and data flow
- Schema changes
- API contracts
- External service integrations
- Key technical choices and their rationale

Do NOT include specific file paths or code snippets — they go stale fast.

## Testing Decisions

- What makes a good test for this feature
- Which modules need tests
- Integration vs unit test balance
- Any existing test patterns to follow

## Out of Scope

What this PRD explicitly does NOT cover. Be specific — this prevents scope creep.

## Open Questions

Unresolved decisions that need input before or during implementation.
```

### Writing Tips

- User stories are the heart of the PRD. Make them extensive and specific.
- Implementation decisions should explain **why**, not just **what**.
- Out of scope is as important as in scope — it sets boundaries.
- Open questions are OK. Better to flag unknowns than to guess.
- No file paths or code in the PRD. It's a planning doc, not a spec.
