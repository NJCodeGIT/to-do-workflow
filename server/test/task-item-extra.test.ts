import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { signToken } from '../src/auth/token.js';
import { makeTestApp, TEST_AUTH } from './helpers.js';

// S-006 full coverage for GET/PATCH/DELETE /tasks/:id (extends task-item.test.ts smoke tests).
const TASKS = '/api/v1/tasks';
const OLD = '2000-01-01T00:00:00.000Z';
const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Task not found' } };
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TASK_KEYS = [
  'completedAt',
  'createdAt',
  'description',
  'id',
  'status',
  'title',
  'updatedAt',
].sort();

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

function makeTask(
  userId: number,
  opts: { title?: string; description?: string | null; completed?: boolean } = {},
): number {
  const { title = 'Buy milk', description = 'note', completed = false } = opts;
  return db
    .prepare(
      'INSERT INTO tasks (user_id, title, description, status, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
    )
    .pluck()
    .get(
      userId,
      title,
      description,
      completed ? 'completed' : 'active',
      completed ? OLD : null,
      OLD,
      OLD,
    ) as number;
}

const rowOf = (id: number): Record<string, unknown> =>
  db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>;

const patch = (auth: string, id: number | string, body?: unknown) =>
  request(app)
    .patch(`${TASKS}/${id}`)
    .set('Authorization', auth)
    .send(body as object);

beforeAll(() => {
  ({ app, db } = makeTestApp());
});

afterAll(() => {
  db.close();
});

