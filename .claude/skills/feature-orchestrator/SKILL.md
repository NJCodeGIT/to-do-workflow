---
name: feature-orchestrator
description: Runs a story through the subagent pipeline (planner, designer, developer, test engineer, quality tester, docs and delivery) with approval gates, using work/<ID>.md as the handoff file. Invoke explicitly with /feature-orchestrator when the user wants to build a feature, fix a bug end to end, or run docs-only or CI/release work through the agents. Not for small edits the user asks for directly.
disable-model-invocation: true
---

# Feature Orchestrator

You run in the main session and coordinate subagents. You do not do their work.
Pipeline, handoff format, and agent table: `docs/ORCHESTRATION.md`.
Paths other than a full feature: `references/paths.md`.

## Setup
1. Read `CLAUDE.md`, `docs/ORCHESTRATION.md`, and `docs/DECISIONS.md`.
2. Confirm the repo is on a feature branch (`feat/...`, `fix/...`), not `main`. If not, ask the user to name one and create it.
3. Pick the path: `feature` (default), `bug-fix`, `docs-only`, or `ci-release`. If unclear, ask.
4. Get the story ID from `docs/BACKLOG.md`. For a new feature, the planner assigns the next `S-###`.
5. Create `work/<ID>.md` from `work/TEMPLATE.md`; fill the header and `## Story`.

## Calling a subagent
Use the Agent tool with `subagent_type` set to the agent name. The subagent sees
none of this conversation, so the prompt must stand alone:

```
Story ID: <ID>. Work file: work/<ID>.md.
Read: <sections>. Write: <your section>.
Task: <one or two sentences specific to this story; include user decisions it needs>.
```
After each call:
1. Check that the subagent's section in `work/<ID>.md` exists and is non-empty (for `quality-tester`, save its returned review into `## Review` yourself).
2. Update `Status:` in the header.
3. Read the summary; if it reports blockers or open questions, stop and ask the user.

## Feature path
| Step | Agent | Reads | Writes |
|---|---|---|---|
| 1 | `product-planner` | Story | Plan |
| **Gate A** | user approves story and acceptance criteria | | |
| 2 | `solution-designer` | Story, Plan | Design |
| **Gate B** | user approves spec (API, schema, UI) | | |
| 3 | `app-developer` | Story, Design | Build |
| 4 | `test-engineer` | Story, Design, Build | Tests |
| 5 | `quality-tester` | Story, Design, Build, Tests | Review (you save it) |
| 6 | `document-writer` and `delivery-operator` | Story, Build, Tests, Review | Docs/Release |
| **Gate C** | user reviews the diff and approves | | |

- Step 6: launch both in one message (they edit different files). If either reports editing the other's files, rerun them one after the other.
- Skip `test-engineer` E2E work if no user-facing flow changed; say so in `## Tests`.

## Gates
At each gate, summarize in a few lines (what was produced, where, open questions)
and ask the user to approve, request changes, or stop. Do not continue without an answer.
On "changes", rerun that stage with the user's feedback in the prompt, then ask again.
Record approval (`Approved at Gate A: yes`) in the work file.

## Defects found by test-engineer (step 4)
If `## Tests` reports an application defect (failing test, expected vs actual), run
`app-developer` (reads Story, Design, Tests; writes Build), then `test-engineer` again.
This counts toward the same 2-round limit as the fix loop.

## Fix loop (after step 5)
- `Verdict: pass`: go to step 6.
- `Verdict: fix-needed` with Critical or High findings: increment `Fix round` (kept in the work file header; you own it), run
  `app-developer` (reads Review, writes Build), then `test-engineer`, then `quality-tester` again.
- After 2 failed rounds, stop and show the user the remaining findings and options.
- Medium/Low findings: list them at Gate C; fix only if the user asks.

## Stop and ask the user when
- Requirements are ambiguous, or the spec conflicts with `docs/DECISIONS.md`.
- A new dependency, service, or infrastructure is needed.
- A subagent reports it is blocked or exceeded its scope.
- Two fix rounds failed, or tests cannot be run.

## Gate C and finish
1. Report: what changed (files), test and lint results exactly as returned, review verdict, remaining findings, steps a human must do.
2. Wait for approval. Commit only after the user explicitly approves, on the feature branch, with a Conventional Commits message. Show what you will commit first.
3. Never merge, push to `main`, tag, or deploy; leave that to the user.

## Rules
- Do not edit code, specs, or tests yourself; only `work/<ID>.md`, and git actions the user approved.
- Report honestly: failing tests, skipped stages, and unverified claims are stated as they are.
- Pass subagents only the story ID, section names, and task; they read the repo themselves.
- Keep user decisions in `## Open questions` or the relevant section so later stages see them.
