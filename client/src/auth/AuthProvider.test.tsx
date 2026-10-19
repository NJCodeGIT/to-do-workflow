// AuthProvider wired to the real api.ts (only fetch is stubbed): a 401 logs the UI out only when
// it belongs to the current session; a stale 401 from an earlier session is ignored.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import * as api from '../api';
import { currentLocation, renderApp } from '../test/render-app';

const ANN = { id: 1, email: 'ann@example.com' };
const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const UNAUTHORIZED = { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } };

async function logIn(user: ReturnType<typeof renderApp>['user'], token: string) {
  fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: ANN, token }));
  await user.type(screen.getByLabelText('Email'), ANN.email);
  await user.type(screen.getByLabelText('Password'), 'password123');
  await user.click(screen.getByRole('button', { name: 'Log in' }));
  await screen.findByRole('heading', { level: 1, name: 'Your tasks' });
}

/** Starts an authenticated request whose response is held until `respond` is called. */
function pendingRequest() {
  let respond: (res: Response) => void = () => {};
  fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
  const result = api.apiRequest('/tasks').catch((e: unknown) => e);
  return { respond, result };
}

beforeEach(() => {
  localStorage.clear();
  api.clearSession();
  fetchMock.mockReset();
  // Default for requests not queued with *Once (the home page's task list, S-007).
  fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, { tasks: [] })));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthProvider with the real api module', () => {
  it('a 401 for the current session logs out and shows the session-expired notice', async () => {
    const { user } = renderApp(['/login']);
    await logIn(user, 'tok-1');

    const request = pendingRequest();
    await act(async () => {
      request.respond(jsonResponse(401, UNAUTHORIZED));
      await request.result;
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your session has expired. Please log in again.',
    );
    expect(localStorage.getItem('todo.session')).toBeNull();
  });

  it('a stale 401 from before a re-login does not log the UI out', async () => {
    const { user } = renderApp(['/login']);
    await logIn(user, 'old-token');
    const stale = pendingRequest();

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await logIn(user, 'new-token');

    await act(async () => {
      stale.respond(jsonResponse(401, UNAUTHORIZED));
      await stale.result;
    });

    expect(await stale.result).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(screen.getByRole('heading', { level: 1, name: 'Your tasks' })).toBeInTheDocument();
    expect(screen.getByText('Signed in as ann@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/Your session has expired/)).not.toBeInTheDocument();
    expect(currentLocation().path).toBe('/');
    expect(JSON.parse(localStorage.getItem('todo.session')!).token).toBe('new-token');
  });
});
