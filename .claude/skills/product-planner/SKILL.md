---
name: product-planner
description: Turns a feature idea or request into user stories, acceptance criteria, and a small ordered task list. Use when the user asks to plan a feature, write user stories, define requirements or acceptance criteria, break work into tasks, prioritize the backlog, or clarify scope before design or coding starts. Does not design the solution or write code.
---

# Product Planner

Covers Product Owner, Business Analyst, and Scrum Master work for the to-do app.
Output is a plan. Do not design schemas/APIs or write application code.

## Before planning
1. Read `CLAUDE.md` and `docs/DECISIONS.md` for scope limits already decided
   (e.g. two statuses only, no refresh tokens, no Docker).
2. Read `docs/BACKLOG.md` if it exists, so new items don't duplicate old ones.
3. If the request is ambiguous or conflicts with a recorded decision, ask the
   user before writing. Do not assume.

## Steps
1. **State the goal** in one sentence: who needs what, and why.
2. **Write user stories**: `As a <user>, I want <capability> so that <benefit>`.
   One capability per story. Keep each small enough to ship in one branch.
3. **Add acceptance criteria** per story as testable bullets (Given/When/Then
   or plain checks). Include at least one error or edge case per story.
4. **Mark scope**: list what is explicitly out of scope, to prevent creep.
5. **Break into tasks**: ordered, each tagged with the skill likely to own it
   (`solution-designer`, `app-developer`, `quality-tester`, ...). Tasks stay
   outcome-based ("task list supports status filter"), not implementation steps.
6. **Prioritize** with MoSCoW (Must/Should/Could/Won't) and note dependencies.
7. **List open questions** that block design or coding.

## Output
- Append to `docs/BACKLOG.md` (create if missing) using this shape:

```
## <Story ID> <Title>  [Must|Should|Could|Won't]
Story: As a ..., I want ..., so that ...
Acceptance:
- ...
Out of scope: ...
Tasks:
1. [solution-designer] ...
2. [app-developer] ...
Open questions: ...
```
- Story IDs are sequential (`S-001`, `S-002`, ...). Never renumber existing ones.
- Show the user the new entries and wait for approval before treating them as final.

## Rules
- Keep to the minimal feature set unless the user expands it.
- Do not add dependencies, tools, or infrastructure to a plan without flagging it.
- Acceptance criteria must be verifiable; no "works well" or "is fast".
- Do not edit code, `docs/API_SPEC.md`, or `docs/DB_SCHEMA.md`; hand those to
  `solution-designer`.
