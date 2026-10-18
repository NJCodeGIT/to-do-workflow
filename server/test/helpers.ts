import type Database from 'better-sqlite3';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import type { AuthConfig } from '../src/config.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';

// Test-only value, not a real secret. Tests never read JWT_SECRET from env.
export const TEST_AUTH: AuthConfig = {
  jwtSecret: 'test-only-secret-0123456789abcdef-not-real',
  jwtExpiresInSeconds: 3600,
};

/** App on a fresh, migrated in-memory DB. The caller closes `db`. */
export function makeTestApp(): { app: Express; db: Database.Database } {
  const db = openDatabase(':memory:');
  runMigrations(db);
  const app = createApp({ db, auth: TEST_AUTH });
  return { app, db };
}
