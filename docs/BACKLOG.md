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

## S-003 Server auth: register, login, JWT middleware  [Must]
Story: As a visitor, I want to register and log in with email and password, so that I get a token that identifies me to the API. As the API, I want middleware that verifies the token and exposes the user id, so that later task routes are scoped to the caller.
Acceptance:
- Register: `POST /api/v1/auth/register {email, password}` with valid input returns `201 {user:{id,email}, token}`; the response never contains the password or hash; the stored value is an argon2 hash, not the password.
- Given an email already registered, register returns `409 EMAIL_TAKEN`; the same email in different case (`A@x.com` vs `a@x.com`) also returns 409.
- Email is stored and returned trimmed; login with different case or surrounding whitespace succeeds.
- Invalid body returns `400 VALIDATION_ERROR` for: missing or non-string email/password, malformed email, password shorter than the minimum (assumed 8, see open questions), empty body, non-JSON body. No user row is created.
- Login: valid credentials return `200 {user:{id,email}, token}`.
- Unknown email and wrong password both return `401 UNAUTHORIZED` with the identical body (same code and message); login with a missing field returns 400.
- Token: signed with `JWT_SECRET`, carries the user id and an expiry; a token from register and one from login both pass the middleware.
- Auth middleware: no `Authorization` header, a non-Bearer scheme, a malformed token, a token with a bad signature, and an expired token each return `401 UNAUTHORIZED` in the standard error envelope; a valid token sets the user id from the token only (never from body, query, or params).
- A token for a user that no longer exists returns 401 (decision needed, see open questions).
- Server fails fast at startup with a clear message if `JWT_SECRET` is missing or shorter than the minimum length; the message does not print the value.
- No log line or response contains a password, hash, or token (checked in tests where feasible).
- A protected probe is needed to test the middleware end to end: tests mount the middleware on a test-only route; no task endpoints are added.
- `npm run lint`, `npm test`, `npm run typecheck`, `npm run build` pass; server tests use in-memory SQLite; `.env.example` has a fake `JWT_SECRET` and the token lifetime variable; `docs/API_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, and `CLAUDE.md` are updated.
Out of scope: any client UI, task endpoints, refresh tokens, logout endpoint (client discards the token), password reset, email verification, social login, rate limiting or lockout, password change, `GET /auth/me`, E2E.
Tasks:
1. [solution-designer] Confirm API details (error messages, token claims, lifetime, config validation, middleware shape, whether the existing `users` table needs a migration), update `docs/API_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`.
2. [app-developer] Config: `JWT_SECRET` and token lifetime read from env, fail-fast validation, `.env.example` updated.
3. [app-developer] zod schemas and the register and login endpoints (route, controller, data layer).
4. [app-developer] Password hashing and token signing/verification; auth middleware that sets the user id.
5. [test-engineer] API tests (in-memory SQLite) for every acceptance bullet above, including the 401 sameness and token edge cases.
6. [quality-tester] Review against criteria, architecture rules, and the dependency list.
7. [document-writer] Update `CLAUDE.md` status and folder notes, verify docs match behavior.
8. [delivery-operator] Secrets hygiene check (no real secret committed), release checklist; CI needs no change unless CI lacks `JWT_SECRET` for tests (tests should set it themselves).
Dependencies needing Gate A approval: server runtime `argon2`, `jsonwebtoken`, `zod`; server dev `@types/jsonwebtoken` (`argon2` ships its own types; `zod` too). Beyond the recorded stack: none (all three are named in CLAUDE.md; `jsonwebtoken` is implied by "JWT").
Open questions: password policy beyond min length; token lifetime; minimum `JWT_SECRET` length; stale-token-for-deleted-user behavior; confirm that the existing `users` table (unique, NOCASE email) is sufficient.

## S-004 Client auth: register, login, logout, route guard  [Must]
Story: As a visitor, I want register and login pages and a way to log out, so that I can use the app with my own account and unauthenticated users cannot reach private pages.
Acceptance:
- Register page: valid submit calls the API, stores the token, and navigates to the (placeholder) home page as logged in.
- Login page: valid submit does the same; a 401 shows one generic message ("Invalid email or password"), never revealing which part was wrong.
- A 409 on register shows an "email already registered" message; 400 shows a field-level or form-level validation message; a network or 500 error shows a generic error and the form stays editable.
- Client-side checks mirror the server (email format, password minimum) and block submit with a visible message; the submit button is disabled while a request is in flight (no double submit).
- Inputs have labels, errors are announced (`role="alert"` or equivalent), and the forms work by keyboard only.
- Protected-route guard: with no token, visiting a protected path redirects to login; with a token, it renders the page. After login, the user returns to the page they tried to open (if any).
- Logged-in users visiting login/register are redirected to home.
- Logout clears the token and returns to login; protected pages are no longer reachable without logging in again.
- When any API call returns 401 on an authenticated request (expired or invalid token), the client clears the token and redirects to login.
- All `fetch` calls and token read/write live in `client/src/api.ts` (or a module it owns); components do not touch storage or `fetch`; the token is never logged or rendered.
- Client component tests cover each bullet above with `api.ts` mocked; `npm run lint`, `npm test`, `npm run typecheck`, `npm run build` pass.
- `docs/UI_SPEC.md`, `CLAUDE.md` folder notes (`client/src/auth/`), and `docs/DECISIONS.md` (token storage choice) are updated.
Out of scope: task list UI (next stories), remember-me, password-strength meter, show-password toggle, forgot-password link, profile page, E2E (Playwright not installed), styling beyond usable and accessible.
Tasks:
1. [solution-designer] Pages, routes, auth state shape, token storage decision and its XSS/CSRF note, wireframes in `docs/UI_SPEC.md`.
2. [app-developer] `api.ts` auth functions and token handling, including 401 handling.
3. [app-developer] Auth state and route guard; register and login pages; logout control; placeholder home.
4. [test-engineer] Component tests for forms, errors, guard, logout, 401 handling.
5. [quality-tester] Review (including a11y basics and token-handling rules).
6. [document-writer] Update `CLAUDE.md` status, `UI_SPEC.md`, verify commands.
Dependencies needing Gate A approval: client runtime `react-router-dom` (beyond the recorded stack, flagged; alternative is a tiny hand-rolled hash/state router, which costs more code than it saves); `@testing-library/user-event` for form tests only if not already present (flagged, check `client/package.json`).
Open questions: token storage location (see S-003 plan open question); whether home is a placeholder until the tasks stories land; depends on S-003 being merged (or at least its API contract approved).