describe('GET /tasks/:id', () => {
  it('returns exactly the seven Task keys with no user_id', async () => {
    const user = makeUser();
    const id = makeTask(user.id);
    const res = await request(app).get(`${TASKS}/${id}`).set('Authorization', user.auth);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(TASK_KEYS);
    expect(res.body).toEqual({
      id,
      title: 'Buy milk',
      description: 'note',
      status: 'active',
      completedAt: null,
      createdAt: OLD,
      updatedAt: OLD,
    });
  });

  it('returns a completed task with its completedAt', async () => {
    const user = makeUser();
    const id = makeTask(user.id, { completed: true });
    const res = await request(app).get(`${TASKS}/${id}`).set('Authorization', user.auth);
    expect(res.body).toMatchObject({ status: 'completed', completedAt: OLD });
  });

  it('accepts a percent-encoded digit: %31 is id 1', async () => {
    const user = makeUser();
    const id = makeTask(user.id);
    // Percent-encode every digit of the id: %31 for "1", and so on.
    const encoded = [...String(id)].map((c) => `%${c.charCodeAt(0).toString(16)}`).join('');
    const res = await request(app).get(`${TASKS}/${encoded}`).set('Authorization', user.auth);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
  });

  it.each([
    ['abc'],
    ['0'],
    ['-1'],
    ['1.5'],
    ['1e2'],
    ['01'],
    ['%201'],
    ['1%20'],
    ['+1'],
    ['0x1'],
    ['9007199254740992'],
    ['99999999999999999999999999'],
    ['999999'],
  ])('returns the identical 404 for id %s', async (raw) => {
    const user = makeUser();
    makeTask(user.id);
    const res = await request(app).get(`${TASKS}/${raw}`).set('Authorization', user.auth);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });

  it('does not match id 100 for 1e2 and does not match the real id for 01', async () => {
    const user = makeUser();
    // Burn ids until a task with id 100 exists, owned by this user.
    let id = 0;
    while (id < 100) id = makeTask(user.id);
    const res100 = await request(app).get(`${TASKS}/100`).set('Authorization', user.auth);
    expect(res100.status).toBe(200);
    const sci = await request(app).get(`${TASKS}/1e2`).set('Authorization', user.auth);
    expect(sci.status).toBe(404);
    const lead = await request(app).get(`${TASKS}/0100`).set('Authorization', user.auth);
    expect(lead.status).toBe(404);
  });

  it('answers 404 Route not found for undecodable paths on all verbs, no 500', async () => {
    const user = makeUser();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const method of ['get', 'patch', 'delete'] as const) {
      const res = await request(app)
        [method](`${TASKS}/%E0%A4%A`)
        .set('Authorization', user.auth)
        .send(method === 'patch' ? { title: 'x' } : undefined);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('ignores userId/user_id in the query string', async () => {
    const owner = makeUser();
    const other = makeUser();
    const id = makeTask(owner.id);
    const res = await request(app)
      .get(`${TASKS}/${id}?userId=${owner.id}&user_id=${owner.id}`)
      .set('Authorization', other.auth);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });
});

describe('PATCH /tasks/:id edits', () => {
  it('updates only the title and leaves other fields untouched', async () => {
    const user = makeUser();
    const id = makeTask(user.id);
    const res = await patch(user.auth, id, { title: '  New title  ' });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(TASK_KEYS);
    expect(res.body).toMatchObject({
      id,
      title: 'New title',
      description: 'note',
      status: 'active',
      completedAt: null,
      createdAt: OLD,
    });
    expect(res.body.updatedAt).toMatch(ISO_MS);
    expect(res.body.updatedAt).not.toBe(OLD);
  });

  it('updates only the description (trimmed) and leaves the title', async () => {
    const user = makeUser();
    const id = makeTask(user.id);
    const res = await patch(user.auth, id, { description: '  fresh note ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Buy milk', description: 'fresh note' });
    expect(res.body.updatedAt).not.toBe(OLD);
  });

  it('updates title, description and status in one request', async () => {
    const user = makeUser();
    const id = makeTask(user.id);
    const res = await patch(user.auth, id, {
      title: 'All',
      description: 'three',
      status: 'completed',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'All', description: 'three', status: 'completed' });
    expect(res.body.completedAt).toMatch(ISO_MS);
    expect(res.body.completedAt).toBe(res.body.updatedAt);
    expect(res.body.createdAt).toBe(OLD);
  });

  it('persists the change (a following GET returns the same Task)', async () => {
    const user = makeUser();
    const id = makeTask(user.id);
    const res = await patch(user.auth, id, { title: 'Persisted', status: 'completed' });
    const get = await request(app).get(`${TASKS}/${id}`).set('Authorization', user.auth);
    expect(get.body).toEqual(res.body);
  });

  it('accepts a 200-character title and rejects 201 characters', async () => {
    const user = makeUser();
    const id = makeTask(user.id);
    const ok = await patch(user.auth, id, { title: 'a'.repeat(200) });
    expect(ok.status).toBe(200);
    const bad = await patch(user.auth, id, { title: 'b'.repeat(201) });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'title must be at most 200 characters' },
    });
    expect(rowOf(id).title).toBe('a'.repeat(200));
  });

  it.each([
    [{ title: '' }, 'title is required'],
    [{ title: '   ' }, 'title is required'],
    [{ title: null }, 'title must be a string'],
    [{ title: 5 }, 'title must be a string'],
    [{ title: ['x'] }, 'title must be a string'],
    [{ description: 5 }, 'description must be a string'],
    [{ description: {} }, 'description must be a string'],
    [{ description: 'd'.repeat(2001) }, 'description must be at most 2000 characters'],
  ])('rejects %j with 400 "%s" and changes nothing', async (body, message) => {
    const user = makeUser();
    const id = makeTask(user.id);
    const before = rowOf(id);
    const res = await patch(user.auth, id, body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message } });
    expect(rowOf(id)).toEqual(before);
  });

  it('accepts a 2000-character description', async () => {
    const user = makeUser();
    const id = makeTask(user.id);
    const res = await patch(user.auth, id, { description: 'd'.repeat(2000) });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('d'.repeat(2000));
  });

  it.each([[null], [''], ['   ']])('description %j clears it to null', async (value) => {
    const user = makeUser();
    const id = makeTask(user.id);
    const res = await patch(user.auth, id, { description: value });
    expect(res.status).toBe(200);
    expect(res.body.description).toBeNull();
    expect(res.body.title).toBe('Buy milk');
    expect(res.body.updatedAt).not.toBe(OLD);
    expect(rowOf(id).description).toBeNull();
  });

  it('clearing an already-null description is a no-op that keeps updatedAt', async () => {
    const user = makeUser();
    const id = makeTask(user.id, { description: null });
    const res = await patch(user.auth, id, { description: null });
    expect(res.status).toBe(200);
    expect(res.body.description).toBeNull();
    expect(res.body.updatedAt).toBe(OLD);
  });

  it('a case-only title change counts as a change and bumps updatedAt', async () => {
    const user = makeUser();
    const id = makeTask(user.id, { title: 'buy milk' });
    const res = await patch(user.auth, id, { title: 'Buy Milk' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Buy Milk');
    expect(res.body.updatedAt).not.toBe(OLD);
    expect(rowOf(id).title).toBe('Buy Milk');
  });

  it('same-value patches (title, description, status) return 200 and keep updatedAt', async () => {
    const user = makeUser();
    const id = makeTask(user.id);
    const res = await patch(user.auth, id, {
      title: 'Buy milk',
      description: 'note',
      status: 'active',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id,
      title: 'Buy milk',
      description: 'note',
      status: 'active',
      completedAt: null,
      createdAt: OLD,
      updatedAt: OLD,
    });
  });

  it('createdAt never changes across several edits', async () => {
    const user = makeUser();
    const id = makeTask(user.id);
    await patch(user.auth, id, { title: 'one' });
    await patch(user.auth, id, { status: 'completed' });
    const res = await patch(user.auth, id, { status: 'active', description: null });
    expect(res.body.createdAt).toBe(OLD);
  });
});

