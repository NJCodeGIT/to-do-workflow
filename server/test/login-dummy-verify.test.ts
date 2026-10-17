import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { verifyAgainstDummy } from '../src/auth/password.js';
import { makeTestApp } from './helpers.js';

// Pass-through spy: the real argon2 code still runs with the pinned parameters.
vi.mock('../src/auth/password.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/auth/password.js')>();
  return { ...actual, verifyAgainstDummy: vi.fn(actual.verifyAgainstDummy) };
});

// Obviously fake credentials.
const EMAIL = 'dummy-verify@example.com';
const PASSWORD = 'fake-password-for-tests-1';
const LOGIN = '/api/v1/auth/login';

let app: Express;
let db: Database.Database;

beforeAll(async () => {
  ({ app, db } = makeTestApp());
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: EMAIL, password: PASSWORD });
  expect(res.status).toBe(201);
});

afterAll(() => {
  db.close();
});

beforeEach(() => {
  vi.mocked(verifyAgainstDummy).mockClear();
});

describe('login timing equalization (dummy verify)', () => {
  it('runs the dummy verify exactly once for an unknown email', async () => {
    const res = await request(app)
      .post(LOGIN)
      .send({ email: 'nobody@example.com', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(verifyAgainstDummy).toHaveBeenCalledTimes(1);
  });

  it('does not run it for a known email with a wrong password', async () => {
    const res = await request(app).post(LOGIN).send({ email: EMAIL, password: 'wrong-password-1' });
    expect(res.status).toBe(401);
    expect(verifyAgainstDummy).toHaveBeenCalledTimes(0);
  });

  it('does not run it for a known email with the correct password', async () => {
    const res = await request(app).post(LOGIN).send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(verifyAgainstDummy).toHaveBeenCalledTimes(0);
  });

  it('does not run it when the body fails validation', async () => {
    const res = await request(app).post(LOGIN).send({ email: 'nobody@example.com' });
    expect(res.status).toBe(400);
    expect(verifyAgainstDummy).toHaveBeenCalledTimes(0);
  });
});
