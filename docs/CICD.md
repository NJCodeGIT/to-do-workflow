# CI/CD

## CI (GitHub Actions, `.github/workflows/ci.yml`)
- Triggers: pull requests and pushes to `main`.
- Job `check` on `ubuntu-latest`, `timeout-minutes: 15`. Three deploy jobs follow it (see CD below).
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
- `e2e` job (parallel to `check`, not a dependency of the deploy jobs): installs Chromium
  (`npx playwright install --with-deps chromium`), runs `npm run test:e2e`, uploads
  `playwright-report/` and `test-results/` as an artifact on failure.
  `actions/upload-artifact` v7.0.2 (`cf430e030ddbb5b0abf93d22962f4752f3646cd9`).
  Make `e2e` a required check for `main` once it has run green.

## Repository settings (a human must enable; not changed by the workflow)
- After the first run, make the `check` status check required for `main`. The check is named
  `check` (shown as "CI / check" on pull requests); select `check` as the required status check.
- Branch protection on `main`: require a pull request before merging, require status checks to pass
  (and branches up to date), block direct pushes and force pushes.
- Current limitation: branch protection and required checks are unavailable on this repository's
  plan (GitHub returns 403; needs GitHub Pro/Team or a public repo). Until then CI is advisory: a
  failing `check` does not block a merge, and nothing technically blocks direct pushes to `main`.
  The rules in `CLAUDE.md` are the only barrier meanwhile.

## CD (client on Cloudflare Workers static assets, API on Render)
Added in the same workflow (`ci.yml`) as jobs that all `needs: check`, so nothing deploys unless
lint, format, typecheck, tests, and build pass. Claude must not deploy or trigger deployments; a human
merges and approves. `deploy-api` and `deploy-production` have run successfully on `main`; the post-deploy checks below are still to be done by the user.

| Job | Runs on | What it does |
|---|---|---|
| `deploy-preview` | pull requests from this repo (not forks) | `npm ci`, `npm run build -w client`, then `wrangler versions upload --preview-alias pr-<number>` from `client/`. Uploads a non-production Worker version with a preview URL; production traffic is unchanged. Concurrency `deploy-preview-<PR>` cancels older uploads for the same PR. |
| `deploy-production` | push to `main` | Same build, then `wrangler deploy`. Uses GitHub Environment `production`, so it waits for a reviewer. Concurrency `deploy-production`, never cancelled. |

- Config: `client/wrangler.jsonc`. Worker name `todo-client`; `assets.directory` is `./dist` (Vite output);
  `not_found_handling: "single-page-application"` serves `index.html` for unknown paths so deep links
  such as `/login` survive a reload. `main` is `./worker/index.ts`, a small Worker script that only
  proxies `/api/*` to the API (see "API reachability"); wrangler bundles it at deploy time, the Vite
  build does not touch it.
- Action `cloudflare/wrangler-action` runs wrangler in `client/`. No npm dependency is added to the repo.
- Both deploy jobs rebuild the client from the same commit instead of passing an artifact (one fewer action to pin).
- Fork PRs get no secrets and no preview. Dependabot PRs also have no access to Actions secrets, so
  their preview job fails; ignore it or skip those PRs.
- The preview URL is printed in the job log (`wrangler versions upload` output). Find it there. Preview
  URLs need the `workers.dev` subdomain and Preview URLs enabled for the Worker (default on for new Workers).
- First-ever upload: if `versions upload` fails because the Worker does not exist yet, do the first
  production deploy first (merge to `main`, approve), then PR previews work.
- Free tier: Workers static asset requests are free and unlimited; the limits that matter are
  100,000 Worker script requests/day (only `/api/*` runs the script, because of `run_worker_first`)
  and 20,000 files per version. Waiting on the API does not count as CPU time.

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

