---
name: app-developer
description: Implements features, fixes bugs, and refactors application code in server/ (Express, TypeScript, SQLite) and client/ (React, Vite), including migrations. Use when the user asks to build, implement, add, change, fix, or refactor code, an endpoint, a migration, a React component, or a page. The only skill that writes application code; follows the specs in docs/ and the architecture rules in CLAUDE.md.
---

# App Developer

Covers Frontend, Backend, and Full-Stack work. Implements what the specs say; does
not invent requirements or silently change a design.

## Before coding
1. Read `CLAUDE.md` (commands, architecture rules, restrictions).
2. Read the story in `docs/BACKLOG.md` and the relevant specs: `docs/API_SPEC.md`,
   `docs/DB_SCHEMA.md`, `docs/UI_SPEC.md`, `docs/CONVENTIONS.md`.
3. If the spec is missing, unclear, or contradicts the code, stop and ask. For a
   new feature with no design, suggest `solution-designer` first.
4. Confirm you are on a feature branch (`feat/...`, `fix/...`), never `main`.
5. Read the surrounding code and match its style before writing new code.

## Implementing
1. Work in small slices that each leave tests passing.
2. **Server**: routes wire URLs and middleware only; controllers parse requests and
   shape responses; all SQL lives in `server/src/db/`. Validate every body with zod.
3. **Scoping**: every task query filters by `user_id` from the JWT, never from the
   request. Another user's task returns 404.
4. **Migrations**: add a new numbered file in `server/migrations/`. Never edit an
   applied one. Handle existing rows.
5. **Client**: all HTTP goes through `client/src/api.ts`. Handle loading, empty,
   and error states. Use labels and keyboard-accessible controls.
6. **Errors**: throw typed errors; let the error middleware shape the response.
7. Write or update unit/API tests (Vitest) for the code you change, following
   `docs/CONVENTIONS.md`. Larger suites and E2E tests belong to `test-engineer`.

## Security (auth, input, data access)
- When touching auth, passwords, tokens, user input, or queries, follow
  `.claude/skills/quality-tester/references/security-checklist.md` if it exists.
- Parameterized queries only; never build SQL from strings.
- Never log passwords, hashes, or tokens. Never hardcode secrets; use env vars
  and keep `.env.example` current.

## Before finishing
1. Run the commands from `CLAUDE.md`: lint, typecheck, test, and build if relevant.
   Report failures with their output; do not claim success without running them.
2. Update docs that your change made stale (`docs/API_SPEC.md`, etc.), or flag it
   for `document-writer`.
3. Summarize: what changed, how it was verified, anything not done.
4. Do not commit until the user has reviewed.

## Rules
- Do not add dependencies without asking first.
- Do not change the API contract, schema, or architecture on your own; propose it
  to the user or `solution-designer` and wait.
- Do not merge, deploy, or push to `main`.
- Do not refactor unrelated code or expand scope beyond the story.
- Follow Conventional Commits when the user approves committing.
