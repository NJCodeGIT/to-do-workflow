# CI/CD

## CI (GitHub Actions, `.github/workflows/ci.yml`)
- Triggers: pull requests and pushes to `main`.
- One job (`check`) on `ubuntu-latest`, `timeout-minutes: 15`.
- Node version comes from `.nvmrc` (`actions/setup-node` with `node-version-file`), npm cache enabled.
- Steps, in order: `npm ci` -> `npm run lint` -> `npm run format:check` -> `npm run typecheck` -> `npm test` -> `npm run build`.
- `permissions: contents: read` only. No secrets are used.
- `concurrency` group is workflow + ref; a newer run on the same ref cancels the older one.
- Actions are pinned to full commit SHAs with a version comment:
  - `actions/checkout` v7.0.1 (`3d3c42e5aac5ba805825da76410c181273ba90b1`)
  - `actions/setup-node` v7.1.0 (`949feb2413d6458794dcd2491c4babbbce0c15c1`)
  - To upgrade, resolve the new tag to its commit SHA (`git ls-remote https://github.com/actions/<name> refs/tags/<tag>`; for annotated tags use the peeled `^{}` commit) and update SHA and comment together.
- Planned, not implemented: separate E2E job (install Playwright browsers -> `npm run test:e2e`;
  upload the Playwright report as an artifact on failure), once Playwright is added.

## Repository settings (a human must enable; not changed by the workflow)
- After the first run, make the `CI / check` status check required for `main`.
- Branch protection on `main`: require a pull request before merging, require status checks to pass
  (and branches up to date), block direct pushes and force pushes.

## CD
- Not defined yet. Claude must not deploy or trigger deployments.
- Secrets (e.g. `JWT_SECRET`) live in the hosting provider / GitHub secrets, never in the repo.