### API reachability (Option A implemented: Worker proxy to Render)
The API (Express + better-sqlite3) is NOT deployed to Cloudflare; it runs on Render (free web service,
decision #43). Service `todo-api` is live at `https://todo-api-fckp.onrender.com`. The client keeps calling the relative
path `/api/v1` (`API_BASE` in `client/src/api.ts`) and the server still sets no CORS (decision #14): the
Worker makes `/api` same-origin.
- `client/worker/index.ts` (plain TypeScript, minimal inline types, no dependency). `assets.run_worker_first:
  ["/api/*"]` sends only `/api/*` to it; everything else goes straight to static assets (and the Worker also
  passes any non-`/api/` request to `env.ASSETS.fetch`). `assets.binding` is `ASSETS`.
- Proxy behaviour: same method, path (`/api/v1/...` unchanged), query, headers (including `Authorization`),
  and body, sent to `API_ORIGIN`; the response status, headers, and body come back unchanged. Hop-by-hop
  headers (`Connection` and the headers it lists, `Keep-Alive`, `Transfer-Encoding`, `Upgrade`, `TE`,
  `Trailer`, `Proxy-*`) and `Host` are stripped. Redirects are not followed (`redirect: "manual"`).
  Request bodies are buffered (small JSON only). Nothing is logged.
- Errors from the proxy itself: `API_ORIGIN` unset, empty, or not an absolute `http(s)` URL ->
  `502 {"error":{"code":"BAD_GATEWAY","message":"API is not configured"}}`; upstream fetch fails ->
  `502 {"error":{"code":"BAD_GATEWAY","message":"API is unreachable"}}`. The client shows these like any
  other API error. Upstream errors (4xx/5xx from Express) pass through as-is.
- No timeout: a sleeping Render free instance takes about 30-60 s to wake on the first request. The Worker
  waits (Workers do not cap wall-clock time while waiting on a subrequest), so the first request after idle
  is slow but succeeds.

#### Setting `API_ORIGIN`
- It is a plain var in `client/wrangler.jsonc` -> `vars.API_ORIGIN`. Set to the live Render URL
  `https://todo-api-fckp.onrender.com`.
- Value is the origin only: scheme + host, no path, no `/api`, no trailing slash needed (any path is ignored).
- The file is the source of truth: `wrangler deploy` overwrites vars set in the Cloudflare dashboard. Change
  it via a PR; PR previews (`versions upload`) and production use the same value.
- It is not a secret (the API URL is public). Never put `JWT_SECRET` or other API secrets here; those live on
  Render only.
- Check after deploy: `GET <worker-url>/api/v1/health` returns `{"status":"ok"}` (may take up to a minute on
  a cold start); a `502 BAD_GATEWAY` means `API_ORIGIN` is wrong/unset or Render is down.
- Local dev is unchanged: Vite proxies `/api` to `localhost` and the Worker is not used.
  Tests: `client/worker/index.test.ts` (Vitest, Node environment, stubbed `fetch` and `ASSETS`).

### API on Render (free web service, `render.yaml`, decision #44)
Blueprint `render.yaml` at the repo root: service `todo-api`, runtime node, plan free, region `oregon`,
`NODE_VERSION=22` (matches `.nvmrc`), `autoDeployTrigger: off` (deploys only via the Deploy Hook from `deploy-api`).
- Build: `npm ci --include=dev && npm run build -w server`. `--include=dev` is needed because Render sets
  `NODE_ENV=production`, which would skip `typescript`/`tsx`. `argon2` and `better-sqlite3` ship prebuilt binaries;
  otherwise they compile on Render (toolchain present).
- Start: `npm run migrate -w server && npm run start -w server`. Migrations run on every start because the DB is
  empty after each restart. The runner skips applied versions, so it is idempotent; `openDatabase` creates the
  directory. `migrate` uses `tsx` (a devDependency kept in `node_modules` from the build).
- Env: `PORT` is set by Render (default 10000) and read by `config.ts`; Express listens on all interfaces.
  `DATABASE_PATH=/tmp/todo.db`, `JWT_EXPIRES_IN=24h`, `NODE_ENV=production`, `JWT_SECRET` has `generateValue: true`
  (random, stored on Render only; regenerating it logs everyone out).
- Health check path `/api/v1/health`.
- Verified locally (Node 22): build, then migrate on a missing temp DB path (applied `001_init.sql`), migrate again
  ("No pending migrations."), start with `PORT=10000`, `GET /api/v1/health` -> 200 `{"status":"ok"}`. Service `todo-api` is now live on Render; the deployed behavior is not yet verified (see Post-deploy checks).

Free-tier caveats (accepted, decision #43/#44):
- No persistent disk: all users and tasks are lost on every restart, redeploy, or idle spin-down.
  Users must register again. Not suitable for real data.
- The instance sleeps after ~15 min without traffic; the first request takes about 30-60 s (the Worker waits).
- 750 free instance hours per month per workspace (one always-on service uses about 744).
- A token issued before a restart still verifies (same `JWT_SECRET`) but its user no longer exists, so calls
  using it fail until the user registers again.

#### Human setup (once, done: service live, `deploy-api` ran, `API_ORIGIN` set)
1. Render dashboard -> New -> Blueprint -> connect this GitHub repo -> branch `main` -> it reads `render.yaml`
   (`todo-api`, free, autoDeploy off). Apply. The first sync deploys once (from the branch you pick; `render.yaml`
   must exist on that branch, so merge this change first). Check the service and note its URL
   `https://<name>.onrender.com` (the name may get a suffix if `todo-api` is taken).
2. Service -> Settings -> Deploy Hook -> copy the URL. GitHub -> Settings -> Secrets and variables -> Actions ->
   New repository secret `RENDER_DEPLOY_HOOK_URL` (the URL is a credential; never commit or paste it in logs/chat).
3. Optional: repository variable (Variables tab, not a secret) `API_ORIGIN` = the Render URL, to enable the
   post-deploy health check. The check only proves reachability: the hook returns before the build finishes.
4. Set `vars.API_ORIGIN` in `client/wrangler.jsonc` to the same Render URL via a PR (replaced the placeholder),
   then approve the `production` deploys on `main`.
5. Verify: `GET https://<render-url>/api/v1/health` -> `{"status":"ok"}`, then through the Worker
   `GET <worker-url>/api/v1/health`, register, log in, create a task.

#### Rollback (API)
Render dashboard -> `todo-api` -> Events/Deploys -> pick the previous successful deploy -> Rollback (redeploy).
Data is ephemeral, so there is no database restore step. Git route: revert on a branch, PR, merge, approve `deploy-api`.
Roll the API back before the client if a contract changed.

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
Still to be done by the user (not yet verified):
Production URL loads; `/login` and `/register` load directly (SPA fallback); static assets return 200;
once the API is reachable: `GET /api/v1/health`, login, create a task.

### Follow-ups
- User: run the post-deploy checks above against the Worker URL (health, register, log in, create a task).
- `JWT_SECRET` lives on Render only (generated), never in the repo.
- For persistent data later: a paid Render plan with a disk (set `DATABASE_PATH` onto it), or another store.
- Run the E2E suite against the preview URL (today it runs against local dev servers).
