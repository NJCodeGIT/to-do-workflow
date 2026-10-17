# Release Checklist

Report each item as done, failed, or not applicable. Do not tick items you did not verify.

## Code and quality
- [ ] Release branch is up to date with `main`; no unrelated changes
- [ ] CI green: lint, typecheck, unit/API tests, build, E2E (if enabled)
- [ ] `quality-tester` review done; no open Critical or High findings
- [ ] `npm audit` shows no high/critical issues

## Data
- [ ] New migrations are numbered, ordered, and tested on a copy of real-shaped data
- [ ] Migrations don't edit applied ones; existing rows handled
- [ ] SQLite backup taken before deploy; restore step tested once

## Config and secrets
- [ ] All required env vars documented in `.env.example` (fake values)
- [ ] `JWT_SECRET` and other secrets set in the target environment, not in the repo
- [ ] `CORS_ORIGIN` set to the real origin, not `*`

## Docs and versioning
- [ ] `docs/API_SPEC.md`, `docs/DB_SCHEMA.md`, `docs/ARCHITECTURE.md` match the release
- [ ] Version bump chosen (semver) and changelog entries drafted
- [ ] `docs/DECISIONS.md` updated for notable choices

## Deploy (performed by a human)
- [ ] Deploy steps written in order, each with a check
- [ ] Rollback steps written: previous build + database restore
- [ ] Maintenance/communication plan if downtime is expected

## Post-deploy verification
- [ ] Health endpoint returns OK
- [ ] Register/login works
- [ ] Create, complete, filter, and delete a task works
- [ ] Logs show no errors; no secrets in logs
- [ ] Rollback decision point: who decides, and by when
