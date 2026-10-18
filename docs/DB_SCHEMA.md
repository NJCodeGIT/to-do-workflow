# DB Schema (SQLite)

Run `PRAGMA foreign_keys = ON` on every connection.

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  completed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_tasks_user_status ON tasks (user_id, status, created_at DESC);
```

- `users.email` is stored trimmed and lowercased by the app; `COLLATE NOCASE` on the
  `UNIQUE` constraint is kept as a backstop. A unique violation on insert
  (`SQLITE_CONSTRAINT_UNIQUE`) is mapped to `409 EMAIL_TAKEN` in `server/src/db/users.ts`.
  `password_hash` holds the full argon2id encoded string (`$argon2id$...`). No migration
  was needed for auth (S-003).
- Timestamps are ISO-8601 UTC strings.
- `tasks` (S-005, no migration): `title` and `description` are stored trimmed by the app.
  `description` max 2000 chars is app-enforced only (no CHECK); empty is stored as `NULL`,
  never `''`. `created_at`/`updated_at` come from the column defaults on insert (equal on a
  new row). All task SQL is in `server/src/db/tasks.ts` and filters by `user_id`. The
  `idx_tasks_user_status` index serves filtered lists; the `all` list may sort in memory,
  fine at this scale. An insert for a missing user fails the foreign key
  (`SQLITE_CONSTRAINT_FOREIGNKEY`), mapped to 401 (decision 34).
- `completed_at` is set when status changes to `completed`, cleared (`NULL`) on reopen, and
  kept unchanged when a completed task is "completed" again (decisions 36, 37).
- `updated_at` is set on every update that changes a stored value; an update that writes
  the same values leaves it unchanged (decision 39). Both timestamps come from
  `strftime('%Y-%m-%dT%H:%M:%fZ','now')` inside the single `UPDATE` (S-006, decision 40), so
  on completion `completed_at` equals `updated_at`. `created_at` never changes.
- S-006 needs no migration: get/update/delete use the primary key plus `user_id = ?`.
- Migrations: numbered files in `server/migrations/`, applied in order, tracked in a `schema_migrations` table.
  - File name `NNN_snake_name.sql` (3 digits). Each file runs in its own transaction, so it
    must not contain `BEGIN`/`COMMIT`. A failing file is rolled back and not recorded.
  - The runner creates its tracking table itself (not part of `001_init.sql`):

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,  -- file name, e.g. '001_init.sql'
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```
