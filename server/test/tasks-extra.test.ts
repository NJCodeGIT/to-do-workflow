import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { signToken } from '../src/auth/token.js';
import { makeTestApp, TEST_AUTH } from './helpers.js';

// S-005 edge cases and acceptance gaps; the basic happy paths are in tasks.test.ts.
const TASKS = '/api/v1/tasks';
const TASK_KEYS = ['completedAt', 'createdAt', 'description', 'id', 'status', 'title', 'updatedAt'];

let app: Express;
let db: Database.Database;
let counter = 0;

function makeUser(): { id: number; auth: string } {
  counter += 1;
  const id = db
    .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id')
    .pluck()
    .get(`extra-user${counter}@example.com`, 'fake-hash-not-real') as number;
  return { id, auth: `Bearer ${signToken(id, TEST_AUTH)}` };
}

beforeAll(() => {
  ({ app, db } = makeTestApp());
});

afterAll(() => {
  db.close();
});

const postAs = (auth: string) => request(app).post(TASKS).set('Authorization', auth);
const taskCount = (userId: number): number =>
  db.prepare('SELECT COUNT(*) FROM tasks WHERE user_id = ?').pluck().get(userId) as number;
const validation = (message: string) => ({ error: { code: 'VALIDATION_ERROR', message } });

