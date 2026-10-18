# CI/CD

## CI (GitHub Actions, `.github/workflows/ci.yml`)
- Triggers: pull requests and pushes to `main`.
- Job `check` on `ubuntu-latest`, `timeout-minutes: 15`. Two deploy jobs follow it (see CD below).
- Node version comes from `.nvmrc` (`actions/setup-node` with `node-version-file`), npm cache enabled.
- Steps, in order: `npm ci` -> `npm run lint` -> `npm run format:check` -> `npm run typecheck` -> `npm test` -> `npm run build`.
- `permissions: contents: read` only. `check` uses no secrets (only the deploy jobs do).
- `concurrency` group is workflow + ref; a newer run on the same ref cancels the older one,
  except on `main`, where runs queue so a deploy is never cancelled midway.
- Actions are pinned to full commit SHAs with a version comment:
  - `actions/checkout` v7.0.1 (`3d3c42e5aac5ba805825da76410c181273ba90b1`)
  - `actions/setup-node` v7.1.0 (`949feb2413d6458794dcd2491c4babbbce0c15c1`)
  - `cloudflare/wrangler-action` v4.1.3 (`953926a2e2182532811c01a25e53647d93bf07c0`), with `wranglerVersion: '4.151.1'` pinned
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

## CD (client only, Cloudflare Workers static assets)
Added in the same workflow (`ci.yml`) as two jobs that both `needs: check`, so nothing deploys unless
lint, format, typecheck, tests, and build pass. Claude must not deploy or trigger deployments; a human
merges and approves. Not run or verified against a real Cloudflare account yet: first real run is the test.

| Job | Runs on | What it does |
|---|---|---|
| `deploy-preview` | pull requests from this repo (not forks) | `npm ci`, `npm run build -w client`, then `wrangler versions upload --preview-alias pr-<number>` from `client/`. Uploads a non-production Worker version with a preview URL; production traffic is unchanged. Concurrency `deploy-preview-<PR>` cancels older uploads for the same PR. |
| `deploy-production` | push to `main` | Same build, then `wrangler deploy`. Uses GitHub Environment `production`, so it waits for a reviewer. Concurrency `deploy-production`, never cancelled. |

- Config: `client/wrangler.jsonc`. Worker name `todo-client`; `assets.directory` is `./dist` (Vite output);
  `not_found_handling: "single-page-application"` serves `index.html` for unknown paths so deep links
  such as `/login` survive a reload.
- Action `cloudflare/wrangler-action` runs wrangler in `client/`. No npm dependency is added to the repo.
- Both deploy jobs rebuild the client from the same commit instead of passing an artifact (one fewer action to pin).
- Fork PRs get no secrets and no preview. Dependabot PRs also have no access to Actions secrets, so
  their preview job fails; ignore it or skip those PRs.
- The preview URL is printed in the job log (`wrangler versions upload` output). Find it there. Preview
  URLs need the `workers.dev` subdomain and Preview URLs enabled for the Worker (default on for new Workers).
- First-ever upload: if `versions upload` fails because the Worker does not exist yet, do the first
  production deploy first (merge to `main`, approve), then PR previews work.
- Free tier: Workers static asset requests are free and unlimited; the limits that matter are
  100,000 Worker script requests/day (not used here, assets-only) and 20,000 files per version.

### Human setup (once)
1. Cloudflare account: note the Account ID (dashboard, Workers & Pages overview, right side).
2. API token: My Profile -> API Tokens -> Create Token -> template "Edit Cloudflare Workers", or a custom token
   with Account / Workers Scripts / Edit (and Account Settings / Read, User Details / Read if wrangler complains).
   Restrict it to your account. Do not grant Pages, DNS, or zone permissions.
3. GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret:
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Repository (not environment) secrets, because the
   preview job has no environment and needs them too. Never put them in files.
4. GitHub repo -> Settings -> Environments -> New environment `production` -> enable "Required reviewers"
   (add yourself or a team; optionally tick "Prevent self-review" when there is a second reviewer) ->
   under "Deployment branches and tags" choose "Selected branches" and allow only `main`.
   Environments with required reviewers on private repos need GitHub Pro/Team; if unavailable the
   deploy runs without approval (same plan limitation as branch protection above). Check before merging to `main`.
5. Optionally enable branch protection with `check` required (see Repository settings).

### API reachability (open decision)
The API (Express + better-sqlite3) is NOT deployed to Cloudflare. **TODO: the free Node host is not chosen.**
Do not configure a host until decided. The client calls the relative path `/api/v1` (`API_BASE` in
`client/src/api.ts`, the only `fetch` caller), and the server sets no CORS (decision #14, same-origin).
Served from a Workers origin, `/api` currently returns the SPA `index.html` (fallback), so the deployed
client cannot log in until one of these is done:
- **A. Worker proxy (keeps same-origin, no CORS, no client change).** Add a small Worker script to
  `client/wrangler.jsonc` (`main`, `assets.run_worker_first: ["/api/*"]`, `assets.binding`) that forwards `/api/*`
  to the API origin, taken from a `vars` entry or secret such as `API_ORIGIN`. Needs new app-level code (the
  Worker), so it goes to `app-developer`.
- **B. `VITE_API_URL` build variable.** Not supported today: `API_BASE` is a constant. Needs a client change
  (read `import.meta.env.VITE_API_URL`, default `/api/v1`), a CI build variable, and CORS on the server
  allowing the Workers origin (reverses decision #14). Preview URLs change per PR, so CORS would need a pattern.
- Option A is recommended: fewer moving parts, tokens never cross origins. Decide together with the API host.
- Until then the deployed client shows the login page but network calls fail or return HTML.

### Rollback (client)
- Cloudflare dashboard -> Workers & Pages -> `todo-client` -> Deployments (Versions) -> pick the previous
  version -> "Rollback" (or Deploy version at 100%). Instant, no rebuild.
- CLI: `npx wrangler@4.151.1 rollback --config client/wrangler.jsonc` (rolls back to the previous version;
  add a version ID to choose one). Needs the same token locally; do not paste it into shell history.
- Git route: revert the bad commit on a branch, PR, merge to `main`, approve the `production` deploy.
- Verify after rollback: open the production URL, reload on `/login` (no 404), and, once the API exists, log in.
- The API/SQLite database are independent of the client deploy; a client rollback needs no data step.
  Client and API versions must stay compatible, so roll the API back first if a contract changed.

### Post-deploy checks
Production URL loads; `/login` and `/register` load directly (SPA fallback); static assets return 200;
once the API is reachable: `GET /api/v1/health`, login, create a task.

### Follow-ups
- `app-developer`: implement API reachability option A (or B) after the API host is chosen.
- Secrets for the API (`JWT_SECRET`, `DATABASE_PATH`) live on the API host, never in the repo.
- E2E job against the preview URL once Playwright exists.
