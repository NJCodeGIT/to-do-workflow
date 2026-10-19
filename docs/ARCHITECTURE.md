# Architecture

```
[ React SPA (Vite) ] --HTTPS/JSON--> [ Express API ] --SQL--> [ SQLite file ]
        |                                  |
   stores JWT                     auth middleware verifies JWT
```

- Stateless API; the only state is the SQLite file (`DATABASE_PATH`).
- Layers: routes -> controllers -> db queries. No separate service layer at this size.
- Auth: register/login return a JWT; client sends `Authorization: Bearer <token>`.
  - Passwords: argon2id (`argon2` package), parameters pinned in
    `server/src/auth/password.ts` (`memoryCost 65536` KiB, `timeCost 3`, `parallelism 4`).
    Login with an unknown email still runs one `argon2.verify` against a dummy hash, so an
    unknown email and a wrong password both cost one verify. The dummy hash is computed at
    server startup (`warmDummyHash`, called in `index.ts` after config validation and before
    the DB opens); if that fails the server exits 1 with `Startup error: could not
    initialise password hashing.` A failed hash is not cached (the next call retries). An app
    built with `createApp` alone (tests) computes the dummy hash on first use instead.
  - Tokens: `server/src/auth/token.ts` signs HS256 JWTs (`sub` = user id string, `iat`,
    `exp`) and verifies with `algorithms: ['HS256']` only; `exp` is required.
  - Middleware `requireAuth` (`server/src/middleware/require-auth.ts`) parses the Bearer
    header, verifies the token, and sets `req.userId` (number; typed in
    `server/src/types/express.d.ts`). Handlers read it via `userIdOf(req)`, which fails
    closed with 401 if the middleware did not run. No DB lookup per request.
  - Body parsing: `jsonBody` (`server/src/middleware/json-body.ts`) wraps `express.json`
    and is mounted once on the `/api/v1` router; its parse errors become
    `AppError('VALIDATION_ERROR', 400)` so raw bodies never reach the error logger.
  - Validation: zod schemas in `server/src/schemas.ts`.
  - Data: `server/src/db/users.ts` (all user SQL). Duplicate email is detected by the
    `UNIQUE COLLATE NOCASE` constraint (no pre-check), mapped to `409 EMAIL_TAKEN`.
- Authorization: all task access is scoped by the `user_id` in the token.
- Tasks (S-005): `routes/task-routes.ts` -> `controllers/task-controller.ts` -> `db/tasks.ts`.
  - `requireAuth` is attached per route (`taskRoutes.get('/tasks', requireAuth, ...)`), never
    with a path-less `router.use(requireAuth)`, which would turn unknown-route 404s into 401s.
  - Controllers get the owner only from `userIdOf(req)` and pass it as an explicit `userId`
    argument to every `db/tasks.ts` function; no task function exists without a `userId`
    parameter, and every task SQL statement has `user_id = ?` in its `WHERE` (or sets it on
    `INSERT`). Body and query are parsed with zod (`createTaskSchema`, `listTasksQuerySchema`
    in `schemas.ts`); unknown fields are stripped, so a client-sent `userId` never reaches SQL.
  - `db/tasks.ts` owns the `Task` type and the row (`snake_case`) -> `Task` (`camelCase`)
    mapping; SQL selects an explicit column list without `user_id`. A foreign-key failure on
    insert (token for a user that no longer exists) is mapped there to
    `401 UNAUTHORIZED "Invalid or expired token"` (decision 34).
