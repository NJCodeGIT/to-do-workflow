import Database from 'better-sqlite3';
import { AppError } from '../errors.js';

export interface User {
  id: number;
  email: string;
}

export interface UserWithHash extends User {
  passwordHash: string;
}

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
}

/** Inserts a user. The UNIQUE constraint decides duplicates (no pre-check), mapped to 409. */
export function createUser(
  db: Database.Database,
  { email, passwordHash }: { email: string; passwordHash: string },
): User {
  try {
    return db
      .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id, email')
      .get(email, passwordHash) as User;
  } catch (err) {
    if (err instanceof Database.SqliteError && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new AppError('EMAIL_TAKEN', 409, 'Email is already registered');
    }
    throw err;
  }
}

export function findUserByEmail(db: Database.Database, email: string): UserWithHash | undefined {
  const row = db
    .prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
    .get(email) as UserRow | undefined;
  if (!row) return undefined;
  return { id: row.id, email: row.email, passwordHash: row.password_hash };
}
