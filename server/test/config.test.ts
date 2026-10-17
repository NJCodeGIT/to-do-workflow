import { describe, expect, it } from 'vitest';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';

// Server package dir (parent of test/).
const serverDir = fileURLToPath(new URL('..', import.meta.url));

describe('loadConfig defaults', () => {
  it('uses port 3001 and server/data/todo.db for an empty env', () => {
    expect(loadConfig({})).toEqual({
      port: 3001,
      databasePath: resolve(serverDir, 'data/todo.db'),
    });
  });

  it('treats empty strings like unset values', () => {
    const config = loadConfig({ PORT: '', DATABASE_PATH: '' });
    expect(config.port).toBe(3001);
    expect(config.databasePath).toBe(join(serverDir, 'data', 'todo.db'));
  });
});

describe('loadConfig PORT', () => {
  it.each([
    ['1', 1],
    ['3001', 3001],
    ['8080', 8080],
    ['65535', 65535],
  ])('accepts PORT=%s', (raw, expected) => {
    expect(loadConfig({ PORT: raw }).port).toBe(expected);
  });

  it.each(['0', '-1', '65536', '99999', '3000.5', 'abc', '80abc', ' ', 'NaN', 'Infinity'])(
    'rejects PORT=%j with "Invalid PORT"',
    (raw) => {
      expect(() => loadConfig({ PORT: raw })).toThrow(`Invalid PORT: ${raw}`);
    },
  );
});

describe('loadConfig DATABASE_PATH', () => {
  it('resolves a relative path against the server package dir, not cwd', () => {
    const { databasePath } = loadConfig({ DATABASE_PATH: 'tmp/other.db' });
    expect(databasePath).toBe(resolve(serverDir, 'tmp/other.db'));
    expect(isAbsolute(databasePath)).toBe(true);
  });

  it('passes an absolute path through unchanged', () => {
    const abs = resolve('/some/absolute/dir/app.db');
    expect(loadConfig({ DATABASE_PATH: abs }).databasePath).toBe(abs);
  });

  it('passes :memory: through unchanged', () => {
    expect(loadConfig({ DATABASE_PATH: ':memory:' }).databasePath).toBe(':memory:');
  });
});
