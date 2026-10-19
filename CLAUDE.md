# To-Do App

Minimal to-do web app: users register/login, then create, edit, delete, complete,
and filter their own tasks by status. Monorepo with a REST API and an SPA.

> **Status: task API, task list UI and add-task form built (S-005 to S-008).** The monorepo runs: health endpoint, SQLite
> migration runner, register/login endpoints and JWT middleware, client login/register/logout
> with route guards, `POST /tasks` + `GET /tasks?status=`, and
> `GET/PATCH/DELETE /tasks/:id` (edit, complete/reopen, delete). The home page shows the user's task list with an
> All/Active/Completed filter and an add-task form (title, optional description; S-008). Edit, complete/reopen and delete UI and E2E are not built yet.
> CD (live): client deploys to Cloudflare Workers via `.github/workflows/ci.yml`
> (preview on PRs, `production` environment on `main`); a Worker script proxies `/api/*` to the API on
> Render (free; service `todo-api` live at `https://todo-api-fckp.onrender.com`, `API_ORIGIN` set; `deploy-api` and
> `deploy-production` have run on `main`; data is wiped on restart, cold start 30-60 s). Post-deploy checks (health via Worker URL,
> register/login/create task) are still to be done by the user. See `docs/CICD.md`.

## Stack
- Client: React + Vite, TypeScript, `react-router-dom` (`client/`)
- Server: Node + Express, TypeScript (`server/`)
- DB: SQLite via `better-sqlite3` (single file, no Docker)
- Auth: email + password (argon2 hash), JWT bearer token
- Validation: zod (server only). Tests: Vitest (+ Testing Library, `user-event` on the client), Playwright for E2E (planned). Lint/format: ESLint + Prettier
- Package manager: npm workspaces

## Commands (run from repo root)
Commands were run and checked in S-001; auth config was added in S-003.
- Setup: `nvm use` (reads `.nvmrc`; Node `^22.13.0`), then `npm install`.
  `npm run dev` and `npm run start -w server` need a `.env` (`cp .env.example .env`) with
  `JWT_SECRET` of at least 32 characters; the server exits 1 without it. The `change-me`
  placeholder is deliberately too short: replace it with a random value (command in
  `.env.example`). `PORT`, `DATABASE_PATH`, `JWT_EXPIRES_IN` have defaults.
  `npm run migrate`, tests, and CI need no secret. Without a `.env`, Node prints
  `../.env not found. Continuing without it.`; it is harmless.
- Dev (API + client): `npm run dev` (API `http://localhost:3001`, client `http://localhost:5173`;
  Vite proxies `/api` to the API). A taken port makes it exit with an error.
- Dev server only / client only: `npm run dev:server` / `npm run dev:client`
  (same as `npm run dev -w server` / `npm run dev -w client`)
- Test: `npm test` (all), `npm test -w server`, or `npm test -w client`
- E2E (planned, not installed; needs Playwright): `npm run test:e2e`
- Lint: `npm run lint` · Format: `npm run format` · Format check: `npm run format:check`
  (lint and format are root-only, no `-w` form)
- Typecheck: `npm run typecheck` · Build: `npm run build` (both also work with `-w server|client`)
- Run built server: `npm run build` then `npm run start -w server`
- Migrate: `npm run migrate` (same as `npm run migrate -w server`); manual only, not run on start
- No Docker in this project.

## Folder structure
- `server/src/index.ts` – entry; `app.ts` – `createApp({ db, auth })`; `config.ts` – env config;
  `errors.ts` – `AppError`; `schemas.ts` – zod schemas + `parseBody`
- `server/src/routes/` – URL + middleware wiring only (`auth-routes.ts`, `health-routes.ts`, `task-routes.ts`)
- `server/src/controllers/` – parse request, call data layer, shape response (`auth-controller.ts`, `task-controller.ts`)
- `server/src/auth/` – argon2 password hashing (`password.ts`), JWT sign/verify (`token.ts`)
- `server/src/db/` – connection, migration runner, queries (all SQL lives here; `users.ts`, `tasks.ts`)
- `server/src/middleware/` – `json-body.ts`, `require-auth.ts`, 404, error handler
- `server/src/types/express.d.ts` – adds `req.userId`
- `server/migrations/` – numbered `.sql` files (`001_init.sql`, ...)
- `server/scripts/` – dev-only helpers (`check-port.ts`)
- `server/test/` – Vitest tests; `helpers.ts` (`makeTestApp`, fake `TEST_AUTH`);
  `fixtures/` (test-only preloads); task API tests in `tasks.test.ts`, `tasks-extra.test.ts` (create/list) and
  `task-item.test.ts`, `task-item-extra.test.ts` (get/edit/complete/delete)
