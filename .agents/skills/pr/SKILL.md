---
name: pr
description: Write a human-readable PR title and description from the final diff (never from the conversation), open or update the pull request, and triage review feedback into address / defer / dismiss. Use when opening a PR, shipping a branch, tightening a PR title or description, or responding to review comments from humans or bots.
---

# PR title & description

Derivation playbook: the title and description are written FROM THE FINAL
DIFF — never from conversation memory. The conversation is the story of
*doing* the work; the reviewer sees only the diff. Write for the reviewer.

## When invoked

1. Identify the branch and its base. Base = the repo's default branch unless
   the branch was cut from another base or the user names one. Detect it with
   `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` (fallback:
   `git symbolic-ref --short refs/remotes/origin/HEAD`).
2. Gather inputs — these are the ONLY sources:
   - `git diff {base}...HEAD --stat`, plus the hunks needed to ground claims
   - `git log {base}..HEAD --oneline` (scope check only — never narrate it)
   - `gh pr list --state merged --limit 5` (match the repo's house title style)
   - **If** the branch includes planning docs (e.g. a `.planning/{NNNN-slug}/`
     folder from the `slice` skill), read them for intent and deferred work —
     but the description is still grounded in the diff, and never restates them.

## Description contract

Budget: **≤ 25 non-empty source lines** (attribution footer, if any, exempt).
Sections, in order — drop one only when the branch genuinely has nothing for it:

| Section          | Budget        | Content                                                                                     |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------- |
| What & why       | 2–4 sentences | The problem and the shape of the fix. No chronology.                                        |
| Behavior changes | 1 line/bullet | Only observable deltas: limits, flags, headers, keys, endpoints, gates, schema.             |
| Not in this PR   | 1–2 lines     | Deferred work — point at follow-ups / a tracking issue, don't describe it.                  |
| Verify           | 2–3 bullets   | Commands run + results a reviewer can reproduce.                                             |
| Docs             | 1 line        | Pointer to any planning docs that ship in the diff — never restate their contents.          |

If planning docs ship inside the PR, the description NEVER duplicates them.
Every duplicated line is a line the reviewer reads twice.

## Title contract

Written LAST, after the description and the verify pass — a title written at
branch creation describes the plan, not the result.

- ≤ 70 characters, imperative mood, matching the repo's house prefix style
  (learn it from recently merged PRs).
- Names the net behavior change with the biggest blast radius, not the
  activity ("key rate-limit on verified JWT", not "consolidate rate limiter").
- Release-note test: a teammate reading ONLY the title could write the
  changelog entry.

## Verify pass (mandatory, against the diff only)

Re-read the final diff — not the conversation — and check:

1. The title covers the largest-blast-radius change actually in the diff.
2. Every description claim maps to a hunk. No claim from memory.
3. Zero narration: no "first/then/we discovered", no commit-by-commit retelling.
4. Nothing restates a linked doc or enumerates files — the diff does that.
5. Budgets hold. Count the lines.
6. Delete test: removing a line must lose information not recoverable from the
   diff + linked docs. If it doesn't, delete the line.
7. Material changes outside the branch's main purpose (tooling, config, fixes
   that rode along) get one line each — a reviewer surprised by an unmentioned
   hunk distrusts the rest of the description.

## Ship

- Push the branch (`git push -u origin HEAD` if it has no upstream yet), then
  `gh pr create --base {base}` — or `gh pr edit` when a PR already exists —
  with the final title and body.
- End the body with the repo's attribution footer if it uses one.
- Report the PR URL, the final title, and which verify-pass rules forced edits.

## Review feedback triage

When review comments land on an open PR, run this loop without waiting for
per-comment instructions.

**Acknowledge every comment on its own thread.** Acting on feedback without a
thread reply leaves the reviewer unable to see what happened and why; silent
action is never an option.

1. Fetch every unresolved inline comment and review body:
   `gh api repos/{owner}/{repo}/pulls/{N}/comments --paginate` and
   `gh pr view {N} --json reviews`, then read the PR's GraphQL `reviewThreads`
   for each thread's resolution state and ID.
2. Triage each comment into exactly one bucket:
   - **Address** — the finding is real and belongs in this PR. Verify the
     suggestion against the final diff and runtime semantics; implement the
     right shape rather than blindly applying a suggested patch. Run the
     affected tests and the repo's checks proportionate to the change. Reply
     with the commit SHA and, when the fix differs from the suggestion, one
     sentence saying why. Resolve the thread.
   - **Defer** — the concern is real but out of scope. Reply with the scope
     reasoning and record the deferred work durably (follow-ups doc or a
     tracked issue), then resolve the thread.
   - **Dismiss** — the concern doesn't apply, conflicts with a recorded
     decision, or is unjustified gold-plating. Reply with the concrete reason;
     add no follow-up. Resolve the thread.
3. Put replies on the inline comment's own thread with
   `gh api repos/{owner}/{repo}/pulls/{N}/comments/{id}/replies -f body=…`,
   never as detached top-level PR comments.
4. Resolve replied-to threads with GraphQL `resolveReviewThread` using the IDs
   from `reviewThreads`. Leave a thread open only when genuinely waiting on the
   reviewer to answer.
5. Push once after all fixes and doc updates are committed. Report each
   comment's bucket, what changed, the commit SHA, and the reasoning.
