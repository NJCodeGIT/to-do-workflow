// Pure helpers: validation table, error mapping, redirect target (docs/UI_SPEC.md).
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import { formErrorMessage } from './error-messages';
import { redirectTarget } from './redirect';
import { EMAIL_PATTERN, validateLogin, validateRegister } from './validation';

describe('validation', () => {
  const longEmail = `${'a'.repeat(243)}@example.com`; // 255 chars

  it.each([
    ['', 'Enter your email address.'],
    ['   ', 'Enter your email address.'],
    [longEmail, 'Email must be at most 254 characters.'],
    ['ann', 'Enter a valid email address.'],
    ['ann@example', 'Enter a valid email address.'],
    ['.ann@example.com', 'Enter a valid email address.'],
    ['an..n@example.com', 'Enter a valid email address.'],
  ])('email %j -> %s', (email, message) => {
    expect(validateLogin(email, 'x').email).toBe(message);
    expect(validateRegister(email, 'password123').email).toBe(message);
  });

  it('accepts valid emails (trim applied)', () => {
    expect(validateLogin(' ann.b+tag@mail.example.com ', 'x')).toEqual({});
    expect(EMAIL_PATTERN.test("o'brien@example.co")).toBe(true);
  });

  it.each([
    ['', 'Enter your password.'],
    ['x'.repeat(129), 'Password must be at most 128 characters.'],
  ])('login password of length %#', (password, message) => {
    expect(validateLogin('ann@example.com', password).password).toBe(message);
  });

  it('login accepts 1 and 128 character passwords', () => {
    expect(validateLogin('ann@example.com', 'x')).toEqual({});
    expect(validateLogin('ann@example.com', 'x'.repeat(128))).toEqual({});
  });

  it.each([
    ['', 'Enter a password.'],
    ['1234567', 'Password must be at least 8 characters.'],
    ['x'.repeat(129), 'Password must be at most 128 characters.'],
  ])('register password case %#', (password, message) => {
    expect(validateRegister('ann@example.com', password).password).toBe(message);
  });

  it('register accepts 8 and 128 characters and does not trim the password', () => {
    expect(validateRegister('ann@example.com', '12345678')).toEqual({});
    expect(validateRegister('ann@example.com', 'x'.repeat(128))).toEqual({});
    expect(validateRegister('ann@example.com', '   1234 ')).toEqual({});
  });
});

describe('formErrorMessage', () => {
  it('maps login and register results', () => {
    const r401 = new ApiError(401, 'UNAUTHORIZED', 'Invalid email or password');
    const r409 = new ApiError(409, 'EMAIL_TAKEN', 'Email is already registered');
    expect(formErrorMessage(r401, 'login')).toEqual({
      message: 'Invalid email or password.',
      loginLink: false,
    });
    expect(formErrorMessage(r409, 'register')).toEqual({
      message: 'This email is already registered.',
      loginLink: true,
    });
    expect(formErrorMessage(r409, 'login').message).toBe('Something went wrong. Please try again.');
    expect(formErrorMessage(new ApiError(400, 'UNKNOWN_ERROR'), 'login').message).toBe(
      'Something went wrong. Please try again.',
    );
    expect(formErrorMessage(new ApiError(503, 'UNKNOWN_ERROR'), 'register').message).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('redirectTarget', () => {
  it.each([
    [undefined, '/'],
    [null, '/'],
    ['/tasks', '/'],
    [{}, '/'],
    [{ from: '/tasks' }, '/'],
    [{ from: { pathname: 42 } }, '/'],
    [{ from: { pathname: 'tasks' } }, '/'],
    [{ from: { pathname: '//evil.example' } }, '/'],
    [{ from: { pathname: '/\\evil.example' } }, '/'],
    [{ from: { pathname: '/login' } }, '/'],
    [{ from: { pathname: '/register' } }, '/'],
    [{ from: { pathname: '/' } }, '/'],
    [{ from: { pathname: '/tasks/5', search: '?a=1', hash: '#x' } }, '/tasks/5?a=1#x'],
    [{ from: { pathname: '/tasks', search: 7 } }, '/tasks'],
  ])('%j -> %s', (state, target) => {
    expect(redirectTarget(state)).toBe(target);
  });
});
