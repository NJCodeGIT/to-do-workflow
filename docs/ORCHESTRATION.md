# Orchestration

How a feature moves from idea to reviewed change using the project's skills and subagents.

## Roles
- **Skills** (`.claude/skills/`): what each role knows.
- **Subagents** (`.claude/agents/`): one per skill; fresh context, limited tools, loads its skill.
- **Orchestrator** (`feature-orchestrator` skill, runs in the main session): spawns
  subagents in order, checks each result, and stops at approval gates.

## Feature pipeline
```
1 product-planner     -> GATE A: user approves story + acceptance criteria
2 solution-designer   -> GATE B: user approves spec (API / schema / UI)
3 app-developer       (code + unit/API tests)
4 test-engineer       (coverage gaps; E2E if user flows changed)
5 quality-tester      (review + security + a11y, read-only)
     Critical/High findings -> back to step 3 (max 2 rounds, then ask the user)
6 document-writer + delivery-operator   (parallel; different files)
     -> GATE C: user reviews the diff and approves the commit
```
- A human merges and deploys. No agent does.
- Do not start step 3 unless on a feature branch.

## Shortcut paths
- **Bug fix:** test-engineer (failing regression test) -> app-developer -> quality-tester.
- **Docs only:** document-writer.
- **CI / release only:** delivery-operator.

## Handoff file
Subagents do not share memory. Each story has `work/<story-id>.md` (git-ignored),
read and written by every stage:

```
## Story        ID, title, acceptance criteria (from docs/BACKLOG.md)
## Plan         planner output (approved at Gate A)
## Design       changed docs, task list for app-developer (approved at Gate B)
## Build        files changed, commands run and results
## Tests        tests added/changed, results, remaining gaps
## Review       findings by severity, verdict: pass | fix-needed
## Docs/Release docs updated, release checklist state
## Open questions
```
Each subagent prompt names the story ID, the sections to read, and the section to write.
The orchestrator verifies the section exists and is non-empty before the next stage.

## Subagents
| Agent | Skill | Tools | May write | Model |
|---|---|---|---|---|
| product-planner | product-planner | Read, Grep, Glob, Edit, Write | `docs/BACKLOG.md`, `work/` | sonnet |
| solution-designer | solution-designer | Read, Grep, Glob, Edit, Write | `docs/*`, `work/` | opus |
| app-developer | app-developer | Read, Grep, Glob, Edit, Write, Bash | `server/`, `client/`, unit tests | opus |
| test-engineer | test-engineer | Read, Grep, Glob, Edit, Write, Bash | tests, `e2e/` | sonnet |
| quality-tester | quality-tester | Read, Grep, Glob, Bash (no Edit/Write) | nothing; returns review text | opus |
| document-writer | document-writer | Read, Grep, Glob, Edit, Write | `*.md` | sonnet |
| delivery-operator | delivery-operator | Read, Grep, Glob, Edit, Write, Bash | `.github/`, config, `docs/` | sonnet |

- Definitions live in `.claude/agents/<name>.md`; each preloads its skill via `skills:`.
- Tool limits enforce roles (quality-tester has no Edit/Write).
- Do NOT put `Bash(...)` patterns in `disallowedTools`: in this runtime that removed `Bash`
  entirely (found in the S-001 dry run), leaving app-developer, test-engineer, quality-tester,
  and delivery-operator without a shell. The ban on `git commit/push/merge/rebase/tag` is
  written in each agent's Limits section instead (prompt-level, not tool-enforced).
- `quality-tester` has no write tools: it returns its review (ending in
  `Verdict: pass|fix-needed`) and the orchestrator saves it into `## Review`.
- Model choices are suggestions and can be changed in each file's `model:` field.

## Orchestrator rules
- Never merge, push to `main`, tag, or deploy. Commit only after explicit approval at
  Gate C, on the feature branch. Subagents never commit.
- Stop and ask the user on: ambiguous requirements, a spec conflicting with
  `docs/DECISIONS.md`, a needed new dependency, or two failed fix rounds.
- Report real results: failing tests and skipped stages are shown, not hidden.
- Pass only what a subagent needs (story ID, section names); it reads the repo itself.

## Build order
1. This document (review and approve).
2. Agent files in `.claude/agents/`.
3. `work/` template and `.gitignore` entry.
4. `feature-orchestrator` skill (plus the bug-fix variant).
5. Dry run on story S-001 (project scaffold); replaces the `[unverified]` commands in `CLAUDE.md`.
6. Tune skills and agents from what the dry run shows.