describe('PATCH /tasks/:id complete and reopen', () => {
  it('complete sets an ISO ms completedAt equal to updatedAt', async () => {
    const user = makeUser();
    const id = makeTask(user.id);
    const res = await patch(user.auth, id, { status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.completedAt).toMatch(ISO_MS);
    expect(res.body.completedAt).toBe(res.body.updatedAt);
    expect(res.body.title).toBe('Buy milk');
    expect(res.body.description).toBe('note');
  });

  it('re-complete keeps the original completedAt and updatedAt (seeded old values)', async () => {
    const user = makeUser();
    const id = makeTask(user.id, { completed: true });
    const res = await patch(user.auth, id, { status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.completedAt).toBe(OLD);
    expect(res.body.updatedAt).toBe(OLD);
  });

  it('re-complete together with a title change keeps completedAt but bumps updatedAt', async () => {
    const user = makeUser();
    const id = makeTask(user.id, { completed: true });
    const res = await patch(user.auth, id, { status: 'completed', title: 'Renamed' });
    expect(res.body.completedAt).toBe(OLD);
    expect(res.body.title).toBe('Renamed');
    expect(res.body.updatedAt).not.toBe(OLD);
  });

  it('reopen clears completedAt to null and bumps updatedAt', async () => {
    const user = makeUser();
    const id = makeTask(user.id, { completed: true });
    const res = await patch(user.auth, id, { status: 'active' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'active', completedAt: null });
    expect(res.body.updatedAt).not.toBe(OLD);
    expect(rowOf(id).completed_at).toBeNull();
  });

  it('reopen of an active task is a 200 no-op: completedAt null, updatedAt unchanged', async () => {
    const user = makeUser();
    const id = makeTask(user.id);
    const res = await patch(user.auth, id, { status: 'active' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'active', completedAt: null, updatedAt: OLD });
  });

  it('editing the title of a completed task keeps status and completedAt', async () => {
    const user = makeUser();
    const id = makeTask(user.id, { completed: true });
    const res = await patch(user.auth, id, { title: 'Done and renamed' });
    expect(res.body).toMatchObject({ status: 'completed', completedAt: OLD });
    expect(res.body.updatedAt).not.toBe(OLD);
  });

  it('complete then reopen then complete again sets a fresh completedAt', async () => {
    const user = makeUser();
    const id = makeTask(user.id);
    await patch(user.auth, id, { status: 'completed' });
    db.prepare('UPDATE tasks SET completed_at = ? WHERE id = ?').run(OLD, id);
    await patch(user.auth, id, { status: 'active' });
    const again = await patch(user.auth, id, { status: 'completed' });
    expect(again.body.completedAt).not.toBe(OLD);
    expect(again.body.completedAt).toMatch(ISO_MS);
  });

  it.each([
    [{ status: 'done' }],
    [{ status: 'Active' }],
    [{ status: 'COMPLETED' }],
    [{ status: null }],
    [{ status: 1 }],
    [{ status: '' }],
    [{ status: true }],
    [{ status: ['active'] }],
  ])('invalid status %j returns 400 and leaves a completed task unchanged', async (body) => {
    const user = makeUser();
    const id = makeTask(user.id, { completed: true });
    const before = rowOf(id);
    const res = await patch(user.auth, id, body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'status must be one of: active, completed' },
    });
    expect(rowOf(id)).toEqual(before);
  });
});

