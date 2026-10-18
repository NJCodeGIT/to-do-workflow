import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { signToken } from '../src/auth/token.js';
import { parseTaskId, updateTaskSchema } from '../src/schemas.js';
import { makeTestApp, TEST_AUTH } from './helpers.js';

// Minimal S-006 smoke tests (GET/PATCH/DELETE /tasks/:id); test-engineer expands the suite.
const TASKS = '/api/v1/tasks';
const OLD = '2000-01-01T00:00:00.000Z';
const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Task not found' } };

let app: Express;
let db: Database.Database;
let counter = 0;

function makeUser(): { id: number; auth: string } {
  counter += 1;
  const id = db
    .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id')
    .pluck()
    .get(`item-user${counter}@example.com`, 'fake-hash-not-real') as number;
  return { id, auth: `Bearer ${signToken(id, TEST_AUTH)}` };
}

// Inserted with old timestamps so updatedAt changes are detectable without waiting.
function makeTask(userId: number, title = 'Buy milk'): number {
  return db
    .prepare(
      'INSERT INTO tasks (user_id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
    )
    .pluck()
    .get(userId, title, 'note', OLD, OLD) as number;
}

beforeAll(() => {
  ({ app, db } = makeTestApp());
});

afterAll(() => {
  db.close();
});

describe('updateTaskSchema and parseTaskId', () => {
  it('keeps absent keys absent, maps description null to null, rejects {}', () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
    const cleared = updateTaskSchema.parse({ description: null, userId: 5 });
    expect(cleared).toEqual({ description: null });
    expect('title' in cleared).toBe(false);
    expect(updateTaskSchema.parse({ description: '   ' })).toEqual({ description: null });
    const bad = updateTaskSchema.safeParse({ title: null });
    expect(bad.error?.issues[0]?.message).toBe('title must be a string');
    const both = updateTaskSchema.safeParse({ status: 'done', userId: 1 });
    expect(both.error?.issues[0]?.message).toBe('status must be one of: active, completed');
  });

  it('accepts only canonical positive safe integers', () => {
    expect(parseTaskId('1')).toBe(1);
    expect(parseTaskId('9007199254740991')).toBe(9007199254740991);
    for (const raw of ['0', '01', '-1', '1.5', '1e2', 'abc', ' 1', '', '9007199254740992']) {
      expect(parseTaskId(raw)).toBeNull();
    }
    expect(parseTaskId(undefined)).toBeNull();
  });
});

describe('GET /tasks/:id', () => {
  it('returns the own task and 404 for foreign, missing and malformed ids', async () => {
    const owner = makeUser();
    const other = makeUser();
    const id = makeTask(owner.id);

    const res = await request(app).get(`${TASKS}/${id}`).set('Authorization', owner.auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, title: 'Buy milk', status: 'active', completedAt: null });

    for (const path of [`${id}`, '999999', 'abc']) {
      const auth = path === `${id}` ? other.auth : owner.auth;
      const nf = await request(app).get(`${TASKS}/${path}`).set('Authorization', auth);
      expect(nf.status).toBe(404);
      expect(nf.body).toEqual(NOT_FOUND);
    }
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get(`${TASKS}/1`);
    expect(res.status).toBe(401);
  });

  it('maps an undecodable path to 404 Route not found without logging', async () => {
    const user = makeUser();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).get(`${TASKS}/%E0%A4%A`).set('Authorization', user.auth);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('PATCH /tasks/:id', () => {
  it('completes, keeps completedAt on re-complete, and reopens to null', async () => {
    const user = makeUser();
    const id = makeTask(user.id);

    const done = await request(app)
      .patch(`${TASKS}/${id}`)
      .set('Authorization', user.auth)
      .send({ status: 'completed', completedAt: OLD, userId: 999 });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('completed');
    expect(done.body.completedAt).not.toBe(OLD);
    expect(done.body.completedAt).toBe(done.body.updatedAt);
    expect(done.body.createdAt).toBe(OLD);

    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(OLD, id);
    const again = await request(app)
      .patch(`${TASKS}/${id}`)
      .set('Authorization', user.auth)
      .send({ status: 'completed' });
    expect(again.status).toBe(200);
    expect(again.body.completedAt).toBe(done.body.completedAt);
    expect(again.body.updatedAt).toBe(OLD);

    const reopened = await request(app)
      .patch(`${TASKS}/${id}`)
      .set('Authorization', user.auth)
      .send({ status: 'active' });
    expect(reopened.body).toMatchObject({ status: 'active', completedAt: null });
    expect(reopened.body.updatedAt).not.toBe(OLD);
  });

  it('updates only present fields; same-value patch keeps updatedAt', async () => {
    const user = makeUser();
    const id = makeTask(user.id);

    const same = await request(app)
      .patch(`${TASKS}/${id}`)
      .set('Authorization', user.auth)
      .send({ title: '  Buy milk ' });
    expect(same.status).toBe(200);
    expect(same.body.updatedAt).toBe(OLD);

    const res = await request(app)
      .patch(`${TASKS}/${id}`)
      .set('Authorization', user.auth)
      .send({ description: '' });
    expect(res.body).toMatchObject({ title: 'Buy milk', description: null, status: 'active' });
    expect(res.body.updatedAt).not.toBe(OLD);
  });

  it('rejects an empty or partly invalid body with 400 and writes nothing', async () => {
    const user = makeUser();
    const id = makeTask(user.id);

    const empty = await request(app)
      .patch(`${TASKS}/${id}`)
      .set('Authorization', user.auth)
      .send({ userId: 1 });
    expect(empty.status).toBe(400);
    expect(empty.body.error.message).toBe('at least one of title, description, status is required');

    const partly = await request(app)
      .patch(`${TASKS}/${id}`)
      .set('Authorization', user.auth)
      .send({ title: 'New', status: 'done' });
    expect(partly.status).toBe(400);
    const row = db.prepare('SELECT title, updated_at FROM tasks WHERE id = ?').get(id);
    expect(row).toEqual({ title: 'Buy milk', updated_at: OLD });
  });

  it('returns 404 for a foreign task and leaves it unchanged', async () => {
    const owner = makeUser();
    const other = makeUser();
    const id = makeTask(owner.id);

    const res = await request(app)
      .patch(`${TASKS}/${id}`)
      .set('Authorization', other.auth)
      .send({ title: 'Hijacked' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
    expect(db.prepare('SELECT title FROM tasks WHERE id = ?').pluck().get(id)).toBe('Buy milk');
  });

  it('returns 404 for a malformed id before validating the body', async () => {
    const user = makeUser();
    const res = await request(app).patch(`${TASKS}/abc`).set('Authorization', user.auth).send({});
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });
});

describe('DELETE /tasks/:id', () => {
  it('deletes the own task (204), then 404; foreign delete is 404 and keeps the row', async () => {
    const owner = makeUser();
    const other = makeUser();
    const id = makeTask(owner.id);

    const foreign = await request(app).delete(`${TASKS}/${id}`).set('Authorization', other.auth);
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(NOT_FOUND);

    const res = await request(app).delete(`${TASKS}/${id}`).set('Authorization', owner.auth);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    const again = await request(app).delete(`${TASKS}/${id}`).set('Authorization', owner.auth);
    expect(again.status).toBe(404);
    const get = await request(app).get(`${TASKS}/${id}`).set('Authorization', owner.auth);
    expect(get.status).toBe(404);
  });
});
