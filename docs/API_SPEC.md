# REST API Spec

Base path `/api/v1`. JSON bodies. Task routes require `Authorization: Bearer <jwt>`.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/health` | - | `200 {"status":"ok"}` | 500 |
| POST | `/auth/register` | `{email, password}` | `201 {user:{id,email}, token}` | 400, 409 email taken |
| POST | `/auth/login` | `{email, password}` | `200 {user:{id,email}, token}` | 400, 401 |
| GET | `/tasks?status=active\|completed\|all` | - | `200 {tasks:[Task]}` (default `all`, newest first) | 400, 401 |
| POST | `/tasks` | `{title, description?}` | `201 Task` | 400, 401 |
| GET | `/tasks/:id` | - | `200 Task` | 401, 404 |
| PATCH | `/tasks/:id` | any of `{title, description, status}` | `200 Task` | 400, 401, 404 |
| DELETE | `/tasks/:id` | - | `204` | 401, 404 |

- Complete a task: `PATCH /tasks/:id {"status":"completed"}`; reopen with `"active"`.
- `Task`: `{id, title, description, status, completedAt, createdAt, updatedAt}`.
- Validation: `email` valid format; `password` 8-128 chars (see Auth below); `title` 1-200 chars
  after trim, `description` up to 2000 chars after trim (see Tasks below).
- Error shape: `{"error":{"code":"VALIDATION_ERROR","message":"..."}}`.
  Codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND`, `EMAIL_TAKEN`, `INTERNAL_ERROR`.
- Health: `GET /api/v1/health` is public (no auth), has no side effects and does not
  touch the DB (liveness only). Body is exactly `{"status":"ok"}`. Other methods on
  `/health` fall through to the unknown-route 404.
- Unknown route (any method, any path with no matching route):
  `404 {"error":{"code":"NOT_FOUND","message":"Route not found"}}`, always JSON.
- Unexpected server error: `500 {"error":{"code":"INTERNAL_ERROR","message":"Internal server error"}}`;
  details go to the server log only, never to the response.

## Request bodies (all JSON routes)
- JSON is parsed once for every `/api/v1` route (`express.json`, limit `100kb`, strict:
  only objects/arrays). Only `Content-Type: application/json` bodies are parsed.
- Malformed JSON, a too-large body, or an unsupported encoding/charset:
  `400 {"error":{"code":"VALIDATION_ERROR","message":"Invalid request body"}}`. This also
  applies to such a body sent to an unknown `/api/v1` path (body parsing runs first).
- A JSON primitive such as `null` or a string (e.g. `"nope"`) is rejected by the parser:
  `400 VALIDATION_ERROR` `Invalid request body`.
- A missing body, a non-JSON content type, or a JSON array (`[]`) fails schema validation:
  `400 VALIDATION_ERROR` `Request body must be a JSON object`.
- Unknown extra fields are ignored (stripped), not rejected.
- Validation errors return the message of the first failing rule, in field order
  (`email` before `password`).

## Auth
Error codes used: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `EMAIL_TAKEN` (409),
`INTERNAL_ERROR` (500). No new codes. `user` is always exactly `{id, email}` (`id` is a
number); no response ever contains a password or hash.

### `POST /api/v1/auth/register`
Request: `{"email":"Ann@Example.com ","password":"correct horse"}`

`201`:
```json
{ "user": { "id": 1, "email": "ann@example.com" }, "token": "<jwt>" }
```
Registering also logs the user in (the token is ready to use).

| Status | Code | Message | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | see validation table | invalid body |
| 409 | `EMAIL_TAKEN` | `Email is already registered` | email exists (case-insensitive, after trim) |

### `POST /api/v1/auth/login`
Request: `{"email":"ann@example.com","password":"correct horse"}`

`200`: same shape as register (`{user:{id,email}, token}`).

| Status | Code | Message | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | see validation table | invalid body |
| 401 | `UNAUTHORIZED` | `Invalid email or password` | unknown email **or** wrong password (identical body) |

Login does not apply the 8-character minimum: any non-empty password up to 128 chars is
checked against the hash, so a short wrong password gives 401, not 400.

### Validation rules and messages
| Field | Rule | Message |
|---|---|---|
| body | must be a JSON object | `Request body must be a JSON object` |
| `email` | present | `email is required` |
| `email` | string | `email must be a string` |
| `email` | trimmed, then lowercased, then max 254 chars | `email must be at most 254 characters` |
| `email` | valid email format (after trim) | `email must be a valid email address` |
| `password` | present | `password is required` |
| `password` | string | `password must be a string` |
| `password` (register) | 8-128 chars, not trimmed, no complexity rules | `password must be at least 8 characters` / `password must be at most 128 characters` |
| `password` (login) | 1-128 chars, not trimmed | `password is required` (empty) / `password must be at most 128 characters` |

- Email is stored and returned trimmed and lowercased. Lookup and uniqueness are
  case-insensitive. Length is counted in JS string length (UTF-16 code units).

### Authenticated requests
- Header: `Authorization: Bearer <jwt>`. Scheme is case-insensitive; exactly one token,
  no extra parts.
