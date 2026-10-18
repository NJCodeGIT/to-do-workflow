// Login form behavior (S-004, docs/UI_SPEC.md). api.ts is mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import * as api from '../api';
import { ApiError } from '../api';
import { currentLocation, renderApp } from '../test/render-app';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    login: vi.fn(),
    register: vi.fn(),
    getCurrentUser: vi.fn(),
    clearSession: vi.fn(),
    onUnauthorized: vi.fn(),
  };
});

const ANN = { id: 1, email: 'ann@example.com' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getCurrentUser).mockReturnValue(null);
  vi.mocked(api.onUnauthorized).mockReturnValue(() => {});
});

const emailInput = () => screen.getByLabelText('Email');
const passwordInput = () => screen.getByLabelText('Password');
const submitButton = () => screen.getByRole('button', { name: /Log in|Logging in/ });

describe('LoginPage', () => {
  it('has labelled inputs with the right types and autocomplete', () => {
    renderApp(['/login']);
    expect(emailInput()).toHaveAttribute('id', 'login-email');
    expect(emailInput()).toHaveAttribute('type', 'email');
    expect(emailInput()).toHaveAttribute('autocomplete', 'email');
    expect(passwordInput()).toHaveAttribute('id', 'login-password');
    expect(passwordInput()).toHaveAttribute('type', 'password');
    expect(passwordInput()).toHaveAttribute('autocomplete', 'current-password');
    expect(document.querySelector('form')).toHaveAttribute('novalidate');
    expect(document.activeElement).toBe(document.body); // no autofocus
  });

  it('logs in with a trimmed email and the untrimmed password, then shows home', async () => {
    vi.mocked(api.login).mockResolvedValue(ANN);
    const { user } = renderApp(['/login']);
    await user.type(emailInput(), '  ann@example.com  ');
    await user.type(passwordInput(), ' pass word ');
    await user.click(submitButton());

    expect(api.login).toHaveBeenCalledExactlyOnceWith('ann@example.com', ' pass word ');
    expect(await screen.findByText('Signed in as ann@example.com')).toBeInTheDocument();
    expect(currentLocation().path).toBe('/');
  });

  it('works with the keyboard only (Tab and Enter)', async () => {
    vi.mocked(api.login).mockResolvedValue(ANN);
    const { user } = renderApp(['/login']);
    await user.tab();
    expect(emailInput()).toHaveFocus();
    await user.keyboard('ann@example.com');
    await user.tab();
    expect(passwordInput()).toHaveFocus();
    await user.keyboard('password123{Enter}');
    expect(api.login).toHaveBeenCalledExactlyOnceWith('ann@example.com', 'password123');
    expect(await screen.findByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();
  });

  it('blocks an empty submit with field errors and focuses the first invalid field', async () => {
    const { user } = renderApp(['/login']);
    await user.click(submitButton());

    expect(api.login).not.toHaveBeenCalled();
    expect(emailInput()).toHaveFocus();
    expect(emailInput()).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput()).toHaveAccessibleDescription('Enter your email address.');
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'true');
    expect(passwordInput()).toHaveAccessibleDescription('Enter your password.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('focuses the password when only the password is invalid', async () => {
    const { user } = renderApp(['/login']);
    await user.type(emailInput(), 'ann@example.com');
    await user.click(submitButton());
    expect(passwordInput()).toHaveFocus();
    expect(emailInput()).not.toHaveAttribute('aria-invalid');
  });

  it('rejects a malformed email and an over-long password', async () => {
    const { user } = renderApp(['/login']);
    await user.type(emailInput(), 'ann@example');
    await user.click(passwordInput());
    await user.paste('x'.repeat(129));
    await user.click(submitButton());
    expect(emailInput()).toHaveAccessibleDescription('Enter a valid email address.');
    expect(passwordInput()).toHaveAccessibleDescription('Password must be at most 128 characters.');
    expect(api.login).not.toHaveBeenCalled();
  });

  it('accepts a short password (no minimum on login)', async () => {
    vi.mocked(api.login).mockResolvedValue(ANN);
    const { user } = renderApp(['/login']);
    await user.type(emailInput(), 'ann@example.com');
    await user.type(passwordInput(), 'x');
    await user.click(submitButton());
    expect(api.login).toHaveBeenCalledOnce();
  });

  it('removes a field error as soon as that field is edited', async () => {
    const { user } = renderApp(['/login']);
    await user.click(submitButton());
    await user.type(emailInput(), 'a');
    expect(emailInput()).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Enter your email address.')).not.toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
  });

  it('shows one generic message on 401 and keeps the form editable', async () => {
    vi.mocked(api.login).mockRejectedValue(
      new ApiError(401, 'UNAUTHORIZED', 'Invalid email or password'),
    );
    const { user } = renderApp(['/login']);
    await user.type(emailInput(), 'ann@example.com');
    await user.type(passwordInput(), 'wrong-password');
    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid email or password.');
    expect(alert).not.toHaveTextContent(/password is wrong|unknown email|not found/i);
    expect(emailInput()).toHaveValue('ann@example.com');
    expect(passwordInput()).toHaveValue('wrong-password');
    expect(emailInput()).toHaveFocus();
    expect(submitButton()).toBeEnabled();
    expect(submitButton()).toHaveTextContent('Log in');
    expect(currentLocation().path).toBe('/login');
  });

  it.each([
    [
      'a 400 with the server message',
      new ApiError(400, 'VALIDATION_ERROR', 'email must be a valid email address'),
      'email must be a valid email address',
    ],
    [
      'a network failure',
      new ApiError(0, 'NETWORK_ERROR'),
      'Could not reach the server. Check your connection and try again.',
    ],
    [
      'a 500',
      new ApiError(500, 'INTERNAL_ERROR', 'Internal server error'),
      'Something went wrong. Please try again.',
    ],
    ['an unknown error', new Error('boom'), 'Something went wrong. Please try again.'],
  ])('shows the right form-level message for %s', async (_name, error, message) => {
    vi.mocked(api.login).mockRejectedValue(error);
    const { user } = renderApp(['/login']);
    await user.type(emailInput(), 'ann@example.com');
    await user.type(passwordInput(), 'password123');
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(submitButton()).toBeEnabled();
    await user.type(passwordInput(), '4');
    expect(passwordInput()).toHaveValue('password1234');
  });

  it('clears the form-level error on the next submit', async () => {
    vi.mocked(api.login)
      .mockRejectedValueOnce(new ApiError(401, 'UNAUTHORIZED', 'x'))
      .mockReturnValueOnce(new Promise(() => {}));
    const { user } = renderApp(['/login']);
    await user.type(emailInput(), 'ann@example.com');
    await user.type(passwordInput(), 'password123');
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.click(submitButton());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables the button while sending and sends only once on double submit', async () => {
    let resolveLogin: (user: api.User) => void = () => {};
    vi.mocked(api.login).mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );
    const { user } = renderApp(['/login']);
    await user.type(emailInput(), 'ann@example.com');
    await user.type(passwordInput(), 'password123');
    await user.click(submitButton());

    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveTextContent('Logging in...');
    expect(emailInput()).toBeEnabled();
    await user.type(passwordInput(), '{Enter}');
    await user.click(submitButton());
    expect(api.login).toHaveBeenCalledTimes(1);

    resolveLogin(ANN);
    expect(await screen.findByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();
  });

  it('does not show the session-expired notice on a normal visit', () => {
    renderApp(['/login']);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
