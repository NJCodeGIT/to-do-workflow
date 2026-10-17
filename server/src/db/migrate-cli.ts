import { loadConfig } from '../config.js';
import { openDatabase } from './connection.js';
import { runMigrations } from './migrate.js';

const { databasePath } = loadConfig();
const db = openDatabase(databasePath);

try {
  const applied = runMigrations(db);
  if (applied.length === 0) {
    console.log('No pending migrations.');
  } else {
    for (const version of applied) console.log(`Applied: ${version}`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  db.close();
}
