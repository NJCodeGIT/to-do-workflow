import { z } from 'zod';
import { AppError } from './errors.js';

const BODY_MESSAGE = 'Request body must be a JSON object';

function requiredString(field: string) {
  return z.string({
    error: (iss) =>
      iss.input === undefined ? `${field} is required` : `${field} must be a string`,
  });
}

// Trim and lowercase run before the length and format checks.
const emailSchema = requiredString('email')
  .trim()
  .toLowerCase()
  .max(254, { error: 'email must be at most 254 characters' })
  .pipe(z.email({ error: 'email must be a valid email address' }));

const PASSWORD_MAX = { error: 'password must be at most 128 characters' };

export const registerSchema = z.object(
  {
    email: emailSchema,
    password: requiredString('password')
      .min(8, { error: 'password must be at least 8 characters' })
      .max(128, PASSWORD_MAX),
  },
  { error: BODY_MESSAGE },
);

export const loginSchema = z.object(
  {
    email: emailSchema,
    password: requiredString('password')
      .min(1, { error: 'password is required' })
      .max(128, PASSWORD_MAX),
  },
  { error: BODY_MESSAGE },
);

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;

/** Parses `body` or throws 400 VALIDATION_ERROR with the first issue's message. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'Invalid request body';
    throw new AppError('VALIDATION_ERROR', 400, message);
  }
  return result.data;
}
