# REST API Spec

Base path `/api/v1`. JSON bodies. Task routes require `Authorization: Bearer <jwt>`.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/health` | - | `200 {"status":"ok"}` | 500 |
| POST | `/auth/register` | `{email, password}` | `201 {user:{id,email}, token}` | 400, 409 email taken |
| POST | `/auth/login` | `{email, password}` | `200 {user, token}` | 401 |
| GET | `/tasks?status=active\|completed\|all` | - | `200 {tasks:[Task]}` (default `all`, newest first) | 400, 401 |
| POST | `/tasks` | `{title, description?}` | `201 Task` | 400, 401 |
| GET | `/tasks/:id` | - | `200 Task` | 401, 404 |
| PATCH | `/tasks/:id` | any of `{title, description, status}` | `200 Task` | 400, 401, 404 |
| DELETE | `/tasks/:id` | - | `204` | 401, 404 |

- Complete a task: `PATCH /tasks/:id {"status":"completed"}`; reopen with `"active"`.
- `Task`: `{id, title, description, status, completedAt, createdAt, updatedAt}`.
- Validation: `email` valid format; `password` min 8 chars; `title` 1-200 chars.
- Error shape: `{"error":{"code":"VALIDATION_ERROR","message":"..."}}`.
  Codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND`, `EMAIL_TAKEN`, `INTERNAL_ERROR`.
- Health: `GET /api/v1/health` is public (no auth), has no side effects and does not
  touch the DB (liveness only). Body is exactly `{"status":"ok"}`. Other methods on
  `/health` fall through to the unknown-route 404.
- Unknown route (any method, any path with no matching route):
  `404 {"error":{"code":"NOT_FOUND","message":"Route not found"}}`, always JSON.
- Unexpected server error: `500 {"error":{"code":"INTERNAL_ERROR","message":"Internal server error"}}`;
  details go to the server log only, never to the response.
