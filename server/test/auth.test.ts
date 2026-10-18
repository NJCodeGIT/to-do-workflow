import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import express, { type Express } from 'express';
import type Database from 'better-sqlite3';
import { errorHandler } from '../src/middleware/error-handler.js';
import { notFound } from '../src/middleware/not-found.js';
import { requireAuth, userIdOf } from '../src/middleware/require-auth.js';
import { makeTestApp, TEST_AUTH } from './helpers.js';

// Obviously fake credentials.
const PASSWORD = 'fake-password-for-tests-1';
const REGISTER = '/api/v1/auth/register';
const LOGIN = '/api/v1/auth/login';

const UNAUTHORIZED_BODY = {
  error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
};

let app: Express;
let db: Database.Database;
let counter = 0;

// Unique email per call so tests share one app and one DB without interfering.
function freshEmail(): string {
  counter += 1;
  return `user${counter}@example.com`;
}

function rowCount(email?: string): number {
  if (email === undefined) return db.prepare('SELECT COUNT(*) FROM users').pluck().get() as number;
  return db.prepare('SELECT COUNT(*) FROM users WHERE email = ?').pluck().get(email) as number;
}

// Probe app built here only; the real app must not contain it.
function makeProbe(): Express {
  const probe = express();
  probe.locals.auth = TEST_AUTH;
  probe.get('/probe', requireAuth, (req, res) => {
    res.json({ userId: userIdOf(req) });
  });
  probe.use(notFound);
  probe.use(errorHandler);
  return probe;
}

beforeAll(() => {
  ({ app, db } = makeTestApp());
});

afterAll(() => {
  db.close();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /auth/register success', () => {
  it('returns 201 with exactly {user:{id,email}, token} and a 3-part token', async () => {
    const email = freshEmail();
    const res = await request(app).post(REGISTER).send({ email, password: PASSWORD });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['token', 'user']);
    expect(res.body.user).toEqual({ id: expect.any(Number), email });
    expect(Object.keys(res.body.user).sort()).toEqual(['email', 'id']);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.split('.')).toHaveLength(3);
  });

  it('stores an argon2id hash, never the password, and never returns either', async () => {
    const email = freshEmail();
    const res = await request(app).post(REGISTER).send({ email, password: PASSWORD });
    expect(res.status).toBe(201);
    const stored = db
      .prepare('SELECT password_hash FROM users WHERE email = ?')
      .pluck()
      .get(email) as string;
    expect(stored.startsWith('$argon2id$')).toBe(true);
    expect(stored).not.toBe(PASSWORD);
    expect(stored).not.toContain(PASSWORD);
    expect(res.text).not.toContain(PASSWORD);
    expect(res.text).not.toContain('$argon2');
    expect(res.text).not.toContain(stored);
    expect(res.text.toLowerCase()).not.toContain('password');
  });

  it('trims and lowercases the email before the format check and storing', async () => {
    const res = await request(app)
      .post(REGISTER)
      .send({ email: '  Ann.Trim@Example.COM ', password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('ann.trim@example.com');
    expect(rowCount('ann.trim@example.com')).toBe(1);
  });

  it('accepts password lengths 8 and 128 (boundaries)', async () => {
    const short = await request(app)
      .post(REGISTER)
      .send({ email: freshEmail(), password: 'a'.repeat(8) });
    const long = await request(app)
      .post(REGISTER)
      .send({ email: freshEmail(), password: 'a'.repeat(128) });
    expect(short.status).toBe(201);
    expect(long.status).toBe(201);
  });

  it('ignores extra fields such as isAdmin', async () => {
    const email = freshEmail();
    const res = await request(app)
      .post(REGISTER)
      .send({ email, password: PASSWORD, isAdmin: true, id: 999 });
    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({ id: expect.any(Number), email });
    expect(res.body.user.id).not.toBe(999);
    expect(JSON.stringify(res.body)).not.toContain('isAdmin');
  });
});

