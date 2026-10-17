import express, { type Express } from 'express';
import type Database from 'better-sqlite3';
import { apiRouter } from './routes/index.js';
import { notFound } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';

export interface AppDeps {
  db: Database.Database;
}

export function createApp({ db }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.locals.db = db;
  app.use('/api/v1', apiRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