- Tasks (S-006): `GET`/`PATCH`/`DELETE /tasks/:id`, same layering and `requireAuth` per route.
  - `db/tasks.ts` adds `getTask`, `updateTask` and `deleteTask`, each filtering by `id` and
    `user_id`. `updateTask` is one fixed `UPDATE ... CASE ... RETURNING` statement (atomic, no
    read-then-write); it returns `null` and `deleteTask` returns `false` when no row matches
    (decisions 36-40).
  - `parseTaskId` and `updateTaskSchema` are in `schemas.ts`. The controller turns a malformed
    id and a `null`/`false` data result into one `404 "Task not found"`.
  - The error handler maps a `URIError` with status 400 (the router's undecodable-path error)
    to `404 NOT_FOUND "Route not found"`, unlogged (decision 38).
- Client auth (S-004; screens and messages in `docs/UI_SPEC.md`, decisions #26, #28-#31):
  - `client/src/api.ts` owns `fetch` and the session (`localStorage` key `todo.session`,
    `{token, user}`). It exports `login`/`register` (store the session, return `User`),
    `getCurrentUser`, `clearSession`, `onUnauthorized(listener)`, the generic
    `apiRequest(path, { method, body, auth })` used by future task functions, and `ApiError`
    (`status`, `code`; `status 0` = network failure). The token never leaves this module and
    is never logged; error objects never contain the token or the request body.
  - A 401 on an `auth: true` request clears the session and notifies listeners only if the
    stored token is still the one the request sent; a stale 401 (session changed while the
    request was in flight) just throws. Login/register (`auth: false`) never clear or notify.
  - `client/src/auth/`: `AuthProvider` (React context: `user`, `sessionExpired`, `login`,
    `register`, `logout`; subscribes to `onUnauthorized`), `useAuth`, guards `RequireAuth` and
    `PublicOnly`, `LoginPage`, `RegisterPage`, pure `validation.ts`, `error-messages.ts`,
    `redirect.ts`. `client/src/HomePage.tsx` is the protected home: header, `<h1>`, and `TasksView`.
  - Client tasks (S-007; behavior in `docs/UI_SPEC.md`, decisions #45-#49): `api.ts` exports
    `Task`, `TaskFilter` and `listTasks(filter)` (`GET /tasks?status=`, `auth: true`, response
    checked at runtime, only the seven API keys kept). `client/src/tasks/`: `TasksView` reads the
    filter from the URL and renders `TaskFilterControl`, a `role="status"` region, the error
    alert with Try again, and `TaskList`/`TaskItem`; `useTasks(filter)` returns `{state, reload}`
    and ignores stale responses; `task-filter.ts` holds pure helpers and texts.
  - Client add form (S-008; behavior in `docs/UI_SPEC.md`, decisions #50-#53): `api.ts` adds
    `createTask({ title, description? })` (`POST /tasks`, `auth: true`, 201 body checked with
    `isTask`). `AddTaskForm` is the first child of `TasksView` (above the filter), validates on
    submit with the pure `task-form.ts`, guards double submit with a ref flag, and calls `reload`
    after success.
  - Client edit (S-009; behavior in `docs/UI_SPEC.md`, decisions #54-#57): `api.ts` adds
    `updateTask(id, patch)` (`PATCH /tasks/:id`, `auth: true`, only defined keys sent, 200 body
    checked with `isTask`; `TaskPatch` has no `status`). `TaskItem` shows an `Edit` button or, when
    open, `EditTaskForm` (draft, validation, in-flight guard). `TasksView` owns which task is open
    (`editing = {id, tasks}`, closed whenever the list array is replaced), the `Task updated.`
    status, the 404 alert, and focus after the refetch. `task-form.ts` has `editTaskPatch`
    (changed fields only) and the shared `validateTaskFields`/`taskErrorMessage`. Complete/reopen
    and delete UI are not built yet.
  - Wiring: `main.tsx` renders `BrowserRouter > AuthProvider > App`; `App.tsx` holds `<Routes>` only.
    Routers use `useTransitions={false}` (tests too): otherwise the location update is a
    transition and renders after the auth state update, so on logout `RequireAuth` runs before
    navigation finishes and adds a `from` state (#28).
  - No `dangerouslySetInnerHTML` anywhere (#26).
- Runtime: Node 22 (`.nvmrc`), ESM everywhere (`"type": "module"`).
- Server wiring: `server/src/index.ts` (entry: config, hash warm-up, open DB, listen) ->
  `createApp({ db, auth })` in `server/src/app.ts` (routes, 404, error handler). The DB
  handle is stored on `app.locals.db` and read through a typed helper in `server/src/db/`;
  the auth config (`{ jwtSecret, jwtExpiresInSeconds }`) is stored on `app.locals.auth`
  and read through `authConfigFrom(req)` in `server/src/auth/token.ts`. Tests build the
  app with an in-memory DB and a fake test secret passed in directly (not via env).
- DB: `openDatabase(path)` in `server/src/db/connection.ts` runs `PRAGMA foreign_keys = ON`
  on every connection. Schema is applied only by `npm run migrate` (no auto-migrate on start).
- Config via env vars, read once in `server/src/config.ts`:
  - `PORT` (default `3001`), `DATABASE_PATH` (default `data/todo.db`; relative paths
    resolve against `server/`; `:memory:` allowed).
  - Auth, read by a separate `loadAuthConfig(env)` that only `index.ts` calls (so
    `npm run migrate` and the dev port check need no secret):
    - `JWT_SECRET` (required, at least 32 characters). Missing or short: the server
      prints a one-line `Configuration error: ...` that never contains the value, and
      exits 1 before opening the DB.
    - `JWT_EXPIRES_IN` (default `24h`): positive integer seconds or `<n>s|m|h|d`,
      at most 30 days; converted to seconds. Invalid value: fail fast the same way.
  - One optional `.env` at the repo root, loaded by Node's `--env-file-if-exists` (no `dotenv`).
- No CORS: the browser always talks to the same origin (dev proxy / prod static serving).
- Dev: `npm run dev` runs API (3001, `tsx watch`) and Vite (5173, `strictPort`) via
  `concurrently`; Vite proxies `/api` to `http://localhost:<PORT>`.
- Prod (planned, not in S-001): Express serves the built client from `client/dist`
  (single deployable); `/api/*` stays JSON, other GETs fall back to `index.html`.
