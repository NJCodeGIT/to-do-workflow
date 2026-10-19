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
- Invalid body returns `400 VALIDATION_ERROR` for: missing or non-string email/password, malformed email, password shorter than 8 or longer than 128 characters, empty body, non-JSON body. No user row is created.
- Login: valid credentials return `200 {user:{id,email}, token}`.
- Unknown email and wrong password both return `401 UNAUTHORIZED` with the identical body (same code and message); login with a missing field returns 400.
- Token: signed with `JWT_SECRET`, carries the user id and an expiry; a token from register and one from login both pass the middleware.
- Auth middleware: no `Authorization` header, a non-Bearer scheme, a malformed token, a token with a bad signature, and an expired token each return `401 UNAUTHORIZED` in the standard error envelope; a valid token sets the user id from the token only (never from body, query, or params).
- Deferred (Gate A, `docs/DECISIONS.md` row 22): a token for a user that no longer exists stays valid until it expires; no per-request user lookup, and no account deletion exists yet.
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
Resolved at Gate A: password min 8 / max 128, no complexity rules; token lifetime 24h (`JWT_EXPIRES_IN`); client token storage `localStorage` (S-004); `JWT_SECRET` min 32 characters; deleted-user token deferred (row 22); register returns a token; account enumeration via 409 accepted; split into S-003/S-004 approved (task stories become S-005+). The existing `users` table was sufficient (no migration).

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

## Task roadmap (S-005 to S-012)
Added by the product-planner as a pick-list. S-005 to S-009 are planned in full below; S-010 to S-012 are still titles only. Acceptance criteria, out-of-scope notes and the task breakdown for those are written (and approved at Gate A) when a story is picked and run through `/feature-orchestrator`. IDs are final; order is the suggested build order. The `tasks` table already exists in `001_init.sql`, so no story needs a migration unless design finds a gap (S-005 needed none).

## S-005 Task API: create and list with status filter  [Must]
Story: As a logged-in user, I want to create tasks and list my own tasks filtered by status, so that I can capture work and see what is active or done.
Covers: `POST /tasks`, `GET /tasks?status=active|completed|all`; every query scoped by `user_id` from the JWT.
Depends on: S-003.
Status: built and reviewed (Gates A and B approved; quality-tester verdict pass); awaiting merge (details in `work/S-005.md`). Gate A answers: description max 2000, whitespace-only/empty description stored as `null`, title trimmed before the 1-200 check, strict `status` filter, tie-break `id DESC`, body `status` ignored, no pagination. Gate B: `POST /tasks` with a deleted user's token returns 401 (decisions 32-34). Final rules and messages: `docs/API_SPEC.md`.
Acceptance:
- Create: `POST /api/v1/tasks {title, description?}` with a valid token returns `201` with a `Task` (`{id, title, description, status, completedAt, createdAt, updatedAt}`); `status` is `active`, `completedAt` is `null`, `createdAt`/`updatedAt` are ISO-8601 UTC strings. Any `status`, `userId`, `id`, or timestamp in the body is ignored.
- Title is trimmed and must be 1-200 characters after trimming; missing, non-string, empty, whitespace-only, or 201+ characters returns `400 VALIDATION_ERROR` and no row is created. A 200-character title succeeds.
- Description is optional; omitted or `null` is stored and returned as `null`; a string is trimmed (proposed max 2000 characters, see open questions); non-string or too long returns `400`. A whitespace-only string is stored as `null` (proposed).
- Bad body (non-JSON, array, empty) returns `400` as already defined for all JSON routes.
- List: `GET /api/v1/tasks` returns `200 {tasks:[Task]}`; no `status` param equals `all`. `status=active` returns only active tasks, `completed` only completed, `all` both.
- Ordering: newest first by `createdAt`, ties broken by `id` descending, so the order is deterministic. Zero tasks returns `{tasks:[]}`, not an error.
- Invalid filter (`status=done`, empty `status=`, wrong case `Active`, repeated `status=active&status=all`) returns `400 VALIDATION_ERROR`; nothing is returned.
- Auth: both endpoints return `401 UNAUTHORIZED` with no header, bad scheme, malformed, bad-signature, or expired token (reuses S-003 middleware; no task data in the response).
- Isolation: with tasks owned by user A and user B, A's list never contains B's tasks for any filter, and vice versa; a `userId` or `user_id` in the query string or body does not change the result or the owner. A created task belongs to the token's user (verified by listing as that user, and not visible to the other).
- Every task SQL statement is in `server/src/db/` and filters by `user_id`; routes hold no logic, controllers hold no SQL. Responses never expose `user_id`.
- Tests (in-memory SQLite) cover each bullet above; `npm run lint`, `npm test`, `npm run typecheck`, `npm run build` pass; `docs/API_SPEC.md` is updated with the final rules and messages.
Out of scope: `GET /tasks/:id`, edit, complete/reopen, delete (S-006); pagination, search, sorting options, limits per user; any client UI or `api.ts` changes (S-007+); new migration (unless design finds a gap); new dependencies; rate limiting.
Tasks:
1. [solution-designer] Confirm task validation messages and description bound, null/empty handling, ordering tie-break, `status` query parsing (repeated or empty value), timestamp format; update `docs/API_SPEC.md` (and `docs/DB_SCHEMA.md` only if a gap is found).
2. [app-developer] zod schemas for create body and list query; task data layer in `server/src/db/tasks.ts` (insert, list by user and status, row-to-`Task` mapping).
3. [app-developer] Task controller and routes mounted behind the auth middleware.
4. [test-engineer] API tests: create (valid, bounds, defaults, ignored fields), list (filters, ordering, empty), invalid filter, 401 cases, two-user isolation.
5. [quality-tester] Review against criteria, the `user_id` scoping rule, and layering rules.
6. [document-writer] Update `CLAUDE.md` status and folder notes (`tasks.ts`, controller, routes), verify docs match behavior.
7. [delivery-operator] Release checklist; no CI change expected.
Dependencies needing Gate A approval: none (existing `express`, `zod`, `better-sqlite3`, `supertest`).
Open questions: none (all resolved at Gates A and B; see `work/S-005.md`).

