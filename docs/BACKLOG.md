# Backlog

## S-001 Project scaffold  [Must]
Story: As a developer, I want a minimal npm-workspaces monorepo (`server/`, `client/`) with working, verified root scripts, so that later stories have a tested base and CLAUDE.md commands are trustworthy.
Acceptance:
- `npm install` exits 0 from a clean clone with one root `package-lock.json`.
- Every root script runs successfully: `dev` (API + client start; `GET /api/v1/health` returns 200), `test` (server + client tests pass, >= 2), `lint`, `format` (idempotent), `typecheck`, `build`, `migrate` (idempotent on a second run).
- Lint and typecheck exit non-zero on a deliberate error (checked once, reverted); `migrate` with invalid SQL exits non-zero and records nothing.
- `server/migrations/001_init.sql` matches `docs/DB_SCHEMA.md`; foreign keys are ON for every connection.
- One supertest health test (in-memory SQLite) and one Testing Library placeholder-page test pass; unknown API route returns 404 JSON.
- `.nvmrc`, `.env.example` (fake values only), and `.gitignore` (`.env`, `*.db`, `node_modules`, build output) exist; none of the ignored files are tracked.
- `CLAUDE.md` has zero `[unverified]` markers and the pre-scaffold note is updated; every remaining documented command was run and works.
Out of scope: auth, task endpoints, real UI, Playwright/axe/E2E, Docker, CI workflow, git hooks, zod/argon2/jsonwebtoken (deferred), react-router.
Tasks:
1. [solution-designer] Confirm scaffold layout, ports, dev runner, config approach, migration runner behaviour.
2. [app-developer] Root workspace, scripts, `.nvmrc`, `.gitignore`, `.env.example`, shared lint/format/TS config.
3. [app-developer] Server skeleton: Express app, health route, 404/500 JSON error handling, SQLite connection (foreign keys on).
4. [app-developer] Migration runner and `001_init.sql`, tracked in `schema_migrations`.
5. [app-developer] Client skeleton: Vite + React placeholder page, `api.ts` stub, dev proxy.
6. [test-engineer] Health supertest, migration checks, client component test, Vitest config.
7. [app-developer] Wire and run all root scripts; record real results.
8. [quality-tester] Review against criteria, architecture rules, and dependency list.
9. [document-writer] Remove `[unverified]` markers after verification; fix any doc drift.
10. [delivery-operator] Secrets/ignore hygiene and release checklist; no CI.
Dependencies needing Gate A approval (full list in `work/S-001.md`): server `express`, `better-sqlite3`; client `react`, `react-dom`, `vite`, `@vitejs/plugin-react`; shared `typescript`, `eslint`, `prettier`, `vitest`, type packages. Beyond the recorded stack (flagged): `typescript-eslint` family, `eslint-config-prettier`, `concurrently`, `tsx`, `supertest`, `@testing-library/*`, `jsdom`.
Open questions: Node version to pin; approval of flagged extra dependencies; ports (assumed 3001 API, 5173 client); `.env.example` contents (assumed `PORT`, `DATABASE_PATH` only).