describe('POST /auth/register duplicates', () => {
  const taken = { error: { code: 'EMAIL_TAKEN', message: 'Email is already registered' } };

  it('returns 409 EMAIL_TAKEN for the same email, any case, and padded; one row only', async () => {
    const email = freshEmail();
    expect((await request(app).post(REGISTER).send({ email, password: PASSWORD })).status).toBe(
      201,
    );

    const same = await request(app).post(REGISTER).send({ email, password: PASSWORD });
    expect(same.status).toBe(409);
    expect(same.body).toEqual(taken);

    const upper = await request(app)
      .post(REGISTER)
      .send({ email: email.toUpperCase(), password: PASSWORD });
    expect(upper.status).toBe(409);
    expect(upper.body).toEqual(taken);

    const padded = await request(app)
      .post(REGISTER)
      .send({ email: `  ${email} `, password: PASSWORD });
    expect(padded.status).toBe(409);
    expect(padded.body).toEqual(taken);

    expect(rowCount(email)).toBe(1);
  });

  it('concurrent registers of the same email give one 201 and one 409 and one row', async () => {
    const email = freshEmail();
    const results = await Promise.all([
      request(app).post(REGISTER).send({ email, password: PASSWORD }),
      request(app).post(REGISTER).send({ email, password: PASSWORD }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(rowCount(email)).toBe(1);
  });
});

describe('POST /auth/register validation (400 VALIDATION_ERROR, no row created)', () => {
  const long254 = `${'a'.repeat(242)}@example.com`; // 254 chars: allowed length
  const long256 = `${'a'.repeat(244)}@example.com`; // 256 chars: too long

  type Case = [name: string, send: () => request.Test, message: string];
  const post = () => request(app).post(REGISTER);
  const cases: Case[] = [
    ['missing email', () => post().send({ password: PASSWORD }), 'email is required'],
    [
      'numeric email',
      () => post().send({ email: 123, password: PASSWORD }),
      'email must be a string',
    ],
    [
      'malformed email',
      () => post().send({ email: 'nope', password: PASSWORD }),
      'email must be a valid email address',
    ],
    [
      'email over 254 chars',
      () => post().send({ email: long256, password: PASSWORD }),
      'email must be at most 254 characters',
    ],
    ['missing password', () => post().send({ email: 'v1@example.com' }), 'password is required'],
    [
      'numeric password',
      () => post().send({ email: 'v2@example.com', password: 12345678 }),
      'password must be a string',
    ],
    [
      '7-char password',
      () => post().send({ email: 'v3@example.com', password: 'a'.repeat(7) }),
      'password must be at least 8 characters',
    ],
    [
      '129-char password',
      () => post().send({ email: 'v4@example.com', password: 'a'.repeat(129) }),
      'password must be at most 128 characters',
    ],
    ['array body', () => post().send([]), 'Request body must be a JSON object'],
    ['no body', () => post(), 'Request body must be a JSON object'],
    [
      'text/plain body',
      () => post().type('text/plain').send('email=v5@example.com'),
      'Request body must be a JSON object',
    ],
    [
      'malformed JSON',
      () => post().type('application/json').send('{"email":'),
      'Invalid request body',
    ],
  ];

  it.each(cases)('%s', async (_name, send, message) => {
    const before = rowCount();
    const res = await send();
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message } });
    expect(rowCount()).toBe(before);
  });

  it('accepts an email of exactly 254 chars (boundary)', async () => {
    const res = await post().send({ email: long254, password: PASSWORD });
    expect(res.status).toBe(201);
  });

  it('oversized body (over 100kb) gives 400 "Invalid request body" and no echo', async () => {
    const before = rowCount();
    const res = await post().send({
      email: 'big@example.com',
      password: PASSWORD,
      padding: 'x'.repeat(200 * 1024),
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request body' },
    });
    expect(rowCount()).toBe(before);
  });

  it('malformed JSON containing a password does not echo it back', async () => {
    const res = await post()
      .type('application/json')
      .send(`{"email":"x@example.com","password":"${PASSWORD}`);
    expect(res.status).toBe(400);
    expect(res.text).not.toContain(PASSWORD);
  });
});

