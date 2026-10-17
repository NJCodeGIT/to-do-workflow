import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const serverDir = fileURLToPath(new URL('..', import.meta.url));

// Runs a migrate-cli.ts copy with tsx in a child process. Only DATABASE_PATH is set
// explicitly; PORT is dropped so the real environment cannot affect the run.
function runCli(cliPath: string, databasePath: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_PATH: databasePath };
  delete env.PORT;
  return spawnSync(process.execPath, ['--import', 'tsx', cliPath], {
    cwd: serverDir,
    env,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

function tables(dbPath: string): string[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .pluck()
      .all() as string[];
  } finally {
    db.close();
  }
}

describe('migrate-cli exit codes', () => {
  let dataDir: string;
  let dbPath: string;
  // A scratch copy of src/ + migrations/ inside server/ (so node_modules resolve).
  // migrate-cli always uses ../../migrations relative to itself, so a copy is the only
  // way to give it a bad migrations dir without changing application code.
  let sandbox: string | undefined;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'todo-migrate-cli-'));
    dbPath = join(dataDir, 'test.db');
    sandbox = undefined;
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
    if (sandbox) rmSync(sandbox, { recursive: true, force: true });
  });

  function makeSandbox(): string {
    sandbox = mkdtempSync(join(serverDir, 'test', '.migrate-cli-sandbox-'));
    cpSync(join(serverDir, 'src'), join(sandbox, 'src'), { recursive: true });
    cpSync(join(serverDir, 'migrations'), join(sandbox, 'migrations'), { recursive: true });
    return sandbox;
  }

  it('exits 0 and applies the real migrations on a fresh database, then is idempotent', () => {
    const first = runCli(join(serverDir, 'src/db/migrate-cli.ts'), dbPath);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('Applied: 001_init.sql');
    expect(tables(dbPath)).toEqual(expect.arrayContaining(['users', 'tasks', 'schema_migrations']));

    const second = runCli(join(serverDir, 'src/db/migrate-cli.ts'), dbPath);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('No pending migrations.');
    expect(second.stdout).not.toContain('Applied:');
  });

  it('exits non-zero and names the file when a migration has invalid SQL', () => {
    const root = makeSandbox();
    writeFileSync(
      join(root, 'migrations', '002_bad.sql'),
      'CREATE TABLE ok_part (id INTEGER);\nSELECT BROKEN FROM;\n',
    );

    const res = runCli(join(root, 'src/db/migrate-cli.ts'), dbPath);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('002_bad.sql');
    expect(res.stderr).toMatch(/Migration 002_bad\.sql failed/);

    // 001 stays applied, 002 is rolled back completely.
    const names = tables(dbPath);
    expect(names).toContain('users');
    expect(names).not.toContain('ok_part');
    const db = new Database(dbPath, { readonly: true });
    try {
      const versions = db.prepare('SELECT version FROM schema_migrations').pluck().all();
      expect(versions).toEqual(['001_init.sql']);
    } finally {
      db.close();
    }
  });

  it('exits non-zero and names the file when a .sql file has an invalid name', () => {
    const root = makeSandbox();
    writeFileSync(join(root, 'migrations', 'BadName.sql'), 'SELECT 1;');

    const res = runCli(join(root, 'src/db/migrate-cli.ts'), dbPath);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('BadName.sql');
  });
});
