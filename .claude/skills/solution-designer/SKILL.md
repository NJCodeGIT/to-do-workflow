---
name: solution-designer
description: Designs how a feature or change will work before it is coded: architecture, DB schema changes, REST API contract changes, UI wireframes and user flows, and recorded decisions. Use when the user asks to design, architect, or spec a feature, add or change an endpoint or table, choose between technical options, sketch screens, or update the architecture/API/schema docs. Produces specs in docs/, not application code.
---

# Solution Designer

Covers Architect, API Designer, Database Designer, and UI/UX Designer work for the
to-do app. Output is design documents. Do not write application code.

## Before designing
1. Read `CLAUDE.md` (architecture rules) and `docs/DECISIONS.md` (settled choices).
2. Read the relevant story and acceptance criteria in `docs/BACKLOG.md`.
   If none exists, ask the user whether to plan it first (`product-planner`).
3. Read the current `docs/ARCHITECTURE.md`, `docs/API_SPEC.md`, `docs/DB_SCHEMA.md`
   for the parts the change touches. Design the delta, not a rewrite.
4. If requirements are unclear or conflict with a decision, ask before designing.

## Steps
1. **Restate the problem** and constraints in 2-3 lines.
2. **Options**: only if a real choice exists, compare 2-3 options in a short table
   (pros, cons). Recommend one. Skip for obvious cases.
3. **API**: update `docs/API_SPEC.md` — method, path, body, success, errors, and
   validation rules. Follow existing error shape and `camelCase` JSON.
4. **Data**: update `docs/DB_SCHEMA.md` — tables, columns, constraints, indexes.
   Every schema change is a new numbered migration; never alter an applied one.
   Note how existing rows are handled.
5. **Architecture**: update `docs/ARCHITECTURE.md` only if layers, auth, config,
   or deployment change. Respect the routes -> controllers -> db boundaries.
6. **UI** (when screens change): add to `docs/UI_SPEC.md` — ASCII wireframe per
   screen, user flow, states (empty, loading, error), and accessibility notes
   (labels, keyboard use, contrast).
7. **Security check**: for auth, input, or data-access changes, state how the
   change stays scoped by `user_id`, how input is validated, and what is logged.
8. **Record decisions**: append a row to `docs/DECISIONS.md` for each significant choice.

## Output
- Edited docs above, plus a short summary to the user: what changed, why, and
  the open questions.
- Hand the user a task list for `app-developer` (what to build, in order).
- Show the diffs and wait for approval before treating the design as final.

## Rules
- Prefer the minimal design that meets the acceptance criteria.
- Do not add dependencies, services, or infrastructure without asking.
- Never put secrets, keys, or real credentials in specs or examples.
- Do not edit source code or migration files; that belongs to `app-developer`.
- Keep specs consistent: if you change one doc, check the others for conflicts.
