import type { Request, Response } from 'express';
import { dbFrom } from '../db/connection.js';
import { createUser, findUserByEmail } from '../db/users.js';
import { AppError } from '../errors.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../auth/password.js';
import { authConfigFrom, signToken } from '../auth/token.js';
import { loginSchema, parseBody, registerSchema } from '../schemas.js';

// One construction for both login failures so the bodies are identical.
function invalidCredentials(): AppError {
  return new AppError('UNAUTHORIZED', 401, 'Invalid email or password');
}

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password } = parseBody(registerSchema, req.body);
  const passwordHash = await hashPassword(password);
  const user = createUser(dbFrom(req), { email, passwordHash });
  const token = signToken(user.id, authConfigFrom(req));
  res.status(201).json({ user: { id: user.id, email: user.email }, token });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = parseBody(loginSchema, req.body);
  const user = findUserByEmail(dbFrom(req), email);
  if (!user) {
    await verifyAgainstDummy(password);
    throw invalidCredentials();
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    throw invalidCredentials();
  }
  const token = signToken(user.id, authConfigFrom(req));
  res.status(200).json({ user: { id: user.id, email: user.email }, token });
}
