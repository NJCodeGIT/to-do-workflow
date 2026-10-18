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
