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

## S-002 CI workflow  [Must]
Story: As a developer, I want a GitHub Actions workflow that runs the local checks on every pull request and push to `main`, so that failures are visible before merge.
Acceptance:
- `.github/workflows/ci.yml` exists, is valid YAML, and every `run:` command exists in the root `package.json` scripts.
- Triggers are `pull_request` and `push` to `main`; `permissions` is `contents: read`; actions are pinned to full commit SHAs with version comments; `concurrency` (cancel superseded runs) and `timeout-minutes` are set.
- One job on `ubuntu-latest`, Node from `.nvmrc`, npm cache; steps in order: `npm ci`, `lint`, `format:check`, `typecheck`, `test`, `build`.
- The same commands pass locally from a clean `npm ci`; the workflow run on the PR for this branch succeeds.
- `docs/CICD.md` matches the workflow; no application code, dependencies, or secrets changed.
Out of scope: E2E job, deployment/CD, Dependabot, Node version matrix, coverage reporting, `npm audit` gate, branch protection / required status checks (repository settings a human enables; listed in `docs/CICD.md`).
Tasks:
1. [delivery-operator] Add `ci.yml`, update `docs/CICD.md`, verify commands locally.
2. [quality-tester] Review against criteria.
3. [human] Open PR, confirm the run is green, enable required check and branch protection.
