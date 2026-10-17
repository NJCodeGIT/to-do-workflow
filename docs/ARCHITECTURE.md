# Architecture

```
[ React SPA (Vite) ] --HTTPS/JSON--> [ Express API ] --SQL--> [ SQLite file ]
        |                                  |
   stores JWT                     auth middleware verifies JWT
```

- Stateless API; the only state is the SQLite file (`DATABASE_PATH`).
- Layers: routes -> controllers -> db queries. No separate service layer at this size.
- Auth: register/login return a JWT; client sends `Authorization: Bearer <token>`.
- Authorization: all task access is scoped by the `user_id` in the token.
- Runtime: Node 22 (`.nvmrc`), ESM everywhere (`"type": "module"`).
- Server wiring: `server/src/index.ts` (entry: config, open DB, listen) ->
  `createApp({ db })` in `server/src/app.ts` (routes, 404, error handler). The DB handle
  is stored on `app.locals.db` and read through a typed helper in `server/src/db/`;
  tests build the app with an in-memory DB.
- DB: `openDatabase(path)` in `server/src/db/connection.ts` runs `PRAGMA foreign_keys = ON`
  on every connection. Schema is applied only by `npm run migrate` (no auto-migrate on start).
- Config via env vars, read once in `server/src/config.ts`:
  - `PORT` (default `3001`), `DATABASE_PATH` (default `data/todo.db`; relative paths
    resolve against `server/`; `:memory:` allowed).
  - Planned with the auth story: `JWT_SECRET`, `JWT_EXPIRES_IN`.
  - One optional `.env` at the repo root, loaded by Node's `--env-file-if-exists` (no `dotenv`).
- No CORS: the browser always talks to the same origin (dev proxy / prod static serving).
- Dev: `npm run dev` runs API (3001, `tsx watch`) and Vite (5173, `strictPort`) via
  `concurrently`; Vite proxies `/api` to `http://localhost:<PORT>`.
- Prod (planned, not in S-001): Express serves the built client from `client/dist`
  (single deployable); `/api/*` stays JSON, other GETs fall back to `index.html`.
