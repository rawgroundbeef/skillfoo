# PR

Write reviewer-facing pull request copy from the final diff, publish the branch,
and close the loop on review feedback.

The skill deliberately ignores the implementation conversation when writing
the PR story. Every claim must map to the final patch or its durable planning
artifacts, titles describe the net behavior change, and descriptions stay
short enough to review.

## What it handles

- House-style PR titles written after the diff is final.
- Compact descriptions covering behavior, exclusions, verification, and docs.
- Branch push plus PR creation or update.
- Review-comment triage into **Address**, **Defer**, or **Dismiss**.
- A reply and resolution on every original review thread.

## Try it

```text
Use $pr to write and open the pull request from the final diff.
```

```text
Use $pr to triage the feedback on this pull request.
```

The executable workflow lives in [SKILL.md](./SKILL.md).
