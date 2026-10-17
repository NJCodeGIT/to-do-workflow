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

- Timestamps are ISO-8601 UTC strings.
- `completed_at` is set when status becomes `completed`, cleared on reopen.
- `updated_at` is set by the app on every update.
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
