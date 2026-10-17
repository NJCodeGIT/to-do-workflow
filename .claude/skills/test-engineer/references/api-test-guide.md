# Unit, API, and Component Test Guide

## Server (Vitest + supertest)
- Build the Express app from a factory so tests can inject an in-memory SQLite DB
  (`:memory:`) and apply `server/migrations/` before each test file.
- Reset data between tests (truncate tables or fresh DB); never depend on test order.
- Create users and tokens through small helpers (`registerUser`, `authHeader`),
  not by copying setup into each test.
- Assert status code, response body shape (`docs/API_SPEC.md`), and the DB side effect.

### Minimum cases per task endpoint
- Success path with the documented response shape.
- 400 on invalid body or query (empty title, title over 200 chars, bad `status`).
- 401 with no token and with an invalid token.
- 404 for an unknown id and for another user's task.
- `completed_at` set on complete and cleared on reopen.

### Auth endpoints
- Register: success, duplicate email (409, case-insensitive), weak password (400).
- Login: success, wrong password and unknown email return the same 401.
- Response never contains the password hash.

## Client (Vitest + Testing Library)
- Query by role and label (`getByRole`, `getByLabelText`), not by class or test id.
- Mock only `client/src/api.ts`; do not mock components under test.
- Cover loading, empty, and error states, and the status filter changing the list.
- Use fake data only.
