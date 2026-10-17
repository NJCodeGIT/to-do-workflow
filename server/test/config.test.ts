import { describe, expect, it } from 'vitest';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAuthConfig, loadConfig } from '../src/config.js';

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

describe('loadAuthConfig JWT_SECRET', () => {
  const FAKE_32 = 'x'.repeat(32);

  it.each([
    ['unset', {}],
    ['empty', { JWT_SECRET: '' }],
  ])('throws "not set" when the secret is %s', (_name, env) => {
    expect(() => loadAuthConfig(env)).toThrow(
      'JWT_SECRET is not set. Set it in .env (at least 32 characters).',
    );
  });

  it('throws "too short" for 31 chars without leaking the value', () => {
    const value = 'fake-short-secret-marker-31-chr!'.slice(0, 31);
    expect(value).toHaveLength(31);
    let message = '';
    try {
      loadAuthConfig({ JWT_SECRET: value });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toBe('JWT_SECRET is too short (minimum 32 characters).');
    expect(message).not.toContain(value);
  });

  it('accepts exactly 32 chars and does not trim it', () => {
    expect(loadAuthConfig({ JWT_SECRET: FAKE_32 }).jwtSecret).toBe(FAKE_32);
    const padded = ` ${'y'.repeat(31)}`;
    expect(loadAuthConfig({ JWT_SECRET: padded }).jwtSecret).toBe(padded);
  });
});

describe('loadAuthConfig JWT_EXPIRES_IN', () => {
  const secret = 'x'.repeat(32);
  const lifetime = (raw?: string) =>
    loadAuthConfig({ JWT_SECRET: secret, ...(raw === undefined ? {} : { JWT_EXPIRES_IN: raw }) })
      .jwtExpiresInSeconds;

  it('defaults to 86400 (24h) when unset or empty', () => {
    expect(lifetime()).toBe(86400);
    expect(lifetime('')).toBe(86400);
  });

  it.each([
    ['3600', 3600],
    ['1', 1],
    ['45s', 45],
    ['90m', 5400],
    ['24h', 86400],
    ['7d', 604800],
    ['30d', 2592000],
    ['2592000', 2592000],
  ])('accepts %s as %i seconds', (raw, expected) => {
    expect(lifetime(raw)).toBe(expected);
  });

  it.each(['31d', '2592001', '0', '0h', '-5', '1.5h', 'abc', '24H', '1w', '720h1', '1 h', ' 5'])(
    'rejects %j with "Invalid JWT_EXPIRES_IN"',
    (raw) => {
      expect(() => lifetime(raw)).toThrow(`Invalid JWT_EXPIRES_IN: ${raw}`);
    },
  );

  it('loadConfig is unchanged and ignores auth variables', () => {
    expect(Object.keys(loadConfig({ JWT_SECRET: secret })).sort()).toEqual([
      'databasePath',
      'port',
    ]);
  });
});
