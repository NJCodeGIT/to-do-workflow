import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors.js';

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('NOT_FOUND', 404, 'Route not found'));
}
