// Maps a failed login/register call to the form-level message (docs/UI_SPEC.md
// "Server and network errors", decision #31).
import { ApiError } from '../api';

export type AuthForm = 'login' | 'register';

/** `loginLink`: render a "Log in instead?" link after the message (register 409 only). */
export type FormError = { message: string; loginLink: boolean };

export const NETWORK_MESSAGE = 'Could not reach the server. Check your connection and try again.';
export const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';
export const EMAIL_TAKEN_MESSAGE = 'This email is already registered.';

export function formErrorMessage(error: unknown, form: AuthForm): FormError {
  const plain = (message: string): FormError => ({ message, loginLink: false });
  if (!(error instanceof ApiError)) return plain(GENERIC_MESSAGE);
  if (error.status === 0) return plain(NETWORK_MESSAGE);
  if (form === 'login' && error.status === 401 && error.code === 'UNAUTHORIZED') {
    return plain(INVALID_CREDENTIALS_MESSAGE);
  }
  if (form === 'register' && error.status === 409 && error.code === 'EMAIL_TAKEN') {
    return { message: EMAIL_TAKEN_MESSAGE, loginLink: true };
  }
  // 400 messages are fixed server strings that never echo input, so they are safe to show.
  if (error.status === 400 && error.code === 'VALIDATION_ERROR' && error.message !== '') {
    return plain(error.message);
  }
  return plain(GENERIC_MESSAGE);
}
