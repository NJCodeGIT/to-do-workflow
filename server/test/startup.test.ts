import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = fileURLToPath(new URL('..', import.meta.url));

// Runs the real entry point. The env comes from process.env minus the config variables,
// so the machine env cannot change the result.
// cwd is the server dir so tsx resolves; the entry never loads a .env itself (only the npm
// scripts pass --env-file-if-exists), so no real .env is read.
function runServer(extraEnv: Record<string, string>) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.JWT_SECRET;
  delete env.JWT_EXPIRES_IN;
  delete env.PORT;
  delete env.DATABASE_PATH;
  Object.assign(env, extraEnv);
  return spawnSync(process.execPath, ['--import', 'tsx', join(serverDir, 'src/index.ts')], {
    cwd: serverDir,
    env,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

describe('server startup fails fast on bad auth config', () => {
  let tempDir: string;
  let dbDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'todo-startup-'));
    dbDir = join(tempDir, 'db-not-created');
    dbPath = join(dbDir, 'test.db');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // Fake, deliberately recognisable values.
  const FAKE_SHORT = 'short-secret-marker-xyz';
  const FAKE_VALID = 'startup-test-fake-secret-0123456789-abcdef';

  it('missing JWT_SECRET: exit 1, clear message, no DB created', () => {
    const res = runServer({ DATABASE_PATH: dbPath });
    expect(res.error).toBeUndefined();
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Configuration error: JWT_SECRET is not set');
    expect(existsSync(dbPath)).toBe(false);
    expect(existsSync(dbDir)).toBe(false);
  });

  it('empty JWT_SECRET: exit 1', () => {
    const res = runServer({ JWT_SECRET: '', DATABASE_PATH: dbPath });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('JWT_SECRET is not set');
    expect(existsSync(dbDir)).toBe(false);
  });

  it('short JWT_SECRET: exit 1 and the value is never printed', () => {
    const res = runServer({ JWT_SECRET: FAKE_SHORT, DATABASE_PATH: dbPath });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('too short');
    expect(res.stdout).not.toContain(FAKE_SHORT);
    expect(res.stderr).not.toContain(FAKE_SHORT);
    expect(existsSync(dbDir)).toBe(false);
  });

  it('invalid JWT_EXPIRES_IN with a valid secret: exit 1, secret not printed', () => {
    const res = runServer({ JWT_SECRET: FAKE_VALID, JWT_EXPIRES_IN: '31d', DATABASE_PATH: dbPath });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Invalid JWT_EXPIRES_IN: 31d');
    expect(res.stdout).not.toContain(FAKE_VALID);
    expect(res.stderr).not.toContain(FAKE_VALID);
    expect(existsSync(dbDir)).toBe(false);
  });
});
