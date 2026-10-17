# CI/CD

**Planned, not yet implemented.**

## CI (GitHub Actions, `.github/workflows/ci.yml`)
- Triggers: pull requests and pushes to `main`.
- Steps: `npm ci` -> `npm run lint` -> `npm run typecheck` -> `npm test` -> `npm run build`.
- Node version pinned via `.nvmrc`.
- Separate E2E job (planned): install Playwright browsers -> `npm run test:e2e`;
  upload the Playwright report as an artifact on failure.

## CD
- Not defined yet. Claude must not deploy or trigger deployments.
- Secrets (e.g. `JWT_SECRET`) live in the hosting provider / GitHub secrets, never in the repo.
