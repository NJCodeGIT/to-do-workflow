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

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresInSeconds: number;
}

const MIN_SECRET_LENGTH = 32;
const DEFAULT_EXPIRES_IN_SECONDS = 86400; // 24h
const MAX_EXPIRES_IN_SECONDS = 2592000; // 30d
const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

// Never put the secret or its length into a message.
function parseJwtSecret(raw: string | undefined): string {
  if (raw === undefined || raw === '') {
    throw new Error(
      `JWT_SECRET is not set. Set it in .env (at least ${MIN_SECRET_LENGTH} characters).`,
    );
  }
  if (raw.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET is too short (minimum ${MIN_SECRET_LENGTH} characters).`);
  }
  return raw;
}

// Own parser (seconds or <n>s|m|h|d) so we do not depend on the transitive `ms` package.
function parseExpiresIn(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_EXPIRES_IN_SECONDS;
  let seconds: number | undefined;
  if (/^[1-9]\d*$/.test(raw)) {
    seconds = Number(raw);
  } else {
    const match = /^([1-9]\d*)([smhd])$/.exec(raw);
    if (match) seconds = Number(match[1]) * (UNIT_SECONDS[match[2] as string] as number);
  }
  if (
    seconds === undefined ||
    !Number.isSafeInteger(seconds) ||
    seconds < 1 ||
    seconds > MAX_EXPIRES_IN_SECONDS
  ) {
    throw new Error(`Invalid JWT_EXPIRES_IN: ${raw}`);
  }
  return seconds;
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  return {
    jwtSecret: parseJwtSecret(env.JWT_SECRET),
    jwtExpiresInSeconds: parseExpiresIn(env.JWT_EXPIRES_IN),
  };
}
