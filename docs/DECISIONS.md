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
