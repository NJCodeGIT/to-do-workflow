# Conventions

## Naming
- Server files `kebab-case.ts`; React components `PascalCase.tsx`; hooks `useThing.ts`;
  other client modules `kebab-case.ts` (e.g. `api.ts`, `error-messages.ts`).
- API JSON `camelCase`; DB columns `snake_case`; map in the data layer only.

## Errors
- Throw typed errors (e.g. `AppError(code, status, message)`) from controllers/data layer.
- A single error middleware converts them to `{error:{code,message}}`.
- Unknown errors return 500 with a generic message; details go to logs only.

## Validation
- zod schema per endpoint in `server/src/schemas.ts`; parse before any logic.
- Client validates for UX only; the server is the source of truth.

## Testing
- Vitest. Server: API tests via supertest against the Express app with in-memory SQLite.
- Client: component tests with Testing Library (+ `user-event`) for forms and the status filter;
  components are tested with `client/src/api.ts` mocked (`vi.mock`) inside a `MemoryRouter`;
  `api.ts` itself is tested with a stubbed `fetch` and a cleared `localStorage`.
- E2E (planned): Playwright in `e2e/`, 3-5 smoke flows only, role/label locators, no fixed sleeps,
  fresh temporary SQLite file per run, axe accessibility check on key pages.
- Most coverage stays at unit/API level; E2E never duplicates it.
- Every bug fix gets a regression test.

## Git
- Branches: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`.
- Conventional Commits. Small, focused commits.
- Never commit `.env`, `*.db`, or `node_modules`.
