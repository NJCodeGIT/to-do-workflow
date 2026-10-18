import Database from 'better-sqlite3';
import { AppError } from '../errors.js';

export type TaskStatus = 'active' | 'completed';
export type TaskFilter = TaskStatus | 'all';

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TaskRow {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Constant column list; `user_id` is never selected, so it cannot reach a response.
const TASK_COLUMNS = 'id, title, description, status, completed_at, created_at, updated_at';

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Inserts a task owned by `userId`. Status and timestamps come from column defaults.
 * A token for a user that no longer exists fails the FK and is mapped to 401.
 */
export function createTask(
  db: Database.Database,
  userId: number,
  input: { title: string; description: string | null },
): Task {
  try {
    const row = db
      .prepare(
        `INSERT INTO tasks (user_id, title, description) VALUES (?, ?, ?) RETURNING ${TASK_COLUMNS}`,
      )
      .get(userId, input.title, input.description) as TaskRow;
    return toTask(row);
  } catch (err) {
    if (err instanceof Database.SqliteError && err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      throw new AppError('UNAUTHORIZED', 401, 'Invalid or expired token');
    }
    throw err;
  }
}

/** Lists `userId`'s tasks, newest first (ties by id DESC), optionally filtered by status. */
export function listTasks(db: Database.Database, userId: number, filter: TaskFilter): Task[] {
  const rows =
    filter === 'all'
      ? (db
          .prepare(
            `SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
          )
          .all(userId) as TaskRow[])
      : (db
          .prepare(
            `SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id = ? AND status = ? ORDER BY created_at DESC, id DESC`,
          )
          .all(userId, filter) as TaskRow[]);
  return rows.map(toTask);
}

/** Returns `userId`'s task `id`, or null if it does not exist or belongs to someone else. */
export function getTask(db: Database.Database, userId: number, id: number): Task | null {
  const row = db
    .prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ? AND user_id = ?`)
    .get(id, userId) as TaskRow | undefined;
  return row ? toTask(row) : null;
}

/** Fields to change; an absent (undefined) key keeps the stored value. */
export interface TaskPatch {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
}

// One fixed statement (decision 40). SET expressions see the old row, and 'now' is fixed for
// the statement, so completed_at equals updated_at on completion. completed_at changes only on
// a real status change; updated_at only when a stored value changes (decisions 36, 37, 39).
const UPDATE_TASK_SQL = `UPDATE tasks SET
  title = CASE WHEN @hasTitle = 1 THEN @title ELSE title END,
  description = CASE WHEN @hasDescription = 1 THEN @description ELSE description END,
  status = CASE WHEN @hasStatus = 1 THEN @status ELSE status END,
  completed_at = CASE
    WHEN @hasStatus = 0 OR @status = status THEN completed_at
    WHEN @status = 'completed' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    ELSE NULL
  END,
  updated_at = CASE
    WHEN (@hasTitle = 1 AND title IS NOT @title)
      OR (@hasDescription = 1 AND description IS NOT @description)
      OR (@hasStatus = 1 AND status IS NOT @status)
    THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    ELSE updated_at
  END
WHERE id = @id AND user_id = @userId
RETURNING ${TASK_COLUMNS}`;

/** Applies `patch` to `userId`'s task `id` atomically; null if no such task for this user. */
export function updateTask(
  db: Database.Database,
  userId: number,
  id: number,
  patch: TaskPatch,
): Task | null {
  // Flags are integers: better-sqlite3 does not bind booleans.
  const row = db.prepare(UPDATE_TASK_SQL).get({
    id,
    userId,
    hasTitle: patch.title !== undefined ? 1 : 0,
    title: patch.title ?? null,
    hasDescription: patch.description !== undefined ? 1 : 0,
    description: patch.description ?? null,
    hasStatus: patch.status !== undefined ? 1 : 0,
    status: patch.status ?? null,
  }) as TaskRow | undefined;
  return row ? toTask(row) : null;
}

/** Deletes `userId`'s task `id`; false if no such task for this user. */
export function deleteTask(db: Database.Database, userId: number, id: number): boolean {
  return db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(id, userId).changes === 1;
}