- `client/src/api.ts` – the only place that calls `fetch`
- `client/src/auth/` – `AuthProvider`, `RequireAuth`/`PublicOnly` guards, `LoginPage`,
  `RegisterPage`, `validation.ts`, `error-messages.ts`, `redirect.ts` (+ tests)
- `client/src/` also holds `main.tsx`, `App.tsx` (routes), `HomePage.tsx` (protected home, renders the task list),
  and tests (`App.test.tsx`, `api.test.ts`, `test/setup.ts`, `test/render-app.tsx`)
- `client/worker/` – Cloudflare Worker (`index.ts`, `main` in `client/wrangler.jsonc`) proxying `/api/*`
  to `API_ORIGIN`; not part of the Vite build (+ `index.test.ts`)
- `client/src/tasks/` – task list UI: `TasksView.tsx` (container, filter in URL `?status=`),
  `useTasks.ts` (loading hook), `TaskFilterControl.tsx`, `TaskList.tsx`, `TaskItem.tsx`,
  `task-filter.ts` (pure helpers and texts), `AddTaskForm.tsx` (add form above the filter),
  `task-form.ts` (pure validation, payload, messages) (+ tests). `api.ts` has `Task`, `listTasks(filter)`
  and `createTask({ title, description? })`.
- `docs/` – detailed docs (see below)

## Architecture rules
- Routes contain no business logic; controllers contain no SQL.
- Every task query MUST be scoped by `user_id` taken from the JWT, never from the request body.
- Another user's task returns 404, not 403.
- Validate every request body with zod before use.
- Client components never call `fetch` directly; use `client/src/api.ts`.
- Schema changes only via a new numbered migration; never edit an applied one.

## Conventions
- Files: `kebab-case` for server, `PascalCase.tsx` for React components.
- API JSON uses `camelCase`; DB columns use `snake_case` (map in the data layer).
- Errors: throw typed errors; one error middleware returns `{error:{code,message}}`.
- Never log passwords, hashes, or tokens.
- Tests: Vitest; API tests hit the Express app against an in-memory SQLite DB.
  Add or update a test for every behavior change.
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).

## Rules and restrictions
- Work on feature branches; never commit directly to `main`.
- Never merge, deploy, or push to `main`.
- Do not add dependencies without asking first.
- Never commit secrets. Config goes in `.env` (git-ignored); keep `.env.example` current.
- Before every commit: run `npm run lint` and `npm test`; both must pass.
- Do not commit until the user has reviewed the changes.

## Agent workflow
- Run a story end to end with `/feature-orchestrator` (planner, designer, developer, test
  engineer, quality tester, docs/delivery) with approval gates A/B/C. Details and the handoff
  file (`work/<ID>.md`, git-ignored) are in `docs/ORCHESTRATION.md`.
- Agents are in `.claude/agents/`, role skills in `.claude/skills/`, permission rules in
  `.claude/settings.json`. For small direct edits you can skip the pipeline.

## Detailed docs (link, don't copy)
- Orchestration (agents, gates, handoff): `docs/ORCHESTRATION.md`
- Architecture: `docs/ARCHITECTURE.md`
- REST API contract: `docs/API_SPEC.md`
- DB schema: `docs/DB_SCHEMA.md`
- Conventions (detail): `docs/CONVENTIONS.md`
- CI/CD (CI, Cloudflare client deploy, rollback): `docs/CICD.md`
- Decisions log: `docs/DECISIONS.md`
- Backlog (stories, acceptance criteria): `docs/BACKLOG.md`
- UI wireframes and flows: `docs/UI_SPEC.md`
- Update the relevant doc in the same change as the code it describes.