describe('POST /tasks validation bounds', () => {
  it('accepts a 200-char title and trims spaces around it', async () => {
    const user = makeUser();
    const title = 'a'.repeat(200);
    const res = await postAs(user.auth).send({ title: `  ${title}  ` });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(title);
  });

  it('rejects a 201-char title (after trim) with 400 and no row', async () => {
    const user = makeUser();
    const res = await postAs(user.auth).send({ title: ` ${'a'.repeat(201)} ` });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(validation('title must be at most 200 characters'));
    expect(taskCount(user.id)).toBe(0);
  });

  it('accepts a 2000-char description and trims it', async () => {
    const user = makeUser();
    const description = 'd'.repeat(2000);
    const res = await postAs(user.auth).send({ title: 't', description: `\n ${description} \t` });
    expect(res.status).toBe(201);
    expect(res.body.description).toBe(description);
  });

  it('rejects a 2001-char description with 400 and no row', async () => {
    const user = makeUser();
    const res = await postAs(user.auth).send({ title: 't', description: 'd'.repeat(2001) });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(validation('description must be at most 2000 characters'));
    expect(taskCount(user.id)).toBe(0);
  });

  it.each([
    ['missing', {}, 'title is required'],
    ['null', { title: null }, 'title must be a string'],
    ['a number', { title: 5 }, 'title must be a string'],
    ['an object', { title: {} }, 'title must be a string'],
    ['an array', { title: ['x'] }, 'title must be a string'],
    ['empty', { title: '' }, 'title is required'],
  ])('rejects a title that is %s', async (_name, body, message) => {
    const user = makeUser();
    const res = await postAs(user.auth).send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(validation(message));
    expect(taskCount(user.id)).toBe(0);
  });

  it.each([
    ['a number', 5],
    ['a boolean', true],
    ['an array', ['x']],
    ['an object', { a: 1 }],
  ])('rejects a description that is %s', async (_name, description) => {
    const user = makeUser();
    const res = await postAs(user.auth).send({ title: 't', description });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(validation('description must be a string'));
    expect(taskCount(user.id)).toBe(0);
  });

  it('stores omitted, null, empty and whitespace descriptions as null; trims real text', async () => {
    const user = makeUser();
    for (const body of [
      { title: 'a' },
      { title: 'b', description: null },
      { title: 'c', description: '' },
      { title: 'd', description: ' \n\t ' },
    ]) {
      const res = await postAs(user.auth).send(body);
      expect(res.status).toBe(201);
      expect(res.body.description).toBeNull();
    }
    const kept = await postAs(user.auth).send({ title: 'e', description: '  line1\nline2  ' });
    expect(kept.body.description).toBe('line1\nline2');
    const nulls = db
      .prepare('SELECT COUNT(*) FROM tasks WHERE user_id = ? AND description IS NULL')
      .pluck()
      .get(user.id);
    expect(nulls).toBe(4);
  });

  it('ignores id, timestamps, completedAt and user_id sent in the body', async () => {
    const user = makeUser();
    const old = '2000-01-01T00:00:00.000Z';
    const res = await postAs(user.auth).send({
      title: 't',
      id: 424242,
      createdAt: old,
      updatedAt: old,
      completedAt: old,
      user_id: 999,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(424242);
    expect(res.body.createdAt).not.toBe(old);
    expect(res.body.completedAt).toBeNull();
    expect(Object.keys(res.body).sort()).toEqual(TASK_KEYS);
    const owner = db.prepare('SELECT user_id FROM tasks WHERE id = ?').pluck().get(res.body.id);
    expect(owner).toBe(user.id);
  });
});

describe('POST /tasks bad bodies', () => {
  it('returns 400 "Request body must be a JSON object" for a missing body', async () => {
    const user = makeUser();
    const res = await request(app).post(TASKS).set('Authorization', user.auth);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(validation('Request body must be a JSON object'));
    expect(taskCount(user.id)).toBe(0);
  });

  it('returns 400 for a non-JSON content type', async () => {
    const user = makeUser();
    const res = await request(app)
      .post(TASKS)
      .set('Authorization', user.auth)
      .set('Content-Type', 'text/plain')
      .send('title=x');
    expect(res.status).toBe(400);
    expect(res.body).toEqual(validation('Request body must be a JSON object'));
    expect(taskCount(user.id)).toBe(0);
  });

  it('returns 400 "Request body must be a JSON object" for an array body', async () => {
    const user = makeUser();
    const res = await postAs(user.auth).send([{ title: 'x' }]);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(validation('Request body must be a JSON object'));
    expect(taskCount(user.id)).toBe(0);
  });

  it('returns 400 "Invalid request body" for malformed JSON with a valid token', async () => {
    const user = makeUser();
    const res = await postAs(user.auth).set('Content-Type', 'application/json').send('{"title":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual(validation('Invalid request body'));
  });

  it('returns 400 (not 401) for malformed JSON with no token', async () => {
    const res = await request(app)
      .post(TASKS)
      .set('Content-Type', 'application/json')
      .send('{"title":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual(validation('Invalid request body'));
  });

  it('returns 401 (auth before validation) for a schema-invalid body with no token', async () => {
    const res = await request(app).post(TASKS).send({ title: '' });
    expect(res.status).toBe(401);
  });
});

describe('auth failures on both task routes', () => {
  const expired = `Bearer ${signToken(1, { ...TEST_AUTH, jwtExpiresInSeconds: -60 })}`;
  const badSig = `Bearer ${signToken(1, { ...TEST_AUTH, jwtSecret: 'another-fake-secret-0123456789abcdef' })}`;
  const cases: Array<[string, string]> = [
    ['bad scheme', 'Basic abc'],
    ['malformed token', 'Bearer not-a-jwt'],
    ['bad signature', badSig],
    ['expired token', expired],
  ];

  it.each(cases)('POST and GET return 401 for %s with no task data', async (_name, header) => {
    const post = await request(app).post(TASKS).set('Authorization', header).send({ title: 'x' });
    const get = await request(app).get(TASKS).set('Authorization', header);
    for (const res of [post, get]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.tasks).toBeUndefined();
      expect(res.body.title).toBeUndefined();
    }
  });
});

describe('GET /tasks ordering, filters and isolation', () => {
  const insert = (userId: number, title: string, createdAt: string, status = 'active'): number =>
    db
      .prepare(
        'INSERT INTO tasks (user_id, title, status, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
      )
      .pluck()
      .get(
        userId,
        title,
        status,
        status === 'completed' ? createdAt : null,
        createdAt,
        createdAt,
      ) as number;

  const idsFor = async (auth: string, query = ''): Promise<number[]> => {
    const res = await request(app).get(`${TASKS}${query}`).set('Authorization', auth);
    return res.body.tasks.map((t: { id: number }) => t.id);
  };

  it('orders by created_at DESC, ties broken by id DESC (all, active, completed)', async () => {
    const user = makeUser();
    const same = '2030-01-01T00:00:00.000Z';
    const a = insert(user.id, 'tie-a', same);
    const b = insert(user.id, 'tie-b', same);
    const c = insert(user.id, 'tie-c', same);
    const older = insert(user.id, 'older', '2029-01-01T00:00:00.000Z');
    const newer = insert(user.id, 'newer', '2031-01-01T00:00:00.000Z');
    const doneA = insert(user.id, 'done-a', same, 'completed');
    const doneB = insert(user.id, 'done-b', same, 'completed');

    expect(await idsFor(user.auth)).toEqual([newer, doneB, doneA, c, b, a, older]);
    expect(await idsFor(user.auth, '?status=all')).toEqual([newer, doneB, doneA, c, b, a, older]);
    expect(await idsFor(user.auth, '?status=active')).toEqual([newer, c, b, a, older]);
    expect(await idsFor(user.auth, '?status=completed')).toEqual([doneB, doneA]);
  });

  it('treats a bare ?status (no =) as invalid', async () => {
    const user = makeUser();
    const res = await request(app).get(`${TASKS}?status`).set('Authorization', user.auth);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(validation('status must be one of: active, completed, all'));
  });

  it('accepts ?status=all explicitly and ignores unknown query params', async () => {
    const user = makeUser();
    insert(user.id, 'x', '2030-01-01T00:00:00.000Z');
    insert(user.id, 'y', '2030-01-02T00:00:00.000Z', 'completed');
    const res = await request(app)
      .get(`${TASKS}?status=all&foo=bar&user_id=1`)
      .set('Authorization', user.auth);
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(2);
  });

  it('never shows one user the other user tasks in any filter, in either direction', async () => {
    const alice = makeUser();
    const bob = makeUser();
    const t = '2030-01-01T00:00:00.000Z';
    const aActive = insert(alice.id, 'alice-active', t);
    const aDone = insert(alice.id, 'alice-done', t, 'completed');
    const bActive = insert(bob.id, 'bob-active', t);
    const bDone = insert(bob.id, 'bob-done', t, 'completed');

    for (const q of ['', '?status=all', '?status=active', '?status=completed']) {
      const mine = await idsFor(alice.auth, q);
      expect(mine).not.toContain(bActive);
      expect(mine).not.toContain(bDone);
      const theirs = await idsFor(bob.auth, q);
      expect(theirs).not.toContain(aActive);
      expect(theirs).not.toContain(aDone);
    }
    expect(await idsFor(alice.auth, '?status=active')).toEqual([aActive]);
    expect(await idsFor(bob.auth, '?status=completed')).toEqual([bDone]);
  });

  it('a created task is visible to its owner and not to another user', async () => {
    const owner = makeUser();
    const other = makeUser();
    const created = await postAs(owner.auth).send({ title: 'mine' });
    expect(await idsFor(owner.auth)).toContain(created.body.id);
    const otherList = await request(app).get(TASKS).set('Authorization', other.auth);
    expect(otherList.body).toEqual({ tasks: [] });
  });

  it('exposes exactly seven keys per task and never user_id/userId in responses', async () => {
    const user = makeUser();
    const created = await postAs(user.auth).send({ title: 'k', description: 'd' });
    insert(user.id, 'direct', '2030-01-01T00:00:00.000Z', 'completed');
    const list = await request(app).get(TASKS).set('Authorization', user.auth);
    expect(Object.keys(created.body).sort()).toEqual(TASK_KEYS);
    expect(list.body.tasks).toHaveLength(2);
    for (const task of list.body.tasks) {
      expect(Object.keys(task).sort()).toEqual(TASK_KEYS);
    }
    for (const text of [JSON.stringify(created.body), JSON.stringify(list.body)]) {
      expect(text).not.toMatch(/user_?id/i);
    }
  });

  it('maps a completed row to camelCase with completedAt', async () => {
    const user = makeUser();
    const at = '2030-05-05T05:05:05.000Z';
    const id = insert(user.id, 'done', at, 'completed');
    const res = await request(app).get(`${TASKS}?status=completed`).set('Authorization', user.auth);
    expect(res.body.tasks).toEqual([
      {
        id,
        title: 'done',
        description: null,
        status: 'completed',
        completedAt: at,
        createdAt: at,
        updatedAt: at,
      },
    ]);
  });

  it('GET returns {tasks:[]} for a valid token of a deleted user', async () => {
    const res = await request(app)
      .get(TASKS)
      .set('Authorization', `Bearer ${signToken(987655, TEST_AUTH)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tasks: [] });
  });
});

describe('unsupported task routes (S-006 not built)', () => {
  it.each([
    ['put', '/api/v1/tasks'],
    ['delete', '/api/v1/tasks'],
    ['patch', '/api/v1/tasks'],
    ['get', '/api/v1/tasks/1'],
  ] as const)('%s %s returns 404 even with a valid token', async (method, url) => {
    const user = makeUser();
    const res = await request(app)[method](url).set('Authorization', user.auth);
    expect(res.status).toBe(404);
  });
});
