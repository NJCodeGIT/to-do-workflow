// Cloudflare Worker for the deployed client (docs/CICD.md "API reachability", decision #43).
// `assets.run_worker_first: ["/api/*"]` in wrangler.jsonc sends only /api/* here; the Worker
// forwards it unchanged to API_ORIGIN (the API on Render) so the SPA stays same-origin (#14).
// Everything else is served by the static assets binding. Never logs headers, tokens, or bodies.
// Minimal inline types instead of @cloudflare/workers-types (no new dependency).

export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  ASSETS: AssetsBinding;
  /** API origin only, e.g. https://todo-api.onrender.com (no path). Set in wrangler.jsonc `vars`. */
  API_ORIGIN?: string;
}

// RFC 9110 section 7.6.1 connection-specific headers, plus `host` (set from the target URL).
const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

function stripHopByHop(source: Headers, extra: string[] = []): Headers {
  const headers = new Headers(source);
  // Headers named in `Connection` are hop-by-hop too.
  const listed = (source.get('connection') ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== '');
  for (const name of [...HOP_BY_HOP, ...listed, ...extra]) headers.delete(name);
  return headers;
}

function badGateway(message: string): Response {
  return new Response(JSON.stringify({ error: { code: 'BAD_GATEWAY', message } }), {
    status: 502,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Parses API_ORIGIN; returns null if unset or not an absolute http(s) URL. */
function parseOrigin(value: string | undefined): URL | null {
  if (!value || value.trim() === '') return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

export function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

export async function proxyToApi(request: Request, env: Env): Promise<Response> {
  const origin = parseOrigin(env.API_ORIGIN);
  if (!origin) return badGateway('API is not configured');

  const incoming = new URL(request.url);
  // Path and query kept as-is (/api/v1/...); only the origin changes.
  const target = new URL(incoming.pathname + incoming.search, origin.origin);

  const method = request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  let upstream: Response;
  try {
    // Body is buffered: API bodies are small JSON, and this avoids streaming-body (`duplex`)
    // differences between runtimes. No timeout on purpose: a sleeping Render free instance
    // can take 30-60 s to wake up, and the Workers runtime does not cap wall-clock wait time.
    upstream = await fetch(target.toString(), {
      method,
      headers: stripHopByHop(request.headers, ['host']),
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
    });
  } catch {
    // Do not log the error: it could include request details.
    return badGateway('API is unreachable');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: stripHopByHop(upstream.headers),
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (isApiPath(new URL(request.url).pathname)) return proxyToApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
