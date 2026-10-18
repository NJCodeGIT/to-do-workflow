import express, { type NextFunction, type Request, type Response } from 'express';
import { AppError } from '../errors.js';

const parser = express.json({ limit: '100kb' });

// Body-parser errors carry `err.body` (the raw request text, possibly a password),
// so the original error is neither passed on nor logged.
export function jsonBody(req: Request, res: Response, next: NextFunction): void {
  parser(req, res, (err?: unknown) => {
    if (err) {
      next(new AppError('VALIDATION_ERROR', 400, 'Invalid request body'));
      return;
    }
    next();
  });
}