## S-006 Task API: get, edit, complete/reopen, delete  [Must]
Story: As a logged-in user, I want to read, edit, complete, reopen and delete a single task, so that I can keep my list accurate.
Covers: `GET /tasks/:id`, `PATCH /tasks/:id` (title, description, status; completing sets `completedAt`), `DELETE /tasks/:id`; another user's task returns 404.
Depends on: S-005 (merged).
Status: built and reviewed (Gates A and B approved; quality-tester verdict pass); awaiting merge (details in `work/S-006.md`). Gate A answers: empty patch is 400, reopen clears `completedAt`, re-complete keeps it, malformed id is 404, same-value patch keeps `updatedAt`, `description: null`/`""` clears (decisions 35-40). Final rules and messages: `docs/API_SPEC.md`.
Acceptance (proposed defaults in brackets await Gate A, see open questions):
- Get: `GET /api/v1/tasks/:id` for the caller's task returns `200` with a `Task` (same seven keys as S-005, no `user_id`).
- Id format: `:id` must be a positive integer in plain decimal digits. [Proposed: anything else (`abc`, `0`, `-1`, `1.5`, `1e2`, ` 1`, an id above the safe-integer range) returns `404 NOT_FOUND`, same as a missing task, so the id format is not an oracle.] No 500 for any id string.
- Not found: a nonexistent id, another user's id, and an already deleted id all return `404 NOT_FOUND` with the identical body, for GET, PATCH and DELETE. Nothing is changed or deleted by a 404 request.
- Patch edit: `PATCH` with any of `title`, `description`, `status` updates only the fields present and returns `200` with the full updated `Task`. Omitted fields are unchanged.
- Patch title/description use the S-005 rules and messages (title trimmed, 1-200, not null; description trimmed, max 2000, `null` or empty/whitespace-only clears it to `null`).
- Complete: `{"status":"completed"}` on an active task sets `status` `completed` and `completedAt` to an ISO-8601 UTC ms string; `updatedAt` is refreshed.
- Reopen: `{"status":"active"}` on a completed task sets `status` `active` and `completedAt` `null`.
- Same-status patch: [Proposed: completing an already completed task keeps the original `completedAt`; reopening an active task leaves `completedAt` `null`; both return `200`, not an error.]
- Invalid status (`done`, `Active`, `null`, number, empty string) returns `400 VALIDATION_ERROR` and the task is unchanged.
- Empty patch: [Proposed: `{}`, or a body with only unknown/ignored fields, returns `400 VALIDATION_ERROR` "at least one of title, description, status is required"; no write, `updatedAt` unchanged.] Missing body, non-object, array, malformed JSON keep the existing `400` messages.
- A failing field rejects the whole request: no partial write when one field is valid and another invalid (e.g. valid `title` with `status:"done"`).
- Ignored fields: `id`, `userId`, `user_id`, `completedAt`, `createdAt`, `updatedAt` in the body are ignored; the owner and `completedAt` cannot be set directly.
- `updatedAt` changes on every successful write that changes data and `createdAt` never changes. [Proposed: a valid patch that changes nothing, e.g. same title, still returns 200; whether it bumps `updatedAt` is a design decision.]
- Delete: `DELETE /api/v1/tasks/:id` for the caller's task returns `204` with an empty body; a following `GET` returns `404` and the task is gone from `GET /tasks` for every filter; a second `DELETE` returns `404`.
- Auth: all three endpoints return `401 UNAUTHORIZED` with no header, bad scheme, malformed, bad-signature or expired token (S-003 middleware), and no task data in the response. Check order stays: body parsing 400 -> auth 401 -> id/validation -> data.
- Deleted-user token (decision 34 pattern): a valid token whose user no longer exists gets `404` on these routes (no task can match); no 500.
- Isolation: with tasks owned by users A and B, A cannot read, patch (including status) or delete B's task; B's task is unchanged afterwards (verified by reading it as B); `userId`/`user_id` in query or body does not change the owner or the match. Every SQL statement filters by `id` and `user_id` together.
- Layering: SQL only in `server/src/db/tasks.ts`, no SQL in controllers, routes hold wiring only; no migration; no new dependency; no client or `api.ts` changes.
- Tests (in-memory SQLite) cover each bullet above; `npm run lint`, `npm test`, `npm run typecheck`, `npm run build` pass; `docs/API_SPEC.md` is updated with final rules and messages (the S-005 note that `/tasks/:id` falls through to 404 is removed); `CLAUDE.md` status and folder notes updated.
Out of scope: any client UI or `api.ts` change (S-009, S-010); a dedicated complete/reopen endpoint (decision 6); `PUT`, bulk update/delete, soft delete or undo; restoring deleted tasks; changing task owner; pagination, search, sorting; optimistic concurrency / ETag / `If-Match`; new migration (unless design finds a gap; `DB_SCHEMA.md` already says `completed_at` is set on complete and cleared on reopen, `updated_at` set by the app on every update); new dependencies; rate limiting.
Tasks:
1. [solution-designer] Resolve the open questions below; define zod patch schema (partial, at-least-one-field rule, messages), id parsing, same-status and no-op behaviour, `updatedAt` rule, and the atomic update strategy (single `UPDATE ... WHERE id = ? AND user_id = ?` with `RETURNING`, so no read-then-write race); update `docs/API_SPEC.md` (and `docs/DB_SCHEMA.md` only if a gap is found).
2. [app-developer] Data layer in `server/src/db/tasks.ts`: get by id, update by id, delete by id, all scoped by `user_id`, row-to-`Task` mapping reused.
3. [app-developer] zod patch schema and id handling; controller handlers (get, patch, delete) and routes mounted behind the auth middleware.
4. [test-engineer] API tests: get (own, missing, other user, bad ids), patch (each field, multi-field, null/clear description, bounds, complete/reopen with `completedAt`, same-status, invalid status, empty body, ignored fields, no partial write), delete (204, then 404, second delete 404, gone from lists), 401 cases, two-user isolation for all three verbs, deleted-user token.
5. [quality-tester] Review against criteria, the `user_id` scoping rule, 404-not-403, and layering rules.
6. [document-writer] Update `CLAUDE.md` status and folder notes, verify `docs/API_SPEC.md` matches behaviour.
7. [delivery-operator] Release checklist; no CI change expected.
Dependencies needing Gate A approval: none (existing `express`, `zod`, `better-sqlite3`, `supertest`).
Open questions (proposed default in brackets; none block starting design if the defaults are accepted at Gate A):
1. Empty or no-op PATCH body: reject with 400 [proposed] or return 200 with the unchanged task?
2. `completedAt` on reopen: clear to `null` [proposed, matches `DB_SCHEMA.md`] or keep the last completion time?
3. Re-completing an already completed task: keep the original `completedAt` [proposed] or refresh it?
4. Invalid `:id` format (`abc`, `0`, `1.5`): `404` [proposed, one behaviour for "no such task"] or `400 VALIDATION_ERROR`?
5. Does a patch that changes no values (same title) bump `updatedAt`? [proposed: no; only real changes do, designer to confirm].
6. `description: null` and `""` in PATCH clear the description to `null` [proposed, consistent with decision 32]; `title: null` is a 400.
Decision log: designer records the answers to 1-5 as new rows in `docs/DECISIONS.md`.

