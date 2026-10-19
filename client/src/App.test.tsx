// Routes, guards, redirect-back, logout, and global 401 handling (S-004). api.ts is mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import * as api from './api';
import { currentLocation, renderApp } from './test/render-app';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    login: vi.fn(),
    register: vi.fn(),
    getCurrentUser: vi.fn(),
    clearSession: vi.fn(),
    onUnauthorized: vi.fn(),
    listTasks: vi.fn(),
  };
});

const ANN = { id: 1, email: 'ann@example.com' };
let unauthorizedListeners: Array<() => void> = [];

beforeEach(() => {
  vi.resetAllMocks();
  unauthorizedListeners = [];
  vi.mocked(api.getCurrentUser).mockReturnValue(null);
  vi.mocked(api.listTasks).mockResolvedValue([]);
  vi.mocked(api.onUnauthorized).mockImplementation((listener) => {
    unauthorizedListeners.push(listener);
    return () => {
      unauthorizedListeners = unauthorizedListeners.filter((l) => l !== listener);
    };
  });
});

async function logInAsAnn(user: ReturnType<typeof renderApp>['user']) {
  vi.mocked(api.login).mockResolvedValue(ANN);
  await user.type(screen.getByLabelText('Email'), ANN.email);
  await user.type(screen.getByLabelText('Password'), 'password123');
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('protected route guard', () => {
  it('redirects a visitor from / to /login and remembers where they were', () => {
    renderApp(['/']);
    expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
    const { path, state } = currentLocation();
    expect(path).toBe('/login');
    expect(state).toMatchObject({ from: { pathname: '/' } });
    expect(document.title).toBe('Log in - To-Do App');
  });

  it('renders the home page when a session exists (no login flash)', async () => {
    vi.mocked(api.getCurrentUser).mockReturnValue(ANN);
    renderApp(['/']);
    expect(screen.getByRole('heading', { level: 1, name: 'Your tasks' })).toBeInTheDocument();
    expect(screen.getByText('Signed in as ann@example.com')).toBeInTheDocument();
    expect(await screen.findByText('You have no tasks yet.')).toBeInTheDocument();
    expect(currentLocation().path).toBe('/');
    expect(document.title).toBe('Your tasks - To-Do App');
  });

  it('sends unknown paths to / and then through the guard', () => {
    renderApp(['/no-such-page']);
    expect(currentLocation().path).toBe('/login');
  });

  it('returns the user to the page they tried to open after login', async () => {
    const { user } = renderApp(['/?filter=done#top']);
    expect(currentLocation().path).toBe('/login');
    await logInAsAnn(user);
    expect(await screen.findByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();
    expect(currentLocation().path).toBe('/?filter=done#top');
  });

  it('keeps the redirect target when switching to register and back', async () => {
    const { user } = renderApp(['/?filter=done']);
    await user.click(screen.getByRole('link', { name: 'Create an account' }));
    expect(currentLocation()).toMatchObject({
      path: '/register',
      state: { from: { pathname: '/', search: '?filter=done' } },
    });
    await user.click(screen.getByRole('link', { name: 'Log in' }));
    expect(currentLocation()).toMatchObject({
      path: '/login',
      state: { from: { pathname: '/', search: '?filter=done' } },
    });
  });

  it('goes home after login when /login was opened directly', async () => {
    const { user } = renderApp(['/login']);
    await logInAsAnn(user);
    expect(await screen.findByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();
    expect(currentLocation().path).toBe('/');
  });

  it('ignores an unsafe redirect target', async () => {
    const { user } = renderApp([
      { pathname: '/login', state: { from: { pathname: '//evil.example', search: '' } } },
    ]);
    await logInAsAnn(user);
    await screen.findByRole('heading', { name: 'Your tasks' });
    expect(currentLocation().path).toBe('/');
  });
});

describe('public-only pages', () => {
  it.each(['/login', '/register'])('redirects a logged-in user from %s to home', (path) => {
    vi.mocked(api.getCurrentUser).mockReturnValue(ANN);
    renderApp([path]);
    expect(screen.getByRole('heading', { level: 1, name: 'Your tasks' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(currentLocation().path).toBe('/');
  });
});

describe('logout', () => {
  it('clears the session and returns to /login without a redirect target', async () => {
    vi.mocked(api.getCurrentUser).mockReturnValue(ANN);
    const { user } = renderApp(['/']);
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(api.clearSession).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
    expect(currentLocation()).toEqual({ path: '/login', state: null });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
  });

  it('keeps protected pages unreachable until the user logs in again', async () => {
    vi.mocked(api.getCurrentUser).mockReturnValue(ANN);
    const { user } = renderApp(['/']);
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await user.click(screen.getByRole('link', { name: 'Create an account' }));
    expect(currentLocation().path).toBe('/register');
    // Still anonymous: the register form is shown, not home.
    expect(screen.getByRole('heading', { level: 1, name: 'Create account' })).toBeInTheDocument();
  });
});

describe('global 401 (session expired)', () => {
  it('logs out, redirects to /login with the current page as target, and shows a notice', async () => {
    vi.mocked(api.getCurrentUser).mockReturnValue(ANN);
    const { user } = renderApp(['/?filter=open']);
    expect(screen.getByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();

    act(() => {
      for (const listener of unauthorizedListeners) listener();
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your session has expired. Please log in again.',
    );
    expect(currentLocation()).toMatchObject({
      path: '/login',
      state: { from: { pathname: '/', search: '?filter=open' } },
    });

    await logInAsAnn(user);
    await screen.findByRole('heading', { name: 'Your tasks' });
    expect(currentLocation().path).toBe('/?filter=open');
    await waitFor(() =>
      expect(screen.queryByText(/Your session has expired/)).not.toBeInTheDocument(),
    );
  });

  it('unsubscribes from 401 notifications on unmount', () => {
    const { unmount } = renderApp(['/login']);
    expect(unauthorizedListeners.length).toBeGreaterThan(0);
    unmount();
    expect(unauthorizedListeners).toHaveLength(0);
  });
});

describe('token handling', () => {
  it('never renders anything but the user email from the session', () => {
    vi.mocked(api.getCurrentUser).mockReturnValue({ id: 1, email: '<b>x</b>@example.com' });
    renderApp(['/']);
    // Rendered as text, not HTML.
    expect(screen.getByText('Signed in as <b>x</b>@example.com')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });
});
