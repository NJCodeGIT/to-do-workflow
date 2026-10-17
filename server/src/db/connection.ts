import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { Request } from 'express';

export function openDatabase(path: string): Database.Database {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  return db;
}

export function dbFrom(req: Request): Database.Database {
  return req.app.locals.db as Database.Database;
}