describe('POST /auth/login', () => {
  const email = 'login.user@example.com';
  let registeredId: number;

  beforeAll(async () => {
    const res = await request(app).post(REGISTER).send({ email, password: PASSWORD });
    registeredId = res.body.user.id;
  });

  it('returns 200 with {user:{id,email}, token}', async () => {
    const res = await request(app).post(LOGIN).send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['token', 'user']);
    expect(res.body.user).toEqual({ id: registeredId, email });
    expect(res.body.token.split('.')).toHaveLength(3);
    expect(res.text).not.toContain(PASSWORD);
    expect(res.text).not.toContain('$argon2');
  });

  it('accepts an upper-cased, space-padded email', async () => {
    const res = await request(app)
      .post(LOGIN)
      .send({ email: `  ${email.toUpperCase()} `, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: registeredId, email });
  });

  it('unknown email and wrong password give byte-identical 401 bodies', async () => {
    const unknown = await request(app)
      .post(LOGIN)
      .send({ email: 'nobody@example.com', password: PASSWORD });
    const wrong = await request(app).post(LOGIN).send({ email, password: 'wrong-password-1' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(UNAUTHORIZED_BODY);
    expect(unknown.text).toBe(
      '{"error":{"code":"UNAUTHORIZED","message":"Invalid email or password"}}',
    );
    expect(wrong.text).toBe(unknown.text);
  });

  it('a short wrong password (1 char) is 401, not 400 (login checks only 1-128)', async () => {
    const res = await request(app).post(LOGIN).send({ email, password: 'x' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED_BODY);
  });

  it('a 129-char password is 400 on login', async () => {
    const res = await request(app)
      .post(LOGIN)
      .send({ email, password: 'a'.repeat(129) });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'password must be at most 128 characters' },
    });
  });

  it('missing password, empty password, and missing email give 400', async () => {
    const noPassword = await request(app).post(LOGIN).send({ email });
    expect(noPassword.status).toBe(400);
    expect(noPassword.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'password is required',
    });

    const empty = await request(app).post(LOGIN).send({ email, password: '' });
    expect(empty.status).toBe(400);
    expect(empty.body.error.message).toBe('password is required');

    const noEmail = await request(app).post(LOGIN).send({ password: PASSWORD });
    expect(noEmail.status).toBe(400);
    expect(noEmail.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'email is required' });
  });

  it('non-JSON and malformed bodies give 400', async () => {
    const malformed = await request(app).post(LOGIN).type('application/json').send('{"email":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.message).toBe('Invalid request body');

    const none = await request(app).post(LOGIN);
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('tokens issued by register and login', () => {
  it('both pass requireAuth and resolve to the registered user id', async () => {
    const email = freshEmail();
    const reg = await request(app).post(REGISTER).send({ email, password: PASSWORD });
    const log = await request(app).post(LOGIN).send({ email, password: PASSWORD });
    const probe = makeProbe();
    for (const token of [reg.body.token, log.body.token]) {
      const res = await request(probe).get('/probe').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ userId: reg.body.user.id });
    }
  });

  it('has claims exactly sub/iat/exp, HS256, and the configured lifetime', async () => {
    const reg = await request(app).post(REGISTER).send({ email: freshEmail(), password: PASSWORD });
    const decoded = jwt.decode(reg.body.token, { complete: true });
    expect(decoded).not.toBeNull();
    expect(decoded?.header.alg).toBe('HS256');
    const payload = decoded?.payload as jwt.JwtPayload;
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub']);
    expect(payload.sub).toBe(String(reg.body.user.id));
    expect((payload.exp as number) - (payload.iat as number)).toBe(TEST_AUTH.jwtExpiresInSeconds);
    // Signature verifies with the configured secret.
    expect(() =>
      jwt.verify(reg.body.token, TEST_AUTH.jwtSecret, { algorithms: ['HS256'] }),
    ).not.toThrow();
  });
});

describe('real app has no test-only routes', () => {
  it('GET /api/v1/probe and /probe return 404 NOT_FOUND', async () => {
    for (const path of ['/api/v1/probe', '/probe']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
    }
  });
});

describe('log hygiene', () => {
  it('never logs the password, token, or hash through console.*', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const email = freshEmail();
    const secretPassword = 'fake-log-hygiene-password-9';

    const reg = await request(app).post(REGISTER).send({ email, password: secretPassword });
    const log = await request(app).post(LOGIN).send({ email, password: secretPassword });
    await request(app).post(LOGIN).send({ email, password: 'fake-wrong-password-9' });
    await request(app).post(REGISTER).send({ email, password: secretPassword });
    await request(app)
      .post(REGISTER)
      .type('application/json')
      .send(`{"email":"${email}","password":"${secretPassword}`);

    expect(reg.status).toBe(201);
    expect(log.status).toBe(200);

    const logged = spies
      .flatMap((s) => s.mock.calls)
      .map((args) =>
        args.map((a) => (typeof a === 'string' ? a : (JSON.stringify(a) ?? String(a)))),
      )
      .flat()
      .join('\n');
    for (const forbidden of [
      secretPassword,
      'fake-wrong-password-9',
      reg.body.token,
      log.body.token,
      '$argon2',
      TEST_AUTH.jwtSecret,
    ]) {
      expect(logged).not.toContain(forbidden);
    }
  });
});
