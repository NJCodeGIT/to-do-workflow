import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';

function objectNames(db: Database.Database, type: 'table' | 'index'): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%'")
    .pluck()
    .all(type) as string[];
}

const COLUMNS_SQL = 'SELECT name, type, "notnull" AS nn FROM pragma_table_info(?)';

function recorded(db: Database.Database): string[] {
  return db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .pluck()
    .all() as string[];
}

describe('migration runner', () => {
  let db: Database.Database;
  let dir: string;

  beforeEach(() => {
    db = openDatabase(':memory:');
    dir = mkdtempSync(join(tmpdir(), 'todo-migrate-test-'));
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (name: string, sql: string) => writeFileSync(join(dir, name), sql);

  describe('real migrations (server/migrations)', () => {
    it('applies 001_init.sql on a fresh DB and creates the schema', () => {
      const applied = runMigrations(db);
      expect(applied).toEqual(['001_init.sql']);
      expect(objectNames(db, 'table')).toEqual(
        expect.arrayContaining(['users', 'tasks', 'schema_migrations']),
      );
      expect(objectNames(db, 'index')).toContain('idx_tasks_user_status');
      expect(recorded(db)).toEqual(['001_init.sql']);
    });

    it('is idempotent: a second run applies nothing', () => {
      runMigrations(db);
      expect(runMigrations(db)).toEqual([]);
      expect(recorded(db)).toEqual(['001_init.sql']);
    });

    it('users table matches docs/DB_SCHEMA.md columns', () => {
      runMigrations(db);
      const cols = db.prepare(COLUMNS_SQL).all('users');
      expect(cols).toEqual([
        { name: 'id', type: 'INTEGER', nn: 0 },
        { name: 'email', type: 'TEXT', nn: 1 },
        { name: 'password_hash', type: 'TEXT', nn: 1 },
        { name: 'created_at', type: 'TEXT', nn: 1 },
      ]);
    });

    it('tasks table matches docs/DB_SCHEMA.md columns', () => {
      runMigrations(db);
      const cols = db.prepare(COLUMNS_SQL).all('tasks');
      expect(cols).toEqual([
        { name: 'id', type: 'INTEGER', nn: 0 },
        { name: 'user_id', type: 'INTEGER', nn: 1 },
        { name: 'title', type: 'TEXT', nn: 1 },
        { name: 'description', type: 'TEXT', nn: 0 },
        { name: 'status', type: 'TEXT', nn: 1 },
        { name: 'completed_at', type: 'TEXT', nn: 0 },
        { name: 'created_at', type: 'TEXT', nn: 1 },
        { name: 'updated_at', type: 'TEXT', nn: 1 },
      ]);
    });

    it('index idx_tasks_user_status covers (user_id, status, created_at) on tasks', () => {
      runMigrations(db);
      const cols = db
        .prepare("SELECT name FROM pragma_index_info('idx_tasks_user_status') ORDER BY seqno")
        .pluck()
        .all();
      expect(cols).toEqual(['user_id', 'status', 'created_at']);
      const tbl = db
        .prepare("SELECT tbl_name FROM sqlite_master WHERE name = 'idx_tasks_user_status'")
        .pluck()
        .get();
      expect(tbl).toBe('tasks');
    });

    it('enforces constraints: status CHECK, title length CHECK, unique email (NOCASE)', () => {
      runMigrations(db);
      db.prepare("INSERT INTO users (email, password_hash) VALUES ('a@example.test', 'x')").run();
      const insertTask = db.prepare('INSERT INTO tasks (user_id, title, status) VALUES (1, ?, ?)');
      expect(() => insertTask.run('ok', 'active')).not.toThrow();
      expect(() => insertTask.run('ok', 'bogus')).toThrow(/CHECK/);
      expect(() => insertTask.run('', 'active')).toThrow(/CHECK/);
      expect(() => insertTask.run('x'.repeat(201), 'active')).toThrow(/CHECK/);
      expect(() => insertTask.run('x'.repeat(200), 'active')).not.toThrow();
      expect(() =>
        db.prepare("INSERT INTO users (email, password_hash) VALUES ('A@EXAMPLE.test', 'x')").run(),
      ).toThrow(/UNIQUE/);
    });

    it('foreign keys are on: orphan task rejected, delete user cascades to tasks', () => {
      runMigrations(db);
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      const orphan = db.prepare("INSERT INTO tasks (user_id, title) VALUES (999, 't')");
      expect(() => orphan.run()).toThrow(/FOREIGN KEY/);
      db.prepare("INSERT INTO users (email, password_hash) VALUES ('b@example.test', 'x')").run();
      db.prepare("INSERT INTO tasks (user_id, title) VALUES (1, 't')").run();
      db.prepare('DELETE FROM users WHERE id = 1').run();
      expect(db.prepare('SELECT COUNT(*) FROM tasks').pluck().get()).toBe(0);
    });
  });

  describe('ordering and tracking (temp dir)', () => {
    it('applies files in numeric name order regardless of write order', () => {
      write('002_second.sql', 'CREATE TABLE second (id INTEGER);');
      write('001_first.sql', 'CREATE TABLE first (id INTEGER);');
      write('010_tenth.sql', 'CREATE TABLE tenth (id INTEGER);');
      expect(runMigrations(db, dir)).toEqual(['001_first.sql', '002_second.sql', '010_tenth.sql']);
      expect(recorded(db)).toEqual(['001_first.sql', '002_second.sql', '010_tenth.sql']);
    });

    it('creates schema_migrations even when the directory has no migrations', () => {
      expect(runMigrations(db, dir)).toEqual([]);
      expect(objectNames(db, 'table')).toContain('schema_migrations');
    });

    it('applies only new files on a later run', () => {
      write('001_first.sql', 'CREATE TABLE first (id INTEGER);');
      expect(runMigrations(db, dir)).toEqual(['001_first.sql']);
      write('002_second.sql', 'CREATE TABLE second (id INTEGER);');
      expect(runMigrations(db, dir)).toEqual(['002_second.sql']);
      expect(runMigrations(db, dir)).toEqual([]);
    });

    it('ignores non-.sql files in the directory', () => {
      write('001_first.sql', 'CREATE TABLE first (id INTEGER);');
      write('README.txt', 'not a migration');
      expect(runMigrations(db, dir)).toEqual(['001_first.sql']);
    });
  });

  describe('failures', () => {
    it('bad SQL throws naming the file, earlier file stays recorded, bad one is not', () => {
      write('001_good.sql', 'CREATE TABLE good (id INTEGER);');
      write('002_bad.sql', 'SELECT BROKEN FROM;');
      expect(() => runMigrations(db, dir)).toThrow(/002_bad\.sql/);
      expect(recorded(db)).toEqual(['001_good.sql']);
    });

    it('rolls back a failing file completely (no partial objects)', () => {
      write('001_good.sql', 'CREATE TABLE good (id INTEGER);');
      write('002_bad.sql', 'CREATE TABLE ok_part (id INTEGER);\nSELECT BROKEN FROM;');
      expect(() => runMigrations(db, dir)).toThrow(/002_bad\.sql/);
      expect(objectNames(db, 'table')).not.toContain('ok_part');
      expect(objectNames(db, 'table')).toContain('good');
      expect(recorded(db)).toEqual(['001_good.sql']);
    });

    it('does not run later files after a failure', () => {
      write('001_good.sql', 'CREATE TABLE good (id INTEGER);');
      write('002_bad.sql', 'SELECT BROKEN FROM;');
      write('003_later.sql', 'CREATE TABLE later (id INTEGER);');
      expect(() => runMigrations(db, dir)).toThrow(/002_bad\.sql/);
      expect(objectNames(db, 'table')).not.toContain('later');
      expect(recorded(db)).toEqual(['001_good.sql']);
    });

    it('retries a previously failed file once it is fixed', () => {
      write('001_good.sql', 'CREATE TABLE good (id INTEGER);');
      write('002_bad.sql', 'SELECT BROKEN FROM;');
      expect(() => runMigrations(db, dir)).toThrow();
      write('002_bad.sql', 'CREATE TABLE fixed (id INTEGER);');
      expect(runMigrations(db, dir)).toEqual(['002_bad.sql']);
      expect(objectNames(db, 'table')).toContain('fixed');
    });

    it('the thrown error keeps the original cause', () => {
      write('001_bad.sql', 'SELECT BROKEN FROM;');
      try {
        runMigrations(db, dir);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect((err as Error).message).toMatch(/^Migration 001_bad\.sql failed: /);
        expect((err as Error).cause).toBeInstanceOf(Error);
      }
    });

    it.each([
      ['no number prefix', 'init.sql'],
      ['two-digit number', '01_init.sql'],
      ['four-digit number', '0001_init.sql'],
      ['uppercase name', '001_Init.sql'],
      ['dash in name', '001_my-migration.sql'],
      ['missing name', '001.sql'],
    ])('rejects invalid file name (%s) before applying anything', (_label, badName) => {
      write('001_good.sql', 'CREATE TABLE good (id INTEGER);');
      write(badName, 'CREATE TABLE other (id INTEGER);');
      expect(() => runMigrations(db, dir)).toThrow(/Invalid migration file name/);
      expect(objectNames(db, 'table')).not.toContain('good');
      expect(objectNames(db, 'table')).not.toContain('other');
      expect(recorded(db)).toEqual([]);
    });

    it('rejects duplicate migration numbers before applying anything', () => {
      write('001_a.sql', 'CREATE TABLE a (id INTEGER);');
      write('001_b.sql', 'CREATE TABLE b (id INTEGER);');
      expect(() => runMigrations(db, dir)).toThrow(/Duplicate migration number 001/);
      expect(objectNames(db, 'table')).not.toContain('a');
      expect(objectNames(db, 'table')).not.toContain('b');
      expect(recorded(db)).toEqual([]);
    });
  });
});
