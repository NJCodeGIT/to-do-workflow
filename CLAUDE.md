# To-Do App

Minimal to-do web app: users register/login, then create, edit, delete, complete,
and filter their own tasks by status. Monorepo with a REST API and an SPA.

> **Status: pre-scaffold.** No code exists yet. Commands below are the *planned*
> scripts (marked `[unverified]`). Verify against `package.json` once scaffolded,
> then remove the markers.

## Stack
- Client: React + Vite, TypeScript (`client/`)
- Server: Node + Express, TypeScript (`server/`)
- DB: SQLite via `better-sqlite3` (single file, no Docker)
- Auth: email + password (argon2 hash), JWT bearer token
- Validation: zod. Tests: Vitest, Playwright for E2E (planned). Lint/format: ESLint + Prettier
- Package manager: npm workspaces

## Commands (run from repo root) `[unverified]`
- Install: `npm install`
- Dev (API + client): `npm run dev`
- Dev server only / client only: `npm run dev -w server` / `npm run dev -w client`
- Test: `npm test` (all) or `npm test -w server`
- E2E (planned, needs Playwright): `npm run test:e2e`
- Lint: `npm run lint` · Format: `npm run format`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Migrate: `npm run migrate -w server`
- No Docker in this project.

## Folder structure
- `server/src/routes/` – URL + middleware wiring only
- `server/src/controllers/` – parse request, call data layer, shape response
- `server/src/db/` – connection, queries (all SQL lives here)
- `server/src/middleware/` – auth (JWT), error handler
- `server/src/schemas.ts` – zod request schemas
- `server/migrations/` – numbered `.sql` files (`001_init.sql`, ...)
- `client/src/api.ts` – the only place that calls `fetch`
- `client/src/auth/` – auth context, login/register pages
- `client/src/tasks/` – task list, item, form, status filter
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

## Detailed docs (link, don't copy)
- Architecture: `docs/ARCHITECTURE.md`
- REST API contract: `docs/API_SPEC.md`
- DB schema: `docs/DB_SCHEMA.md`
- Conventions (detail): `docs/CONVENTIONS.md`
- CI/CD: `docs/CICD.md`
- Decisions log: `docs/DECISIONS.md`
- Backlog (stories, acceptance criteria): `docs/BACKLOG.md`
- UI wireframes and flows: `docs/UI_SPEC.md`
- Update the relevant doc in the same change as the code it describes.
