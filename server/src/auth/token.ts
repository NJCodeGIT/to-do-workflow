import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import type { AuthConfig } from '../config.js';
import { AppError } from '../errors.js';

export function signToken(userId: number, auth: AuthConfig): string {
  return jwt.sign({}, auth.jwtSecret, {
    algorithm: 'HS256',
    subject: String(userId),
    expiresIn: auth.jwtExpiresInSeconds,
  });
}

function invalidToken(): AppError {
  return new AppError('UNAUTHORIZED', 401, 'Invalid or expired token');
}

/** Returns the user id from `sub`. Any failure throws 401; the library error is never logged or echoed. */
export function verifyToken(token: string, auth: AuthConfig): number {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, auth.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw invalidToken();
  }
  if (typeof payload !== 'object' || payload === null || typeof payload.exp !== 'number') {
    throw invalidToken();
  }
  const { sub } = payload;
  if (typeof sub !== 'string' || !/^[1-9]\d*$/.test(sub)) throw invalidToken();
  const userId = Number(sub);
  if (!Number.isSafeInteger(userId)) throw invalidToken();
  return userId;
}

export function authConfigFrom(req: Request): AuthConfig {
  return req.app.locals.auth as AuthConfig;
}
