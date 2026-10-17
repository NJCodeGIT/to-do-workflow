import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';

// Runner-owned tracking table (docs/DB_SCHEMA.md).
const SCHEMA_MIGRATIONS_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;

const FILE_PATTERN = /^(\d{3})_[a-z0-9_]+\.sql$/;

// Resolves to server/migrations/ from both src/db and dist/db.
const DEFAULT_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

function listMigrationFiles(dir: string): string[] {
  const files = readdirSync(dir).filter((name) => name.endsWith('.sql'));
  const seen = new Map<string, string>();
  for (const file of files) {
    const match = FILE_PATTERN.exec(file);
    if (!match) {
      throw new Error(`Invalid migration file name: ${file} (expected NNN_snake_name.sql)`);
    }
    const number = match[1] as string;
    const existing = seen.get(number);
    if (existing) {
      throw new Error(`Duplicate migration number ${number}: ${existing} and ${file}`);
    }
    seen.set(number, file);
  }
  return files.sort();
}

/** Applies pending migrations in order. Returns the versions applied this run. */
export function runMigrations(db: Database.Database, dir: string = DEFAULT_DIR): string[] {
  db.exec(SCHEMA_MIGRATIONS_DDL);
  const files = listMigrationFiles(dir);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').pluck().all() as string[],
  );
  const record = db.prepare('INSERT INTO schema_migrations (version) VALUES (?)');

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    try {
      db.transaction(() => {
        db.exec(sql);
        record.run(file);
      })();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Migration ${file} failed: ${message}`, { cause });
    }
    newlyApplied.push(file);
  }
  return newlyApplied;
}
