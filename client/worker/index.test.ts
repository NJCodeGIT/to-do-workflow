// @vitest-environment node
// Worker proxy tests: Node's Request/Response/fetch stand in for the Workers runtime; fetch and
// the ASSETS binding are stubs, so no network is used.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';

const ORIGIN = 'https://todo-api.example.com';
const SITE = 'https://todo-client.example.workers.dev';

const fetchMock = vi.fn<typeof fetch>();
const assetsFetch = vi.fn<(request: Request) => Promise<Response>>();

function makeEnv(...args: [apiOrigin?: string | undefined]): Env {
  // An explicit `undefined` argument means "unset", unlike a default parameter.
  const env: Env = { ASSETS: { fetch: assetsFetch } };
  if (args.length === 0) env.API_ORIGIN = ORIGIN;
  else if (args[0] !== undefined) env.API_ORIGIN = args[0];
  return env;
}

/** The URL and init the Worker passed to the upstream fetch. */
function upstreamCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error('upstream fetch was not called');
  return { url: String(call[0]), init: call[1] ?? {} };
}

beforeEach(() => {
  fetchMock.mockReset();
  assetsFetch.mockReset();
  assetsFetch.mockResolvedValue(new Response('<!doctype html>', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('worker /api proxy', () => {
  it('forwards method, path, query, body, and Authorization to API_ORIGIN', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const body = JSON.stringify({ title: 'Buy milk' });
    const request = new Request(`${SITE}/api/v1/tasks/7?status=active&x=a%20b`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer secret-token',
        'Content-Type': 'application/json',
        Connection: 'keep-alive, X-Hop',
        'X-Hop': 'drop-me',
        'Keep-Alive': 'timeout=5',
      },
      body,
    });

    await worker.fetch(request, makeEnv());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = upstreamCall();
    expect(url).toBe(`${ORIGIN}/api/v1/tasks/7?status=active&x=a%20b`);
    expect(init.method).toBe('PATCH');
    expect(init.redirect).toBe('manual');
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(body);
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer secret-token');
    expect(headers.get('content-type')).toBe('application/json');
    // Hop-by-hop headers, including ones named in Connection, are stripped.
    expect(headers.has('connection')).toBe(false);
    expect(headers.has('keep-alive')).toBe(false);
    expect(headers.has('x-hop')).toBe(false);
    expect(headers.has('host')).toBe(false);
    expect(assetsFetch).not.toHaveBeenCalled();
  });

  it('sends no body for GET and ignores a path or trailing slash in API_ORIGIN', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    await worker.fetch(new Request(`${SITE}/api/v1/health`), makeEnv(`${ORIGIN}/ignored/`));

    const { url, init } = upstreamCall();
    expect(url).toBe(`${ORIGIN}/api/v1/health`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('passes the upstream status, headers, and body through unchanged', async () => {
    const errorBody = { error: { code: 'NOT_FOUND', message: 'Task not found' } };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(errorBody), {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'abc' },
      }),
    );

    const res = await worker.fetch(new Request(`${SITE}/api/v1/tasks/99`), makeEnv());

    expect(res.status).toBe(404);
    expect(res.statusText).toBe('Not Found');
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('x-request-id')).toBe('abc');
    expect(await res.json()).toEqual(errorBody);
  });

  it('passes a 201 JSON body through', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res = await worker.fetch(
      new Request(`${SITE}/api/v1/tasks`, { method: 'POST', body: '{"title":"a"}' }),
      makeEnv(),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 1 });
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['not a URL', 'todo-api.onrender.com'],
    ['not http(s)', 'ftp://todo-api.example.com'],
  ])('returns a JSON 502 when API_ORIGIN is %s', async (_label, apiOrigin) => {
    const res = await worker.fetch(new Request(`${SITE}/api/v1/health`), makeEnv(apiOrigin));

    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({
      error: { code: 'BAD_GATEWAY', message: 'API is not configured' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(assetsFetch).not.toHaveBeenCalled();
  });

  it('returns a JSON 502 when the upstream fetch fails, without logging', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const res = await worker.fetch(
      new Request(`${SITE}/api/v1/auth/login`, {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token' },
        body: '{"email":"a@example.com","password":"hunter22hunter22"}',
      }),
      makeEnv(),
    );

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: { code: 'BAD_GATEWAY', message: 'API is unreachable' },
    });
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});

describe('worker static assets', () => {
  it.each(['/', '/login', '/assets/index.js', '/api', '/apix/v1'])(
    'sends %s to the ASSETS binding',
    async (path) => {
      const request = new Request(`${SITE}${path}`);

      const res = await worker.fetch(request, makeEnv());

      expect(assetsFetch).toHaveBeenCalledTimes(1);
      expect(assetsFetch.mock.calls[0]?.[0]).toBe(request);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('<!doctype html>');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
