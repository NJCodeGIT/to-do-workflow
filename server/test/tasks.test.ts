import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { signToken } from '../src/auth/token.js';
import { makeTestApp, TEST_AUTH } from './helpers.js';

// Minimal S-005 API tests; test-engineer expands the suite.
const TASKS = '/api/v1/tasks';
const TASK_KEYS = ['completedAt', 'createdAt', 'description', 'id', 'status', 'title', 'updatedAt'];
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

let app: Express;
let db: Database.Database;
let counter = 0;

// Users are inserted directly (fake hash) so tests skip argon2; tokens are signed for their ids.
function makeUser(): { id: number; auth: string } {
  counter += 1;
  const id = db
    .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id')
    .pluck()
    .get(`task-user${counter}@example.com`, 'fake-hash-not-real') as number;
  return { id, auth: `Bearer ${signToken(id, TEST_AUTH)}` };
}

beforeAll(() => {
  ({ app, db } = makeTestApp());
});

afterAll(() => {
  db.close();
});

describe('POST /tasks', () => {
  it('returns 201 with a seven-key active Task, trimmed, owned by the token user', async () => {
    const user = makeUser();
    const res = await request(app)
      .post(TASKS)
      .set('Authorization', user.auth)
      .send({ title: '  Buy milk ', description: '   ', status: 'completed', userId: 999 });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(TASK_KEYS);
    expect(res.body).toMatchObject({
      title: 'Buy milk',
      description: null,
      status: 'active',
      completedAt: null,
    });
    expect(typeof res.body.id).toBe('number');
    expect(res.body.createdAt).toMatch(ISO_MS);
    expect(res.body.updatedAt).toBe(res.body.createdAt);

    const owner = db.prepare('SELECT user_id FROM tasks WHERE id = ?').pluck().get(res.body.id);
    expect(owner).toBe(user.id);
  });

  it('rejects a whitespace-only title with 400 and creates no row', async () => {
    const user = makeUser();
    const res = await request(app)
      .post(TASKS)
      .set('Authorization', user.auth)
      .send({ title: '   ' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'title is required' },
    });
    const count = db.prepare('SELECT COUNT(*) FROM tasks WHERE user_id = ?').pluck().get(user.id);
    expect(count).toBe(0);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).post(TASKS).send({ title: 'x' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  });

  it('returns 401 "Invalid or expired token" for a valid token of a missing user', async () => {
    const res = await request(app)
      .post(TASKS)
      .set('Authorization', `Bearer ${signToken(987654, TEST_AUTH)}`)
      .send({ title: 'x' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
    });
  });
});

describe('GET /tasks', () => {
  it('lists only the token user tasks, newest first, and filters by status', async () => {
    const user = makeUser();
    const other = makeUser();
    const first = await request(app)
      .post(TASKS)
      .set('Authorization', user.auth)
      .send({ title: 'first' });
    const second = await request(app)
      .post(TASKS)
      .set('Authorization', user.auth)
      .send({ title: 'second' });
    await request(app).post(TASKS).set('Authorization', other.auth).send({ title: 'not mine' });
    db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(first.body.id);

    const all = await request(app)
      .get(`${TASKS}?userId=${other.id}`)
      .set('Authorization', user.auth);
    expect(all.status).toBe(200);
    expect(all.body.tasks.map((t: { title: string }) => t.title)).toEqual(['second', 'first']);
    expect(all.body.tasks[0]).toEqual(second.body);

    const active = await request(app).get(`${TASKS}?status=active`).set('Authorization', user.auth);
    expect(active.body.tasks.map((t: { id: number }) => t.id)).toEqual([second.body.id]);

    const done = await request(app)
      .get(`${TASKS}?status=completed`)
      .set('Authorization', user.auth);
    expect(done.body.tasks.map((t: { id: number }) => t.id)).toEqual([first.body.id]);
  });

  it('returns {tasks:[]} for a user with no tasks', async () => {
    const user = makeUser();
    const res = await request(app).get(TASKS).set('Authorization', user.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tasks: [] });
  });

  it.each(['status=done', 'status=', 'status=Active', 'status=active&status=all'])(
    'rejects ?%s with 400',
    async (query) => {
      const user = makeUser();
      const res = await request(app).get(`${TASKS}?${query}`).set('Authorization', user.auth);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'status must be one of: active, completed, all',
        },
      });
    },
  );

  it('returns 401 without a token', async () => {
    const res = await request(app).get(TASKS);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  });
});
