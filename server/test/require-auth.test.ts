import { describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import express from 'express';
import { signToken } from '../src/auth/token.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { notFound } from '../src/middleware/not-found.js';
import { requireAuth, userIdOf } from '../src/middleware/require-auth.js';
import { TEST_AUTH } from './helpers.js';

// Probe routes exist only in this test file. Tokens are signed directly (no argon2).
const probe = express();
probe.locals.auth = TEST_AUTH;
probe.use(express.json());
probe.all('/probe', requireAuth, (req, res) => {
  res.json({ userId: userIdOf(req) });
});
probe.get('/unprotected', (req, res) => {
  res.json({ userId: userIdOf(req) });
});
probe.use(notFound);
probe.use(errorHandler);

const REQUIRED = { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };
const INVALID = { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } };

const secret = TEST_AUTH.jwtSecret;
const valid = (id = 7) => signToken(id, TEST_AUTH);
const b64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);
const get = (header?: string) => {
  const req = request(probe).get('/probe');
  return header === undefined ? req : req.set('Authorization', header);
};

describe('requireAuth accepts valid tokens', () => {
  it('valid token gives 200 with the id from sub', async () => {
    const res = await get(`Bearer ${valid(7)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 7 });
  });

  it('scheme is case-insensitive (lowercase bearer)', async () => {
    const res = await get(`bearer ${valid(8)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 8 });
  });
});

describe('requireAuth rejects a missing or malformed header: "Authentication required"', () => {
  it.each([
    ['no header', undefined],
    ['Basic scheme', 'Basic abc'],
    ['Bearer without token', 'Bearer'],
    ['Bearer with two parts', 'Bearer a b'],
    ['empty header', ''],
  ])('%s', async (_name, header) => {
    const res = await get(header);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(REQUIRED);
  });

  it('Token scheme with a valid token', async () => {
    const res = await get(`Token ${valid()}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(REQUIRED);
  });
});

describe('requireAuth rejects bad tokens: "Invalid or expired token"', () => {
  const unsigned = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({
    sub: '7',
    iat: now(),
    exp: now() + 3600,
  })}.`;

  const tokens: [string, () => string][] = [
    ['not a jwt', () => 'not-a-jwt'],
    [
      'different secret',
      () =>
        jwt.sign({}, 'another-fake-secret-0123456789abcdef-xx', { subject: '7', expiresIn: 60 }),
    ],
    [
      'alg HS384 with the right secret',
      () => jwt.sign({}, secret, { algorithm: 'HS384', subject: '7', expiresIn: 60 }),
    ],
    ['alg none (unsigned)', () => unsigned],
    ['expired', () => jwt.sign({ iat: now() - 7200, exp: now() - 3600 }, secret, { subject: '7' })],
    ['no exp', () => jwt.sign({}, secret, { subject: '7' })],
    ['no sub', () => jwt.sign({}, secret, { expiresIn: 60 })],
    ['sub "0"', () => jwt.sign({}, secret, { subject: '0', expiresIn: 60 })],
    ['sub "-3"', () => jwt.sign({}, secret, { subject: '-3', expiresIn: 60 })],
    ['sub "abc"', () => jwt.sign({}, secret, { subject: 'abc', expiresIn: 60 })],
    ['sub "1.5"', () => jwt.sign({}, secret, { subject: '1.5', expiresIn: 60 })],
    ['numeric sub 1', () => jwt.sign({ sub: 1 }, secret, { expiresIn: 60 })],
    [
      'tampered payload',
      () => {
        const [h, , s] = valid(7).split('.');
        return `${h}.${b64url({ sub: '1', iat: now(), exp: now() + 3600 })}.${s}`;
      },
    ],
  ];

  it.each(tokens)('%s', async (_name, make) => {
    const res = await get(`Bearer ${make()}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(INVALID);
  });

  it('does not echo the token or a library error in the body', async () => {
    const token = 'not-a-jwt-marker';
    const res = await get(`Bearer ${token}`);
    expect(res.text).not.toContain(token);
    expect(res.text).not.toMatch(/jwt|malformed|signature/i);
  });
});

describe('userId comes from the token only', () => {
  it('ignores userId in query and body', async () => {
    const token = valid(7);
    const viaGet = await request(probe)
      .get('/probe?userId=999')
      .set('Authorization', `Bearer ${token}`);
    expect(viaGet.body).toEqual({ userId: 7 });

    const viaPost = await request(probe)
      .post('/probe?userId=999')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 999 });
    expect(viaPost.body).toEqual({ userId: 7 });
  });

  it('does not authenticate from a query or body userId without a token', async () => {
    const res = await request(probe).post('/probe?userId=999').send({ userId: 999 });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(REQUIRED);
  });

  it('userIdOf on a route without requireAuth fails closed with 401', async () => {
    const res = await request(probe).get('/unprotected');
    expect(res.status).toBe(401);
    expect(res.body).toEqual(REQUIRED);
  });
});
