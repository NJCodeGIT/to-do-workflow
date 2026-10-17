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
