import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors.js';

// Express identifies error middleware by its 4-argument signature.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  // The router throws URIError (status 400) for an undecodable path param before any handler
  // runs. Treat it as an unknown route; not logged, it is client noise (decision 38).
  if (err instanceof URIError && (err as { status?: number }).status === 400) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
    return;
  }
  // Log only the error object; never request bodies or headers.
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}
