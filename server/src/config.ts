import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Config {
  port: number;
  databasePath: string;
}

// Server package dir; same result from src/ and dist/.
const packageDir = fileURLToPath(new URL('..', import.meta.url));

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 3001;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${raw}`);
  }
  return port;
}

function resolveDatabasePath(raw: string | undefined): string {
  const value = raw === undefined || raw === '' ? 'data/todo.db' : raw;
  if (value === ':memory:' || isAbsolute(value)) return value;
  return resolve(packageDir, value);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: parsePort(env.PORT),
    databasePath: resolveDatabasePath(env.DATABASE_PATH),
  };
}