## S-007 Client: task list and status filter  [Must]
Story: As a logged-in user, I want to see my tasks and filter them by All / Active / Completed, so that I can focus on what matters.
Covers: `client/src/tasks/`, task calls in `api.ts`, replaces the placeholder `HomePage`; empty, loading and error states.
Depends on: S-005, S-004.
Status: built and reviewed (Gates A and B approved; quality-tester verdict pass); awaiting merge (details in `work/S-007.md`). Gate A answers: all six proposed defaults accepted (decisions 45-49).
Acceptance (proposed defaults in brackets below were accepted at Gate A):
- Home (`/`, protected) replaces "Task list coming soon." with the task list; header (signed-in email, Log out) and `<h1>Your tasks</h1>` stay. Document title unchanged.
- Data: `api.ts` gains a `Task` type (the seven API keys) and `listTasks(status)` calling `GET /api/v1/tasks?status=...` with `auth: true`; no component calls `fetch` or reads storage.
- Initial load: filter is All; while the request is in flight a loading indicator (`role="status"`, text such as "Loading tasks...") is shown and no list or empty message is shown.
- Success: tasks render in the order the API returns (newest first, no client re-sorting). Each item shows the title, the description when not `null`, and the status as text ("Active" / "Completed"), so status does not rely on color alone. Title and description render as plain text (no HTML injection, decision 26). Items are in a `<ul>`.
- Filter: a control with three choices, All / Active / Completed, reachable and operable by keyboard, the current choice exposed to assistive tech (`aria-pressed` buttons or equivalent; design decides). Choosing one requests that status from the API [proposed: server-side filtering, one request per change] and shows only matching tasks. Choosing the already selected choice does nothing.
- Filter state [proposed: kept in the URL as `?status=active|completed`, All = no param] so reload and Back keep the view; an unknown or repeated `status` in the URL falls back to All and is never sent to the API.
- Switching filters: the previous list is replaced by the loading state, not shown under the new filter's label; a slow earlier response must never overwrite a later choice (stale responses are ignored).
- Empty states (zero tasks, not an error), one message per filter: All "You have no tasks yet."; Active "No active tasks."; Completed "No completed tasks." The filter control stays usable.
- Error state: a network failure, 5xx, 400 or malformed response shows an `role="alert"` message (fixed client text, not raw server text) and a "Try again" button that repeats the request for the current filter; the filter control stays usable and no stale list is shown.
- 401 on the list call uses the existing global handling (session cleared, redirect to `/login`, session-expired notice, return to `/`); it does not show the list error state.
- Another user's tasks are never shown (list comes only from the authenticated call); after logout and login as a different user the list shows the new user's tasks, not the old ones.
- Accessibility: one `<h1>`; list is a real list; loading is `role="status"`, error is `role="alert"`, results change is announced politely (e.g. the empty or count text in a live region; design decides); no autofocus on load; visible focus kept.
- Client component tests (`api.ts` mocked) cover each bullet above: loading, list with and without description, each filter's request argument and empty message, URL param fallback, error plus retry, stale response ignored, 401 path, logout/login isolation. `api.test.ts` covers `listTasks` (URL, Bearer header, parsed result, error mapping). `npm run lint`, `npm test`, `npm run typecheck`, `npm run build` pass.
- `docs/UI_SPEC.md` (home wireframe, states, filter, a11y), `CLAUDE.md` (status, `client/src/tasks/` folder note) updated; `docs/API_SPEC.md` unchanged (no server change).
Out of scope: add form (S-008), edit (S-009), complete/reopen/delete controls (S-010); any server, API contract, or migration change; client-side sorting, search, pagination, task counts per filter, date display, optimistic updates, polling or auto-refresh, caching across filters; E2E (S-011); styling beyond usable and accessible; new dependencies.
Tasks:
1. [solution-designer] Resolve the open questions; design the `Task`/`listTasks` types in `api.ts`, the `client/src/tasks/` components and data-loading hook (loading/error/empty/stale-response handling), the filter control and its a11y, wireframes and states in `docs/UI_SPEC.md`. Leave seams for S-008..S-010 (create/edit/complete/delete will need to refetch or update the list).
2. [app-developer] `api.ts`: `Task` type and `listTasks`; error mapping to a fixed message.
3. [app-developer] `client/src/tasks/`: list, item, filter control, loading/empty/error states; replace the placeholder in `HomePage`.
4. [test-engineer] Component tests with `api.ts` mocked (all acceptance bullets) and `listTasks` tests in `api.test.ts`; update existing `HomePage`/`App` tests that expect the placeholder text.
5. [quality-tester] Review against criteria, layering (no `fetch` outside `api.ts`), a11y basics, stale-response handling.
6. [document-writer] Update `CLAUDE.md` status and folder notes, `docs/UI_SPEC.md`; verify commands.
7. [delivery-operator] Release checklist; no CI change expected.
Dependencies needing Gate A approval: none (existing `react`, `react-router-dom`, `@testing-library/*`, `user-event`). No `fetch` wrapper, state, or data-fetching library (e.g. React Query) is proposed.
Open questions (proposed default in brackets; none block starting design if the defaults are accepted at Gate A):
1. Where does the filter live? [proposed: URL `?status=`, invalid falls back to All] or component state (lost on reload)?
2. Filter on the server (one request per choice) [proposed, API already supports it, strict values] or fetch All once and filter in the client (fewer requests, but S-008..S-010 must keep two views in sync)?
3. Filter control shape: toggle buttons with `aria-pressed` [proposed] or radio group or tabs?
4. Show created/completed dates on items? [proposed: no, out of scope]
5. Error text: one fixed message for all failures ("Could not load your tasks. Try again.") [proposed] or separate network vs server messages as in the auth forms?
6. Long descriptions (up to 2000 chars): show in full, wrapping [proposed] or truncate?