- The user id comes only from the token (`sub`), never from body, query, or params.

| Case | Status | Code | Message |
|---|---|---|---|
| No `Authorization` header, non-Bearer scheme, empty or multi-part value | 401 | `UNAUTHORIZED` | `Authentication required` |
| Malformed token, bad signature, other algorithm, expired, missing/invalid `sub` or `exp` | 401 | `UNAUTHORIZED` | `Invalid or expired token` |

- Token: JWT, HS256, claims `sub` (user id as a decimal string), `iat`, `exp`; nothing else.
  Default lifetime 24h (`JWT_EXPIRES_IN`). No refresh tokens, no logout endpoint (the
  client discards the token).
- A valid token for a user that no longer exists is still accepted until it expires
  (no account deletion exists yet; see `docs/DECISIONS.md`). Task routes treat it as follows:
  `GET /tasks` returns `{tasks:[]}`; `POST /tasks` returns `401 UNAUTHORIZED`
  `Invalid or expired token` (the insert fails the `user_id` foreign key; see Tasks).

## Tasks
Both routes below (S-005) require a valid Bearer token (401 cases as in Authenticated
requests). Order of checks: body parsing (`400 Invalid request body`, decision 27) ->
auth (401) -> validation (400) -> data. So a missing token with a valid body gives 401, and
a missing token with a malformed JSON body gives 400.

Error codes used: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `INTERNAL_ERROR` (500).
No new codes. Other methods on `/tasks` (e.g. `PUT`, `DELETE /tasks`) and all
`/tasks/:id` routes fall through to the unknown-route 404 until S-006.

### `Task` object
```json
{
  "id": 7,
  "title": "Buy milk",
  "description": null,
  "status": "active",
  "completedAt": null,
  "createdAt": "2026-10-18T09:12:03.123Z",
  "updatedAt": "2026-10-18T09:12:03.123Z"
}
```
- Exactly these seven keys, always present. `id` is a number; `description` and
  `completedAt` are a string or `null`; `status` is `active` or `completed`.
- Timestamps are ISO-8601 UTC with milliseconds (`YYYY-MM-DDTHH:MM:SS.sssZ`), set by the DB.
- The owner (`user_id`) is never in a response.

### `POST /api/v1/tasks`
Request: `{"title":"  Buy milk ","description":"   "}`

`201`: the created `Task` (bare object, not wrapped), e.g. the example above: title trimmed,
whitespace-only description stored as `null`, `status` `active`, `completedAt` `null`,
`createdAt` equals `updatedAt`.

- Only `title` and `description` are read. Any other field (`status`, `id`, `userId`,
  `user_id`, `completedAt`, `createdAt`, `updatedAt`, ...) is ignored (stripped), so a new
  task is always `active` and always owned by the token's user.

| Status | Code | Message | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | see validation table | invalid body; no row is created |
| 401 | `UNAUTHORIZED` | as in Authenticated requests | missing/bad/expired token |
| 401 | `UNAUTHORIZED` | `Invalid or expired token` | valid token, but its user no longer exists |

### `GET /api/v1/tasks?status=active|completed|all`
`200`: `{"tasks":[Task, ...]}`; zero matches is `{"tasks":[]}`.

- `status` omitted -> `all`. `active` / `completed` return only that status; `all` returns both.
- Only the token user's tasks are returned, for every filter. Other query params
  (e.g. `userId`, `user_id`) are ignored.
- Order: `createdAt` descending (newest first), ties broken by `id` descending.
- No pagination or limit (decision 32).

| Status | Code | Message | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `status must be one of: active, completed, all` | `status` present but not exactly one of the three lowercase values: unknown (`done`), empty (`status=` or bare `status`), wrong case (`Active`), or repeated (`status=active&status=all`) |
| 401 | `UNAUTHORIZED` | as in Authenticated requests | missing/bad/expired token |

### Task validation rules and messages
Checked in field order (`title` before `description`); the first failing rule's message
is returned. Lengths are JS string length (UTF-16 code units), counted after trim.
Trim is JS `String.prototype.trim` (Unicode whitespace, incl. newlines and tabs).

| Field | Rule | Message |
|---|---|---|
| body | must be a JSON object | `Request body must be a JSON object` |
| `title` | present | `title is required` |
| `title` | string (`null`, number, etc. fail) | `title must be a string` |
| `title` | trimmed, then at least 1 char (empty / whitespace-only fail) | `title is required` |
| `title` | trimmed, then at most 200 chars | `title must be at most 200 characters` |
| `description` | optional; omitted or `null` -> stored and returned as `null` | - |
| `description` | string if present and not `null` | `description must be a string` |
| `description` | trimmed, then at most 2000 chars | `description must be at most 2000 characters` |
| `description` | trimmed, empty result (`""`, whitespace-only) -> stored as `null` | - |

- Title and description are stored and returned trimmed. Inner whitespace and newlines
  are kept as sent. Text is stored as-is (no HTML escaping server-side; the client
  renders it as text, decision 26).
