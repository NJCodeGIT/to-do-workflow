import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type Database from 'better-sqlite3';
import express, { type Express } from 'express';
import { AppError } from '../src/errors.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { makeTestApp } from './helpers.js';

describe('health and fallback routes', () => {
  let db: Database.Database;
  let app: Express;

  beforeEach(() => {
    ({ app, db } = makeTestApp());
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('unknown path outside /api/v1 returns 404 JSON, not an HTML page', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
    expect(res.text).not.toMatch(/<html|at .*\.(ts|js):\d+/i);
  });

  it('POST /api/v1/health (unsupported method) returns 404 JSON', async () => {
    const res = await request(app).post('/api/v1/health');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  it('does not expose the x-powered-by header', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('unexpected errors return a generic 500 JSON without leaking details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = express();
    failing.get('/boom', () => {
      throw new Error('secret internal detail');
    });
    failing.use(errorHandler);
    const res = await request(failing).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(res.text).not.toContain('secret internal detail');
  });

  it('typed AppError maps to its status and code', async () => {
    const typed = express();
    typed.get('/teapot', () => {
      throw new AppError('TEAPOT', 418, 'I am a teapot');
    });
    typed.use(errorHandler);
    const res = await request(typed).get('/teapot');
    expect(res.status).toBe(418);
    expect(res.body).toEqual({ error: { code: 'TEAPOT', message: 'I am a teapot' } });
  });

  it('connection has foreign keys enabled', () => {
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});
