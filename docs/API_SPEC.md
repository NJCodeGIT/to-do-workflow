# REST API Spec

Base path `/api/v1`. JSON bodies. Task routes require `Authorization: Bearer <jwt>`.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
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
  Codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND`, `EMAIL_TAKEN`.
