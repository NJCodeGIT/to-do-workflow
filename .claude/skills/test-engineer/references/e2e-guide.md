# E2E Guide (Playwright)

Status: installed (`@playwright/test`, `@axe-core/playwright`). Existing flows are in
`e2e/smoke.spec.ts`, helpers in `e2e/helpers.ts`. Verify real commands in `package.json`.
Locally: `npx playwright install chromium` once, or set `PW_CHROMIUM_PATH` to an existing Chromium.

## Layout
- Tests in `e2e/`, config in `playwright.config.ts` at the repo root.
- Script `npm run test:e2e` starts the API and client against a
  temporary SQLite file, runs the tests, then removes the file.

## Principles
- Keep the suite small: 3-5 smoke flows, each independent.
- Each test creates its own user (unique fake email) and cleans up via fresh DB per run.
- Locate elements by role, label, or visible text (`getByRole`, `getByLabel`); no CSS selectors.
- Use Playwright auto-waiting and `expect(...)` assertions; no fixed sleeps.
- Reuse login through a saved auth state (`storageState`) instead of logging in via the UI in every test.
- Keep traces/screenshots on failure only.

## Smoke flows
1. Register, land on the task list, log out, log in again.
2. Create a task, edit its title, mark it complete, reopen it, delete it.
3. Filter by Active / Completed / All and see the right tasks.
4. Visiting the task list without a session redirects to login.
5. (Optional) Another user's data is never shown after switching accounts.

## Accessibility checks
- Run axe on login, register, and task list pages; fail on serious or critical violations.
- Automated checks do not replace the manual list in
  `.claude/skills/quality-tester/references/review-checklist.md`.

## CI
- Runs in a separate job from unit tests (see `docs/CICD.md`); upload the Playwright report on failure.
