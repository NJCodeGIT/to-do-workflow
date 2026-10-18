// Client-side form checks (UX only; the server's zod schemas decide). Rules and messages:
// docs/UI_SPEC.md "Client validation", decision #31.

/**
 * Copy of zod's default `z.email()` pattern, which the server uses (`server/src/schemas.ts`).
 * Source: node_modules/zod/v4/core/regexes.js, `export const email`, zod 4.6.7.
 * If zod changes it, the server's 400 message is still shown (drift is a UX issue only).
 */
export const EMAIL_PATTERN =
  // eslint-disable-next-line no-useless-escape -- kept byte-for-byte identical to zod's source
  /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

const EMAIL_MAX = 254;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

export type FieldErrors = { email?: string; password?: string };

function validateEmail(email: string): string | undefined {
  const value = email.trim();
  if (value === '') return 'Enter your email address.';
  if (value.length > EMAIL_MAX) return `Email must be at most ${EMAIL_MAX} characters.`;
  if (!EMAIL_PATTERN.test(value)) return 'Enter a valid email address.';
  return undefined;
}

function withoutEmpty(errors: FieldErrors): FieldErrors {
  const result: FieldErrors = {};
  if (errors.email !== undefined) result.email = errors.email;
  if (errors.password !== undefined) result.password = errors.password;
  return result;
}

/** Login: any non-empty password up to 128 characters (no minimum, decision #19). */
export function validateLogin(email: string, password: string): FieldErrors {
  let passwordError: string | undefined;
  if (password === '') passwordError = 'Enter your password.';
  else if (password.length > PASSWORD_MAX)
    passwordError = `Password must be at most ${PASSWORD_MAX} characters.`;
  return withoutEmpty({ email: validateEmail(email), password: passwordError });
}

/** Register: password 8-128 characters, not trimmed. */
export function validateRegister(email: string, password: string): FieldErrors {
  let passwordError: string | undefined;
  if (password === '') passwordError = 'Enter a password.';
  else if (password.length < PASSWORD_MIN)
    passwordError = `Password must be at least ${PASSWORD_MIN} characters.`;
  else if (password.length > PASSWORD_MAX)
    passwordError = `Password must be at most ${PASSWORD_MAX} characters.`;
  return withoutEmpty({ email: validateEmail(email), password: passwordError });
}
