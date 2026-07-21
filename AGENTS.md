# Agents

<!-- skillfoo:start -->
## Skills

Shared agent skills live in `.agents/skills/` (managed by skillfoo):

- [grill](.agents/skills/grill/SKILL.md) — Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation (CONTEXT.md, ADRs) inline as decisions crystallise.
- [prd](.agents/skills/prd/SKILL.md) — Create a PRD through user interview, codebase exploration, and module design, then output as a markdown file.
- [slice](.agents/skills/slice/SKILL.md) — Vertical-slice planning pipeline that turns rough requirements into slice-local discovery, decisions, UAT, PRD, follow-ups, and a bootstrap prompt before implementation.
- [pr](.agents/skills/pr/SKILL.md) — Write a human-readable PR title and description from the final diff (never from the conversation), open or update the pull request, and triage review feedback into address / defer / dismiss.
- [typescript-cli](.agents/skills/typescript-cli/SKILL.md) — Build, migrate, or review reliable Node.js command-line applications in TypeScript.
- [review](.agents/skills/review/SKILL.md) — Review a branch, pull request, commit range, working-tree diff, or selected files for correctness, architecture, security, performance, maintainability, and testing risks.
- [uat](.agents/skills/uat/SKILL.md) — Create concise, executable manual user-acceptance test plans from requirements, planning artifacts, a diff, branch, pull request, or working implementation.
- [threat-model](.agents/skills/threat-model/SKILL.md) — Threat-models a system, feature, or attack surface from first principles — assets, actors, and the paths from untrusted input to consequential action — then ranks risks and recommends controls worst-first, pushing each catastrophic outcome toward impossible-by-construction.
<!-- skillfoo:end -->