## S-008 Client: add a task  [Must]
Story: As a logged-in user, I want a form to add a task with a title and optional description, so that I can capture work quickly.
Covers: create form with validation messages, list updates after submit, no double submit.
Depends on: S-007 (merged, PR #16), S-005 (merged; `POST /tasks` exists).
Status: built and reviewed (Gates A and B approved; quality-tester verdict pass); awaiting merge (details in `work/S-008.md`). Gate A answers: all eight proposed defaults accepted (decisions 50-53).
Acceptance (the defaults accepted at Gate A are written as decided behavior):
- Placement: on Home (`/`), inside the task view, an "Add a task" form sits between `<h1>Your tasks</h1>` and the filter control. Header, `<h1>`, document title and the S-007 list behavior are unchanged. The form is visible in every state of the list (loading, ready, empty, error) and for every filter.
- Fields: a text input "Title" (required) and a multi-line "Description (optional)" field, each with a visible `<label htmlFor>`; a submit button "Add task". `<form noValidate>`, so our messages are the only ones. No autofocus on load.
- Data: `api.ts` gains `createTask({ title, description? })` calling `POST /api/v1/tasks` with `auth: true` and returning the created `Task` (checked at runtime like `listTasks`; a malformed or empty 201 body throws `ApiError(status, 'UNKNOWN_ERROR')`). No component calls `fetch` or reads storage.
- Client validation on submit only, mirroring decision 32 / `docs/API_SPEC.md`: title trimmed, empty or whitespace-only is blocked (`Enter a title.`); title longer than 200 after trim is blocked (`Title must be at most 200 characters.`); description trimmed longer than 2000 is blocked (`Description must be at most 2000 characters.`). A 200-character title and a 2000-character description are accepted. Lengths are JS string length. Invalid submit sends nothing, shows field errors (`aria-invalid`, `aria-describedby`), focuses the first invalid field; editing a field clears its error.
- Payload: the trimmed title is sent; the description is trimmed and, when empty or whitespace-only, omitted from the body (`null` would be equivalent). Nothing else is sent (no `status`, `userId`).
- No double submit: while the request is in flight the button is disabled with label `Adding...` and a second submit (Enter or click) sends no second request (the handler checks an in-flight flag, not only `disabled`). Inputs stay editable; typing during flight does not alter the sent payload.
- Success: the form is cleared (title and description empty, no errors), focus moves to the title input so tasks can be added back to back, and the visible list reflects the new task without a page reload: the current filter is refetched with the existing `reload()` seam (no client-side insertion, no client sorting; the API order is shown, so a new active task appears first under All and Active). A polite confirmation (`role="status"`, e.g. `Task added.`) is announced.
- Filter interaction (the filter is not changed): a new task is `active`. Under All or Active it appears at the top of the refetched list. Under Completed it does not match, so the list is refetched and stays as is, and the confirmation says so (e.g. `Task added. It is active, so it is not shown under Completed.`). The URL is not changed by adding.
- Stale/ordering: a list response from before the add never overwrites the refetch (existing `ignore` flag); two adds in a row end with the list from the last refetch.
- Server errors (form-level `role="alert"`, text `Error: <message>`, values kept, focus to the title input, button re-enabled): `400 VALIDATION_ERROR` shows the server's fixed message verbatim (decision 31 pattern); network failure shows `Could not reach the server. Check your connection and try again.`; 5xx, other status, or malformed response shows `Something went wrong. Please try again.`. The form-level error is cleared on the next submit.
- 401 on create uses the existing global handling (session cleared, redirect to `/login`, session-expired notice); no form error is shown. A deleted-user token also gets 401 (decision 34), same path.
- A failed refetch after a successful add shows the existing S-007 list error state with Try again; the add itself is not reported as failed and the form is already cleared.
- Text safety: submitted title and description are rendered only as plain text (decision 26); a title like `<b>x</b>` shows literally.
- Accessibility: one `<h1>` (unchanged); inputs labelled; field errors via `aria-invalid` + `aria-describedby`; form-level error `role="alert"`; confirmation in a persistent `role="status"` region separate from the list-results region; the whole form works by keyboard only (Tab order: title, description, Add task; Enter in the title submits; Enter in the description inserts a newline; Add task by Enter/Space); visible focus kept; no `tabIndex` above 0; no `maxLength` attribute that silently truncates or blocks paste.
- Client tests (`api.ts` mocked): valid submit (payload, trimmed title, description omitted when blank), each validation message and the 200/2000 boundaries, nothing sent when invalid, double submit sends one request, button disabled/label while in flight, success clears the form and refetches and shows the new task, add under Completed (not shown, message), 400 server message, network and 5xx messages, values kept after error, 401 path, refetch-failure state, plain-text rendering, keyboard submit, focus handling. `api.test.ts` covers `createTask` (URL, method, Bearer header, JSON body, parsed result, malformed result, error mapping). Existing TasksView/App tests still pass. `npm run lint`, `npm test`, `npm run typecheck`, `npm run build` pass.
- `docs/UI_SPEC.md` (add form wireframe, states, validation table, errors, filter interaction, a11y) and `CLAUDE.md` (status, `client/src/tasks/` folder note) updated; `docs/API_SPEC.md` unchanged (no server change).
Out of scope: edit (S-009), complete/reopen/delete controls (S-010); any server, API contract, or migration change; E2E (S-011); optimistic insertion or client-side list merge; a silent (no loading flash) refetch beyond what the design needs; character counters; drafts persisted across reload; undo; Ctrl+Enter shortcut; modal or separate page for adding; auto-switching the filter; retry of a create whose response was lost (a user retry may create a duplicate, accepted, no idempotency key); client dedupe of identical titles; styling beyond usable and accessible; new dependencies.
Tasks:
1. [solution-designer] Resolve the open questions; design `createTask` in `api.ts`, the add-form component in `client/src/tasks/` (state, in-flight guard, validation module, focus handling), how `TasksView` wires `reload()` and the confirmation message, the loading-flash behavior on refetch, and the confirmation text per filter; add the wireframe, states and validation table to `docs/UI_SPEC.md` and decision rows to `docs/DECISIONS.md`.
2. [app-developer] `api.ts`: `createTask` with runtime result check and error mapping.
3. [app-developer] `client/src/tasks/`: add-form component with validation, in-flight guard, error and confirmation messages; mount it in `TasksView` and call `reload()` after success.
4. [test-engineer] Component tests with `api.ts` mocked (all bullets above) and `createTask` tests in `api.test.ts`.
5. [quality-tester] Review against criteria, layering (no `fetch` outside `api.ts`), a11y basics, double-submit and stale-response handling, plain-text rendering.
6. [document-writer] Update `CLAUDE.md` status and folder notes, `docs/UI_SPEC.md`; verify commands.
7. [delivery-operator] Release checklist; no CI change expected.
Dependencies needing Gate A approval: none (existing `react`, `react-router-dom`, `@testing-library/*`, `user-event`). No form library, validation library (no `zod` on the client, decision 31), or data-fetching library is used.
Open questions (all answered at Gate A; the defaults were accepted; decisions 50-53):
1. Adding while Completed is selected: answered, keep the filter and explain in the confirmation.
2. Refetch after success: answered, `reload()` as is (shows `Loading tasks...` briefly, no hook change).
3. Empty description in the request: answered, omit the key.
4. Description field: answered, multi-line `<textarea>`.
5. Over-limit input: answered, validation message on submit, no `maxLength`.
6. Success announcement: answered, `Task added.` status message that stays until the next submit.
7. Form position: answered, above the filter.
8. Lost response after a successful create: answered, accept the duplicate risk (no idempotency key).

## S-009 Client: edit a task  [Must]
Story: As a logged-in user, I want to edit a task's title and description, so that I can correct or refine it.
Covers: edit form (inline or page; decided in design), validation, cancel, keyboard use.
Depends on: S-006 (merged), S-007 (merged), S-008 (merged, PR #17; its form pattern, `reload()` seam and message helpers are reused).
Status: built and reviewed (Gates A and B approved; quality-tester verdict pass after fix round 1, which found and fixed a filter round-trip bug that reopened a closed edit form); awaiting merge (details in `work/S-009.md`). Gate A answers: all ten proposed defaults accepted (decisions 54-57).
Acceptance (the defaults accepted at Gate A are written as decided behavior):
- Entry point: every task item in the list has an `Edit` button (both Active and Completed tasks; the server allows both). Its accessible name includes the task title (e.g. `Edit Buy milk`; the visible text `Edit` is contained in the name). The button works by keyboard (Tab, Enter, Space).
- Placement (inline): activating `Edit` replaces that item's read-only content with an edit form inside the same `<li>`; the page, URL, header, `<h1>`, filter control and Add form do not change. No modal, no separate route.
- Form: a text input `Title` pre-filled with the current title and a multi-line `Description (optional)` pre-filled with the current description (empty when `null`), each with a visible `<label htmlFor>` and ids unique per task; buttons `Save` and `Cancel`. `<form noValidate>`, so our messages are the only ones. Plain-text values only (decision 26).
- Only one task in edit mode at a time: while one task is being edited, the `Edit` buttons of the other items are disabled; there is no silent switch that discards a draft.
- Focus on open: the Title input receives focus (caret at the end). Nothing is autofocused on page load.
- Client validation on Save only, mirroring decision 32 and the S-008 rules and messages: title trimmed, empty or whitespace-only is blocked (`Enter a title.`), longer than 200 after trim is blocked (`Title must be at most 200 characters.`); description trimmed longer than 2000 is blocked (`Description must be at most 2000 characters.`). A 200-character title and a 2000-character description are accepted. Invalid Save sends nothing, shows field errors (`aria-invalid`, `aria-describedby`), focuses the first invalid field; editing a field clears its error.
- Payload (changed fields only): the request is `PATCH /tasks/:id` carrying only the fields whose trimmed value differs from the task as shown. A changed title sends the trimmed title. A changed description sends the trimmed string; clearing a description that had text sends `description: null` (the server stores `""` and `null` the same, decisions 32, 35-40). Never `status`, `userId`, `id` or timestamps. An empty patch is never sent (the server would answer 400, decision 35).
- Unchanged Save (no request): if both trimmed values equal the current ones (including whitespace-only differences), Save sends nothing, closes the form without an error and moves focus to that item's `Edit` button. (The server would also accept a same-value patch as a 200 no-op that leaves `updatedAt` unchanged, decision 39; skipping the request is a UX choice only.)
- No double submit: while the request is in flight Save is disabled with label `Saving...`, a second submit (Enter or click) sends no second request (an in-flight flag is checked, not only `disabled`), and Cancel and Escape are ignored/disabled until the response arrives. The sent payload is fixed at submit time.
- Success: the form closes, the visible list reflects the saved values without a page reload by refetching the current filter with the existing `reload()` seam (no client-side merge of the returned task, no client sorting; the API order is shown, an edit does not change the order or the filter match because status and `createdAt` are untouched). A polite confirmation (`role="status"`, `Task updated.`) is announced in a persistent region that is not the list-results region. When the refetch finishes, focus is placed on that task's `Edit` button (focus must not fall to `<body>` when the list re-renders).
- Cancel: the `Cancel` button and the Escape key (pressed anywhere in the form, not during IME composition or while saving; a superset of "either field", accepted at Gate B) close the form, discard the draft without a confirmation prompt, send no request, show no message, and return focus to that item's `Edit` button. The item shows the original values again.
- Keyboard: Tab order is Title, Description, Save, Cancel; Enter in the Title input submits; Enter in the Description inserts a newline; Save and Cancel work with Enter/Space; Escape cancels from either field (not while a request is in flight); visible focus kept; no `tabIndex` above 0; no `maxLength` that silently truncates or blocks paste.
- Server and network errors (form-level `role="alert"` inside the edit form, text `Error: <message>`, form stays open, values kept, Save re-enabled, focus to the Title input), same mapping as S-008 (decision 53): `400 VALIDATION_ERROR` shows the server's fixed message verbatim; network failure shows `Could not reach the server. Check your connection and try again.`; 5xx, other status or malformed response shows `Something went wrong. Please try again.`. The error is cleared on the next Save.
- 404 (task deleted elsewhere, or no longer the caller's): the edit form closes, the list is refetched (the task disappears), and a fixed alert message outside the item (`role="alert"`, `Error: This task no longer exists.`) is shown; focus goes to the pressed filter button if it was lost. The id is never echoed from server text. No retry is offered.
- 401 on the PATCH uses the existing global handling (session cleared, redirect to `/login`, session-expired notice); no form error is shown. A deleted-user token is also treated this way only if the server answers 401; a `404` is handled as above (the server returns 404 for a deleted-user token on `/tasks/:id`, `docs/API_SPEC.md`).
- Reload while editing: anything that reloads or replaces the list (a successful Add task, Try again after a list error, changing the filter) closes the edit form and discards the draft, because the list is replaced by the loading state (decision 47). Editing a task does not disable the Add form or the filter control. A list response from before a save never overwrites the refetch (existing `ignore` flag).
- Filter interaction: the filter is not changed and the URL is not changed by editing. The edited task stays in the current view (Active, Completed or All) because its status is unchanged.
- Text safety: edited title and description are rendered only as plain text; a title like `<b>x</b>` shows literally, in the form and in the list.
- Accessibility: the edit form is named (e.g. `aria-label` `Edit task`); inputs labelled; field errors via `aria-invalid` + `aria-describedby`; form-level error `role="alert"`; confirmation in a persistent `role="status"` region; per-item per-field ids are unique even with several tasks; the existing `task-<id>-title` id stays on the read-only title; the whole flow works by keyboard only.
- Data: `api.ts` gains `updateTask(id, { title?, description? })` (description may be `null`) calling `PATCH /api/v1/tasks/:id` with `auth: true` and returning the updated `Task` (checked at runtime like `listTasks`/`createTask`; a malformed or empty 200 body throws `ApiError(status, 'UNKNOWN_ERROR')`). The patch type does not include `status` (S-010 widens it). No component calls `fetch` or reads storage.
- Client tests (`api.ts` mocked): `Edit` opens the pre-filled form with focus in the title; each validation message and the 200/2000 boundaries; nothing sent when invalid; only changed fields sent (title only, description only, both); description cleared sends `null`; unchanged and whitespace-only-change Save sends nothing and closes; double submit sends one request; Saving label and disabled Cancel in flight; success closes, refetches, shows the new values and `Task updated.`, focus on the item's `Edit` button; Cancel and Escape (from both fields) restore the original text and focus; Enter in title submits, Enter in description does not; 400, network, 5xx messages and values kept; 404 path; 401 path; only one task editable (other `Edit` buttons disabled); Add / filter change / Try again close the form; refetch-failure shows the S-007 list error; plain-text rendering. `api.test.ts` covers `updateTask` (URL, method, Bearer header, JSON body incl. `null` description, parsed result, malformed result, error mapping). Existing TasksView/AddTaskForm/App tests still pass. `npm run lint`, `npm test`, `npm run typecheck`, `npm run build` pass.
- `docs/UI_SPEC.md` (edit wireframe and states, validation table reference, errors, focus, a11y), `docs/DECISIONS.md` (new rows from #54) and `CLAUDE.md` (status, `client/src/tasks/` folder note) updated; `docs/API_SPEC.md` unchanged (no server change).
Out of scope: complete/reopen and delete controls (S-010); editing `status` or timestamps; any server, API contract or migration change; E2E (S-011); a modal, a separate edit page or route, or editing several tasks at once; optimistic update or client-side list merge; a silent (no loading flash) refetch beyond what the design needs; unsaved-changes prompts, drafts kept across reload, filter change or Add; undo; conflict detection / ETag / `If-Match` (last write wins); character counters; Ctrl+Enter shortcut; double-click-to-edit; showing dates; styling beyond usable and accessible; new dependencies.
Tasks:
1. [solution-designer] Resolve the open questions; design `updateTask` in `api.ts`; the inline edit component in `client/src/tasks/` (open/cancel/save state, in-flight guard, where the edit state lives so `TaskItem` stays simple), how `TasksView` wires `reload()`, the confirmation, the 404 message and the focus-after-reload step; reuse or generalize the `task-form.ts` validation and error mapping instead of duplicating them; add the wireframe, states and focus rules to `docs/UI_SPEC.md` and decision rows to `docs/DECISIONS.md`.
2. [app-developer] `api.ts`: `updateTask` with runtime result check and error mapping.
3. [app-developer] `client/src/tasks/`: `Edit` button and inline edit form with validation, changed-fields payload, unchanged-save shortcut, in-flight guard, error/404/confirmation messages, Cancel/Escape, focus handling; wire `TasksView` to `reload()`.
4. [test-engineer] Component tests with `api.ts` mocked (all bullets above) and `updateTask` tests in `api.test.ts`; update `TaskItem`/`TaskList` tests for the new props and button.
5. [quality-tester] Review against criteria, layering (no `fetch` outside `api.ts`), a11y basics and focus management, double-submit and stale-response handling, plain-text rendering, no empty or full-body PATCH.
6. [document-writer] Update `CLAUDE.md` status and folder notes, `docs/UI_SPEC.md`; verify commands.
7. [delivery-operator] Release checklist; no CI change expected.
Dependencies needing Gate A approval: none (existing `react`, `react-router-dom`, `@testing-library/*`, `user-event`). No form, validation or data-fetching library.
Open questions (all answered at Gate A; the defaults were accepted; decisions 54-57):
1. Inline or separate page/modal: answered, inline in the list item.
2. Changed fields only or both fields: answered, changed fields only.
3. Save with no change: answered, close without a request and without a message.
4. Another task's `Edit` while one is open: answered, other `Edit` buttons disabled.
5. Add, Try again or filter change while editing: answered, close the form and discard the draft (falls out of decision 47).
6. After a successful save: answered, `reload()` plus `Task updated.` and focus to the item's `Edit` button.
7. 404 on save: answered, close, refetch, fixed alert `This task no longer exists.`.
8. Cancel or Escape with unsaved changes: answered, discard silently.
9. Completed tasks editable: answered, yes.
10. Shared status region for add and edit confirmations: answered, separate regions (edit text cleared when the next edit opens).

## S-010 Client: complete, reopen and delete a task  [Must]
Story: As a logged-in user, I want to mark a task complete, reopen it, and delete it with a confirmation, so that my list reflects reality and stays tidy.
Covers: complete/reopen toggle, delete with confirm, list and active filter stay correct afterwards.
Depends on: S-006, S-007.

## S-011 E2E smoke tests with accessibility checks  [Should]
Story: As a maintainer, I want a few browser tests of the main flows with automated a11y checks, so that regressions in real user journeys are caught in CI.
Covers: Playwright + `@axe-core/playwright` (decision 10, new dev dependencies flagged at Gate A), 3-5 tests: register/login, add, complete, filter, delete; `npm run test:e2e`; optional CI job.
Depends on: S-008, S-009, S-010.

## S-012 Production serving and release readiness  [Should]
Story: As a maintainer, I want the built app to run as one process with a documented release and rollback checklist, so that I can deploy it confidently.
Covers: Express serves `client/dist` with SPA fallback (decision 14, not implemented yet), build-and-run check, release checklist, versioning, rollback and backup notes in `docs/CICD.md`. Prepares only; no deploy.
Depends on: S-010.

Not planned (Won't, unless you expand scope): due dates, priorities, tags, search, sorting options, task sharing, refresh tokens, password reset, email verification, rate limiting, account deletion.
