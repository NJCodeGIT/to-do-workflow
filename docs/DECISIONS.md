# Decisions Log

Newest last. Add an entry when a significant choice is made.

| # | Decision | Reason |
|---|---|---|
| 1 | Monorepo with npm workspaces (`server/`, `client/`) | One repo, shared tooling, simple |
| 2 | SQLite via `better-sqlite3` | No DB server, zero setup, enough for this scale |
| 3 | No Docker | SQLite needs no external service |
| 4 | JWT bearer auth, no refresh tokens / reset / email verification | Keep minimal; revisit if needed |
| 5 | Two statuses only: `active`, `completed` | Minimal feature set |
| 6 | Complete via `PATCH` on `status`, no dedicated endpoint | Fewer endpoints |
| 7 | Other users' tasks return 404, not 403 | Avoid leaking task IDs |
| 8 | No service layer: routes -> controllers -> db | Too small to justify it |
| 9 | Conventional Commits, feature branches, no direct push to `main` | Clear history, safe workflow |
| 10 | Playwright (+ `@axe-core/playwright`) for E2E, planned dev dependencies, 3-5 smoke tests | Cover real user flows and automated a11y checks without a slow suite |
| 11 | Skills split: `quality-tester` reviews, `test-engineer` writes/runs automated tests | Separate judgment from test-building; keep each skill focused |
| 12 | Node 22 (`.nvmrc` `22`, `engines` `^22.13.0`); env from one optional root `.env` via Node `--env-file-if-exists`, no `dotenv` | Current LTS; built-in env loading avoids a dependency. `engines` raised from `^22.9.0` because installed tooling requires it (eslint 10 and jsdom 29 need `^22.13.0`) |
| 13 | ESM everywhere; server built with `tsc` (NodeNext, `.js` import suffixes), run in dev/migrate with `tsx`; client built with Vite | One module system; no bundler on the server |
| 14 | No CORS and no `CORS_ORIGIN`: Vite proxies `/api` in dev, Express serves `client/dist` in prod | Same-origin in both modes; one less dependency and config var |
| 15 | Own minimal migration runner: `schema_migrations(version, applied_at)`, ordered `NNN_*.sql`, one transaction per file, run only by `npm run migrate` | ~50 lines, no migration library; explicit, idempotent, clean failure |
| 16 | `npm run dev` = `concurrently --kill-others-on-fail`; API port checked before `tsx watch`, Vite uses `strictPort` | Watch mode never exits on a crash, so a taken port must fail before it starts |
| 17 | Root-level ESLint flat config (typescript-eslint recommended, not type-aware; react-hooks rules; eslint-config-prettier) and Prettier (Markdown ignored); Vitest per workspace | One lint/format setup; fast lint; hand-written docs not reflowed |
| 18 | Express 5; app built by `createApp({ db, auth })` (`auth` added in S-003), DB handle on `app.locals.db` | Native async error handling; tests inject in-memory SQLite without globals |
| 19 | Password policy: 8-128 characters, not trimmed, no complexity rules; login checks only 1-128 | Length is what matters (NIST 800-63B); max bounds request/hash work; login never reveals the policy via 400 vs 401 |
| 20 | argon2id (`argon2` package) with pinned params `memoryCost 65536` KiB, `timeCost 3`, `parallelism 4`; tests use the same params (no test-only weakening) | Current library defaults, above the OWASP minimum; pinning prevents silent changes on upgrade; tests stay fast by signing tokens directly for middleware tests and limiting registrations, not by weakening hashing |
| 21 | JWT HS256 only via `jsonwebtoken`; claims `sub` (user id string), `iat`, `exp` only; verify with `algorithms: ['HS256']`, `exp` required | Pinning the algorithm blocks `none`/alg-confusion; no email or other PII in the token |
| 22 | Token lifetime `JWT_EXPIRES_IN`, default 24h, max 30d; single access token, no refresh; no per-request user lookup, so a token for a deleted user stays valid until expiry (deferred: no account deletion exists) | Minimal app; 24h balances re-login friction against exposure; stateless middleware |
| 23 | `JWT_SECRET` required, at least 32 characters, validated by a separate `loadAuthConfig` called only by the server entry; fail fast without printing the value; `.env.example` placeholder `change-me` is deliberately too short; tests pass a fake secret to `createApp` | Secrets never in code; copying `.env.example` unedited cannot start a server with a known secret; `npm run migrate` and the port check keep working without a secret; CI needs no secret |
| 24 | Email normalized in zod: trim, then lowercase, max 254; `users.email UNIQUE COLLATE NOCASE` kept (no migration); duplicates detected by the constraint and mapped to `409 EMAIL_TAKEN` | One canonical form in DB and responses; the constraint handles concurrent registrations with no check-then-insert race |
| 25 | Account enumeration: register's `409 EMAIL_TAKEN` is accepted; login returns an identical 401 (`Invalid email or password`) for unknown email and wrong password, with a dummy argon2 verify for unknown emails; the dummy hash is computed at server startup (failure exits 1 with a generic message, a failed hash is not cached) | Clear UX on register for a minimal app; both login failures run one argon2 verify, so message and timing are equalized for the real server (an app built with `createApp` alone, as in tests, computes the dummy hash on first use). No rate limiting yet (out of scope) |
| 26 | Client (S-004) stores the token in `localStorage`, only through `client/src/api.ts`; rule: no `dangerouslySetInnerHTML` anywhere | Survives reload, simple; bearer header added by code means no CSRF exposure; XSS theft risk reduced by banning raw HTML injection. Rejected: in-memory (lost on reload), httpOnly cookie (needs CSRF and changes decision 4) |
| 27 | JSON parsed once on the `/api/v1` router by a `jsonBody` wrapper (`express.json`, 100kb, strict); any body-parser error becomes `400 VALIDATION_ERROR "Invalid request body"` | One mount point for all future routes; body-parser errors carry the raw body, so converting them to `AppError` keeps bodies (passwords) out of logs. Trade-off: a malformed body to an unknown `/api/v1` path gets 400, not 404 |
