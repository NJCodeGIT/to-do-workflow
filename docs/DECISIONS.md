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
| 18 | Express 5; app built by `createApp({ db })`, DB handle on `app.locals.db` | Native async error handling; tests inject in-memory SQLite without globals |