describe('PATCH /tasks/:id body rules', () => {
  const EMPTY = {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'at least one of title, description, status is required',
    },
  };

  it.each([
    [{}],
    [{ id: 99 }],
    [{ userId: 1, user_id: 1 }],
    [{ completedAt: '2030-01-01T00:00:00.000Z' }],
    [{ createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z' }],
    [{ unknown: 'x' }],
  ])('empty or ignored-only body %j returns 400 and writes nothing', async (body) => {
    const user = makeUser();
    const id = makeTask(user.id);
    const before = rowOf(id);
    const res = await patch(user.auth, id, body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(EMPTY);
    expect(rowOf(id)).toEqual(before);
  });

  it('keeps the existing 400s for array, non-object, missing and malformed bodies', async () => {
    const user = makeUser();
    const id = makeTask(user.id);
    const before = rowOf(id);

    const arr = await patch(user.auth, id, [{ title: 'x' }]);
    expect(arr.status).toBe(400);
    expect(arr.body.error.code).toBe('VALIDATION_ERROR');

    const none = await request(app).patch(`${TASKS}/${id}`).set('Authorization', user.auth);
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe('VALIDATION_ERROR');

    const str = await request(app)
      .patch(`${TASKS}/${id}`)
      .set('Authorization', user.auth)
      .set('Content-Type', 'application/json')
      .send('"just a string"');
    expect(str.status).toBe(400);

    const bad = await request(app)
      .patch(`${TASKS}/${id}`)
      .set('Authorization', user.auth)
      .set('Content-Type', 'application/json')
      .send('{"title": ');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect(rowOf(id)).toEqual(before);
  });

  it('ignores id, userId, user_id, completedAt, createdAt, updatedAt next to a real field', async () => {
    const owner = makeUser();
    const other = makeUser();
    const id = makeTask(owner.id);
    const res = await patch(owner.auth, id, {
      title: 'Edited',
      id: 12345,
      userId: other.id,
      user_id: other.id,
      completedAt: '2031-01-01T00:00:00.000Z',
      createdAt: '2031-01-01T00:00:00.000Z',
      updatedAt: '2031-01-01T00:00:00.000Z',
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.title).toBe('Edited');
    expect(res.body.completedAt).toBeNull();
    expect(res.body.createdAt).toBe(OLD);
    expect(res.body.updatedAt).not.toBe('2031-01-01T00:00:00.000Z');
    expect(rowOf(id).user_id).toBe(owner.id);
    expect(db.prepare('SELECT COUNT(*) FROM tasks WHERE id = 12345').pluck().get()).toBe(0);
  });

  it('cannot set completedAt directly on a completed task via the body', async () => {
    const user = makeUser();
    const id = makeTask(user.id, { completed: true });
    const res = await patch(user.auth, id, {
      title: 'x',
      completedAt: '2031-01-01T00:00:00.000Z',
    });
    expect(res.body.completedAt).toBe(OLD);
  });

  it('a body userId pointing at the owner does not let another user patch', async () => {
    const owner = makeUser();
    const other = makeUser();
    const id = makeTask(owner.id);
    const res = await patch(other.auth, id, { title: 'Hijacked', userId: owner.id });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
    expect(rowOf(id).title).toBe('Buy milk');
  });
});

describe('PATCH /tasks/:id no partial write', () => {
  it.each([
    [{ title: 'New', status: 'done' }],
    [{ title: 'New', description: 5 }],
    [{ description: 'new', status: 'done' }],
    [{ title: '', description: 'new', status: 'completed' }],
    [{ title: 'New', description: 'x'.repeat(2001), status: 'completed' }],
    [{ status: 'completed', title: null }],
  ])('%j changes no column', async (body) => {
    const user = makeUser();
    const id = makeTask(user.id);
    const before = rowOf(id);
    const res = await patch(user.auth, id, body);
    expect(res.status).toBe(400);
    expect(rowOf(id)).toEqual(before);
  });
});

describe('PATCH /tasks/:id id edge cases', () => {
  it('%31 resolves to id 1 for PATCH and DELETE would too (PATCH checked here)', async () => {
    const user = makeUser();
    const id = makeTask(user.id);
    const encoded = String(id)
      .split('')
      .map((c) => `%${c.charCodeAt(0).toString(16)}`)
      .join('');
    const res = await patch(user.auth, encoded, { title: 'Via encoded id' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(rowOf(id).title).toBe('Via encoded id');
  });

  it.each([['abc'], ['0'], ['-1'], ['1.5'], ['1e2'], ['01'], ['%201'], ['9007199254740992']])(
    'id %s returns the identical 404 even with an invalid body',
    async (raw) => {
      const user = makeUser();
      makeTask(user.id);
      for (const body of [{ title: 'ok' }, {}, { status: 'done' }]) {
        const res = await patch(user.auth, raw, body);
        expect(res.status).toBe(404);
        expect(res.body).toEqual(NOT_FOUND);
      }
    },
  );

  it('a well-formed foreign id with an invalid body is 400, not 404', async () => {
    const owner = makeUser();
    const other = makeUser();
    const id = makeTask(owner.id);
    const res = await patch(other.auth, id, { status: 'done' });
    expect(res.status).toBe(400);
    expect(rowOf(id).status).toBe('active');
  });

  it('a nonexistent id with a valid body is 404 and creates nothing', async () => {
    const user = makeUser();
    const before = db.prepare('SELECT COUNT(*) FROM tasks').pluck().get();
    const res = await patch(user.auth, 888888, { title: 'Ghost' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
    expect(db.prepare('SELECT COUNT(*) FROM tasks').pluck().get()).toBe(before);
  });
});

describe('DELETE /tasks/:id', () => {
  it('returns 204 with an empty body and removes the task from every list filter', async () => {
    const user = makeUser();
    const keep = makeTask(user.id, { title: 'keep' });
    const gone = makeTask(user.id, { title: 'gone' });
    const goneDone = makeTask(user.id, { title: 'gone-done', completed: true });

    for (const id of [gone, goneDone]) {
      const res = await request(app).delete(`${TASKS}/${id}`).set('Authorization', user.auth);
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(res.body).toEqual({});
    }

    for (const q of ['', '?status=all', '?status=active', '?status=completed']) {
      const list = await request(app).get(`${TASKS}${q}`).set('Authorization', user.auth);
      const ids = list.body.tasks.map((t: { id: number }) => t.id);
      expect(ids).not.toContain(gone);
      expect(ids).not.toContain(goneDone);
    }
    const all = await request(app).get(TASKS).set('Authorization', user.auth);
    expect(all.body.tasks.map((t: { id: number }) => t.id)).toEqual([keep]);
    expect(
      db.prepare('SELECT COUNT(*) FROM tasks WHERE id IN (?, ?)').pluck().get(gone, goneDone),
    ).toBe(0);
  });

  it('PATCH after DELETE is 404 and a second DELETE is 404', async () => {
    const user = makeUser();
    const id = makeTask(user.id);
    await request(app).delete(`${TASKS}/${id}`).set('Authorization', user.auth);
    const p = await patch(user.auth, id, { title: 'Zombie' });
    expect(p.status).toBe(404);
    expect(p.body).toEqual(NOT_FOUND);
    const d = await request(app).delete(`${TASKS}/${id}`).set('Authorization', user.auth);
    expect(d.status).toBe(404);
    expect(d.body).toEqual(NOT_FOUND);
  });

  it('deletes only the target task, not siblings', async () => {
    const user = makeUser();
    const a = makeTask(user.id, { title: 'a' });
    const b = makeTask(user.id, { title: 'b' });
    await request(app).delete(`${TASKS}/${a}`).set('Authorization', user.auth);
    const get = await request(app).get(`${TASKS}/${b}`).set('Authorization', user.auth);
    expect(get.status).toBe(200);
  });

  it.each([['abc'], ['0'], ['1.5'], ['1e2'], ['01'], ['%201'], ['9007199254740992'], ['777777']])(
    'id %s returns the identical 404 and deletes nothing',
    async (raw) => {
      const user = makeUser();
      makeTask(user.id);
      const before = db.prepare('SELECT COUNT(*) FROM tasks').pluck().get();
      const res = await request(app).delete(`${TASKS}/${raw}`).set('Authorization', user.auth);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
      expect(db.prepare('SELECT COUNT(*) FROM tasks').pluck().get()).toBe(before);
    },
  );

  it('ignores userId in the query string and body when deleting a foreign task', async () => {
    const owner = makeUser();
    const other = makeUser();
    const id = makeTask(owner.id);
    const res = await request(app)
      .delete(`${TASKS}/${id}?userId=${owner.id}&user_id=${owner.id}`)
      .set('Authorization', other.auth)
      .send({ userId: owner.id });
    expect(res.status).toBe(404);
    expect(rowOf(id)).toBeDefined();
  });
});

describe('two-user isolation for all verbs', () => {
  it('B cannot read, patch (incl. status) or delete A task; A task is unchanged for A', async () => {
    const a = makeUser();
    const b = makeUser();
    const aTask = makeTask(a.id, { title: 'A secret' });
    const bTask = makeTask(b.id, { title: 'B task' });
    const before = rowOf(aTask);

    const get = await request(app).get(`${TASKS}/${aTask}`).set('Authorization', b.auth);
    const p1 = await patch(b.auth, aTask, { title: 'pwn' });
    const p2 = await patch(b.auth, aTask, { status: 'completed' });
    const p3 = await patch(b.auth, aTask, { description: null, userId: b.id });
    const del = await request(app).delete(`${TASKS}/${aTask}`).set('Authorization', b.auth);
    for (const res of [get, p1, p2, p3, del]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
    }
    expect(rowOf(aTask)).toEqual(before);

    const asA = await request(app).get(`${TASKS}/${aTask}`).set('Authorization', a.auth);
    expect(asA.status).toBe(200);
    expect(asA.body).toMatchObject({ title: 'A secret', status: 'active', description: 'note' });

    // And the reverse direction.
    const rev = await patch(a.auth, bTask, { title: 'pwn' });
    const revDel = await request(app).delete(`${TASKS}/${bTask}`).set('Authorization', a.auth);
    expect(rev.status).toBe(404);
    expect(revDel.status).toBe(404);
    const asB = await request(app).get(`${TASKS}/${bTask}`).set('Authorization', b.auth);
    expect(asB.body.title).toBe('B task');
  });

  it('the 404 body for a foreign task equals the body for a nonexistent one (no oracle)', async () => {
    const a = makeUser();
    const b = makeUser();
    const aTask = makeTask(a.id);
    const foreign = await request(app).get(`${TASKS}/${aTask}`).set('Authorization', b.auth);
    const missing = await request(app).get(`${TASKS}/555555`).set('Authorization', b.auth);
    expect(foreign.status).toBe(missing.status);
    expect(foreign.body).toEqual(missing.body);
    expect(foreign.text).toBe(missing.text);
  });

  it('edits and deletes by one user do not leak into the other user list', async () => {
    const a = makeUser();
    const b = makeUser();
    const aTask = makeTask(a.id);
    await patch(a.auth, aTask, { status: 'completed' });
    const bList = await request(app).get(`${TASKS}?status=completed`).set('Authorization', b.auth);
    expect(bList.body.tasks).toEqual([]);
  });
});

describe('auth on /tasks/:id', () => {
  const expired = `Bearer ${signToken(1, { ...TEST_AUTH, jwtExpiresInSeconds: -60 })}`;
  const badSig = `Bearer ${signToken(1, { ...TEST_AUTH, jwtSecret: 'another-fake-secret-0123456789abcdef' })}`;
  const headers: Array<[string, string | undefined]> = [
    ['no header', undefined],
    ['bad scheme', 'Basic abc'],
    ['malformed token', 'Bearer not-a-jwt'],
    ['bad signature', badSig],
    ['expired token', expired],
  ];

  it.each(headers)('GET, PATCH, DELETE return 401 for %s with no task data', async (_n, header) => {
    const user = makeUser();
    const id = makeTask(user.id);
    const before = rowOf(id);
    const withAuth = <T extends request.Test>(r: T): T =>
      header ? (r.set('Authorization', header) as T) : r;

    const get = await withAuth(request(app).get(`${TASKS}/${id}`));
    const pat = await withAuth(request(app).patch(`${TASKS}/${id}`)).send({ title: 'pwn' });
    const del = await withAuth(request(app).delete(`${TASKS}/${id}`));
    for (const res of [get, pat, del]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.title).toBeUndefined();
      expect(res.body.id).toBeUndefined();
    }
    expect(rowOf(id)).toEqual(before);
  });

  it('returns 401 (auth before id/body validation) for a bad id or invalid body without a token', async () => {
    const badId = await request(app).get(`${TASKS}/abc`);
    expect(badId.status).toBe(401);
    const badBody = await request(app).patch(`${TASKS}/abc`).send({ status: 'done' });
    expect(badBody.status).toBe(401);
    const del = await request(app).delete(`${TASKS}/abc`);
    expect(del.status).toBe(401);
  });

  it('returns 400 for a malformed JSON body even without a token (body parsing precedes auth)', async () => {
    const res = await request(app)
      .patch(`${TASKS}/1`)
      .set('Content-Type', 'application/json')
      .send('{"title": ');
    expect(res.status).toBe(400);
  });
});

describe('deleted-user token', () => {
  it('gets 404 (never 500) on GET, PATCH and DELETE, and nothing changes', async () => {
    const user = makeUser();
    const id = makeTask(user.id);
    const ghost = `Bearer ${signToken(424242, TEST_AUTH)}`;
    const before = rowOf(id);

    const get = await request(app).get(`${TASKS}/${id}`).set('Authorization', ghost);
    const pat = await patch(ghost, id, { title: 'ghost edit' });
    const del = await request(app).delete(`${TASKS}/${id}`).set('Authorization', ghost);
    for (const res of [get, pat, del]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
    }
    expect(rowOf(id)).toEqual(before);
  });

  it('a token whose user was deleted after issue gets 404 for its former task id', async () => {
    const user = makeUser();
    const other = makeUser();
    const id = makeTask(other.id);
    db.pragma('foreign_keys = OFF');
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    db.pragma('foreign_keys = ON');
    const res = await request(app).get(`${TASKS}/${id}`).set('Authorization', user.auth);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });
});
