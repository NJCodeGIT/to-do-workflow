# Conventions

## Naming
- Server files `kebab-case.ts`; React components `PascalCase.tsx`; hooks `useThing.ts`.
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
- Client: component tests with Testing Library for forms and the status filter.
- Every bug fix gets a regression test.

## Git
- Branches: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`.
- Conventional Commits. Small, focused commits.
- Never commit `.env`, `*.db`, or `node_modules`.
