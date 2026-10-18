// api.ts with a stubbed fetch and a cleared localStorage (docs/CONVENTIONS.md).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Api = typeof import('./api');
const KEY = 'todo.session';
const ANN = { id: 1, email: 'ann@example.com' };

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Fresh module per test: the session is cached in a module variable.
async function loadApi(): Promise<Api> {
  vi.resetModules();
  return import('./api');
}

function storeSession(token: string, user: unknown = ANN) {
  localStorage.setItem(KEY, JSON.stringify({ token, user }));
}

function sentHeaders(call = 0): Record<string, string> {
  return (fetchMock.mock.calls[call]?.[1]?.headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('session', () => {
  it('stores the session on login and returns the user without the token', async () => {
    const api = await loadApi();
    fetchMock.mockResolvedValue(jsonResponse(200, { user: ANN, token: 'tok-1' }));
    const user = await api.login('ann@example.com', 'password123');

    expect(user).toEqual(ANN);
    expect(JSON.stringify(user)).not.toContain('tok-1');
    expect(api.getCurrentUser()).toEqual(ANN);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ token: 'tok-1', user: ANN });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/auth/login');
    expect(init?.method).toBe('POST');
    expect(sentHeaders()).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual({
      email: 'ann@example.com',
      password: 'password123',
    });
  });

  it('register posts to /auth/register and stores the session', async () => {
    const api = await loadApi();
    fetchMock.mockResolvedValue(jsonResponse(201, { user: ANN, token: 'tok-r' }));
    await expect(api.register('ann@example.com', 'password123')).resolves.toEqual(ANN);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/auth/register');
    expect(api.getCurrentUser()).toEqual(ANN);
  });

  it('reads a stored session on start', async () => {
    storeSession('tok-1');
    const api = await loadApi();
    expect(api.getCurrentUser()).toEqual(ANN);
  });

  it.each([
    ['not json', '{oops'],
    ['empty token', JSON.stringify({ token: '', user: ANN })],
    ['wrong user shape', JSON.stringify({ token: 't', user: { id: '1', email: 'a' } })],
    ['null', 'null'],
  ])('removes a malformed stored value (%s)', async (_name, raw) => {
    localStorage.setItem(KEY, raw);
    const api = await loadApi();
    expect(api.getCurrentUser()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('clearSession removes the stored session', async () => {
    storeSession('tok-1');
    const api = await loadApi();
    api.clearSession();
    expect(api.getCurrentUser()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('keeps working in memory when storage throws', async () => {
    const api = await loadApi();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    fetchMock.mockResolvedValue(jsonResponse(200, { user: ANN, token: 'tok-1' }));
    await expect(api.login('ann@example.com', 'pw')).resolves.toEqual(ANN);
    spy.mockRestore();
    expect(api.getCurrentUser()).toEqual(ANN);
    expect(localStorage.getItem(KEY)).toBeNull();

    // The in-memory token is used for later authenticated requests.
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await expect(api.apiRequest('/tasks')).resolves.toEqual({ ok: true });
    expect(sentHeaders(1)).toEqual({ Authorization: 'Bearer tok-1' });
  });

  it('rejects a malformed success response with UNKNOWN_ERROR and stores nothing', async () => {
    const api = await loadApi();
    fetchMock.mockResolvedValue(jsonResponse(200, { user: ANN }));
    await expect(api.login('ann@example.com', 'pw')).rejects.toMatchObject({
      status: 200,
      code: 'UNKNOWN_ERROR',
    });
    expect(api.getCurrentUser()).toBeNull();
  });
});

describe('apiRequest', () => {
  it('sends the bearer token on authenticated requests', async () => {
    storeSession('tok-1');
    const api = await loadApi();
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await expect(api.apiRequest('/tasks')).resolves.toEqual({ ok: true });
    expect(sentHeaders()).toEqual({ Authorization: 'Bearer tok-1' });
  });

  it('returns undefined for 204', async () => {
    storeSession('tok-1');
    const api = await loadApi();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.apiRequest('/tasks/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('does not send an authenticated request without a session, and notifies', async () => {
    const api = await loadApi();
    const listener = vi.fn();
    api.onUnauthorized(listener);
    await expect(api.apiRequest('/tasks')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('clears the session and notifies on a 401 for an authenticated request', async () => {
    storeSession('tok-1');
    const api = await loadApi();
    const listener = vi.fn();
    const unsubscribe = api.onUnauthorized(listener);
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } }),
    );
    const error = await api.apiRequest('/tasks').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(api.ApiError);
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(String((error as Error).message)).not.toContain('tok-1');
    expect(api.getCurrentUser()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    await api.apiRequest('/tasks').catch(() => {});
    expect(listener).toHaveBeenCalledOnce();
  });

  it('neither clears a newer session nor notifies when a stale request gets 401', async () => {
    storeSession('old-token');
    const api = await loadApi();
    const listener = vi.fn();
    api.onUnauthorized(listener);
    let respond: (res: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const stale = api.apiRequest('/tasks').catch((e: unknown) => e);

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: ANN, token: 'new-token' }));
    await api.login('ann@example.com', 'pw');
    respond(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }));

    // The stale request still rejects; only the session handling is skipped.
    await expect(stale).resolves.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(listener).not.toHaveBeenCalled();
    expect(api.getCurrentUser()).toEqual(ANN);
    expect(JSON.parse(localStorage.getItem(KEY)!).token).toBe('new-token');
  });

  it('does not notify when a request gets 401 after the user already logged out', async () => {
    storeSession('tok-1');
    const api = await loadApi();
    const listener = vi.fn();
    api.onUnauthorized(listener);
    let respond: (res: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const stale = api.apiRequest('/tasks').catch((e: unknown) => e);

    api.clearSession();
    respond(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }));

    await expect(stale).resolves.toMatchObject({ status: 401 });
    expect(listener).not.toHaveBeenCalled();
    expect(api.getCurrentUser()).toBeNull();
  });

  it.each([
    [401, 'UNAUTHORIZED'],
    [409, 'EMAIL_TAKEN'],
  ])('login/register %i neither clears the session nor notifies', async (status, code) => {
    storeSession('tok-1');
    const api = await loadApi();
    const listener = vi.fn();
    api.onUnauthorized(listener);
    fetchMock.mockResolvedValue(jsonResponse(status, { error: { code, message: 'm' } }));
    const fn = status === 401 ? api.login : api.register;
    await expect(fn('ann@example.com', 'pw')).rejects.toMatchObject({ status, code, message: 'm' });
    expect(listener).not.toHaveBeenCalled();
    expect(api.getCurrentUser()).toEqual(ANN);
  });

  it('maps a rejected fetch to status 0 NETWORK_ERROR', async () => {
    const api = await loadApi();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.login('ann@example.com', 'pw')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });

  it.each([
    ['non-JSON body', new Response('<html>Bad gateway</html>', { status: 502 })],
    ['JSON without error shape', jsonResponse(500, { message: 'oops' })],
  ])('maps an error with a %s to UNKNOWN_ERROR', async (_name, res) => {
    const api = await loadApi();
    fetchMock.mockResolvedValue(res);
    await expect(api.getHealth()).rejects.toMatchObject({
      status: res.status,
      code: 'UNKNOWN_ERROR',
    });
  });

  it('maps a 2xx with an unparseable body to UNKNOWN_ERROR', async () => {
    const api = await loadApi();
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));
    await expect(api.getHealth()).rejects.toMatchObject({ status: 200, code: 'UNKNOWN_ERROR' });
  });

  it('getHealth calls the public health endpoint without a token', async () => {
    storeSession('tok-1');
    const api = await loadApi();
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 'ok' }));
    await expect(api.getHealth()).resolves.toEqual({ status: 'ok' });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/health');
    expect(sentHeaders()).toEqual({});
  });
});
