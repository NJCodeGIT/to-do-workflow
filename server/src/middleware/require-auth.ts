import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors.js';
import { authConfigFrom, verifyToken } from '../auth/token.js';

function authRequired(): AppError {
  return new AppError('UNAUTHORIZED', 401, 'Authentication required');
}

/** Verifies `Authorization: Bearer <jwt>` and sets `req.userId` from the token only. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const parts = header === undefined ? [] : header.split(/\s+/);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
    next(authRequired());
    return;
  }
  try {
    req.userId = verifyToken(parts[1] as string, authConfigFrom(req));
    next();
  } catch (err) {
    next(err);
  }
}

/** The authenticated user id; fails closed if a route forgot `requireAuth`. */
export function userIdOf(req: Request): number {
  if (req.userId === undefined) throw authRequired();
  return req.userId;
}
