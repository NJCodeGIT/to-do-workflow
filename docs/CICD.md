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
- After the first run, make the `check` status check required for `main`. The check is named
  `check` (shown as "CI / check" on pull requests); select `check` as the required status check.
- Branch protection on `main`: require a pull request before merging, require status checks to pass
  (and branches up to date), block direct pushes and force pushes.
- Current limitation: branch protection and required checks are unavailable on this repository's
  plan (GitHub returns 403; needs GitHub Pro/Team or a public repo). Until then CI is advisory: a
  failing `check` does not block a merge, and nothing technically blocks direct pushes to `main`.
  The rules in `CLAUDE.md` are the only barrier meanwhile.

## CD
- Not defined yet. Claude must not deploy or trigger deployments.
- Secrets (e.g. `JWT_SECRET`) live in the hosting provider / GitHub secrets, never in the repo.
