// Register form behavior (S-004, docs/UI_SPEC.md). api.ts is mocked.
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
const submitButton = () => screen.getByRole('button', { name: /Create account|Creating account/ });

async function fillValid(user: ReturnType<typeof renderApp>['user']) {
  await user.type(emailInput(), 'ann@example.com');
  await user.type(passwordInput(), 'password123');
}

describe('RegisterPage', () => {
  it('has labelled inputs, the password hint, and the page title', () => {
    renderApp(['/register']);
    expect(screen.getByRole('heading', { level: 1, name: 'Create account' })).toBeInTheDocument();
    expect(document.title).toBe('Create account - To-Do App');
    expect(emailInput()).toHaveAttribute('id', 'register-email');
    expect(passwordInput()).toHaveAttribute('id', 'register-password');
    expect(passwordInput()).toHaveAttribute('autocomplete', 'new-password');
    expect(passwordInput()).toHaveAccessibleDescription('At least 8 characters.');
  });

  it('registers, logs in, and shows home', async () => {
    vi.mocked(api.register).mockResolvedValue(ANN);
    const { user } = renderApp(['/register']);
    await user.type(emailInput(), ' ann@example.com ');
    await user.type(passwordInput(), 'password123');
    await user.click(submitButton());

    expect(api.register).toHaveBeenCalledExactlyOnceWith('ann@example.com', 'password123');
    expect(await screen.findByText('Signed in as ann@example.com')).toBeInTheDocument();
    expect(currentLocation().path).toBe('/');
  });

  it('returns to the remembered page after registering', async () => {
    vi.mocked(api.register).mockResolvedValue(ANN);
    const { user } = renderApp([
      { pathname: '/register', state: { from: { pathname: '/', search: '?filter=done' } } },
    ]);
    await fillValid(user);
    await user.click(submitButton());
    await screen.findByRole('heading', { name: 'Your tasks' });
    expect(currentLocation().path).toBe('/?filter=done');
  });

  it('blocks a short password with a message and focuses it', async () => {
    const { user } = renderApp(['/register']);
    await user.type(emailInput(), 'ann@example.com');
    await user.type(passwordInput(), 'short');
    await user.click(submitButton());

    expect(api.register).not.toHaveBeenCalled();
    expect(passwordInput()).toHaveFocus();
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'true');
    expect(passwordInput()).toHaveAttribute(
      'aria-describedby',
      'register-password-hint register-password-error',
    );
    expect(passwordInput()).toHaveAccessibleDescription(
      'At least 8 characters. Password must be at least 8 characters.',
    );
  });

  it('blocks an empty form and focuses the email first', async () => {
    const { user } = renderApp(['/register']);
    await user.click(submitButton());
    expect(api.register).not.toHaveBeenCalled();
    expect(emailInput()).toHaveFocus();
    expect(emailInput()).toHaveAccessibleDescription('Enter your email address.');
    expect(screen.getByText('Enter a password.')).toBeInTheDocument();
  });

  it('blocks an invalid email', async () => {
    const { user } = renderApp(['/register']);
    await user.type(emailInput(), 'not-an-email');
    await user.type(passwordInput(), 'password123');
    await user.click(submitButton());
    expect(api.register).not.toHaveBeenCalled();
    expect(emailInput()).toHaveAccessibleDescription('Enter a valid email address.');
  });

  it('shows "already registered" with a link to log in on 409', async () => {
    vi.mocked(api.register).mockRejectedValue(
      new ApiError(409, 'EMAIL_TAKEN', 'Email is already registered'),
    );
    const { user } = renderApp([
      { pathname: '/register', state: { from: { pathname: '/', search: '?x=1' } } },
    ]);
    await fillValid(user);
    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This email is already registered.');
    expect(emailInput()).toHaveFocus();
    expect(emailInput()).toHaveValue('ann@example.com');
    expect(submitButton()).toBeEnabled();

    await user.click(screen.getByRole('link', { name: 'Log in instead?' }));
    expect(currentLocation()).toMatchObject({
      path: '/login',
      state: { from: { pathname: '/', search: '?x=1' } },
    });
  });

  it.each([
    [
      'a 400 with the server message',
      new ApiError(400, 'VALIDATION_ERROR', 'password must be at least 8 characters'),
      'password must be at least 8 characters',
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
    [
      'an unexpected 401',
      new ApiError(401, 'UNAUTHORIZED', 'x'),
      'Something went wrong. Please try again.',
    ],
  ])('shows the right form-level message for %s', async (_name, error, message) => {
    vi.mocked(api.register).mockRejectedValue(error);
    const { user } = renderApp(['/register']);
    await fillValid(user);
    await user.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(screen.queryByRole('link', { name: 'Log in instead?' })).not.toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
    expect(passwordInput()).toHaveValue('password123');
  });

  it('disables the button while sending and sends only once on double submit', async () => {
    vi.mocked(api.register).mockReturnValue(new Promise(() => {}));
    const { user } = renderApp(['/register']);
    await fillValid(user);
    await user.click(submitButton());
    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveTextContent('Creating account...');
    await user.type(emailInput(), '{Enter}');
    expect(api.register).toHaveBeenCalledTimes(1);
  });

  it('works with the keyboard only', async () => {
    vi.mocked(api.register).mockResolvedValue(ANN);
    const { user } = renderApp(['/register']);
    await user.tab();
    await user.keyboard('ann@example.com');
    await user.tab();
    await user.keyboard('password123{Enter}');
    expect(api.register).toHaveBeenCalledOnce();
    expect(await screen.findByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();
  });
});
