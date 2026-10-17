import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type Database from 'better-sqlite3';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';

describe('health and fallback routes', () => {
  let db: Database.Database;
  let app: Express;

  beforeEach(() => {
    db = openDatabase(':memory:');
    runMigrations(db);
    app = createApp({ db });
  });

  afterEach(() => {
    db.close();
  });

  it('GET /api/v1/health returns 200 {status:"ok"} as JSON', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('unknown route returns 404 JSON error', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  it('connection has foreign keys enabled', () => {
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});
