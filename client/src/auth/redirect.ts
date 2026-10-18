// Where PublicOnly sends a user who just logged in (docs/UI_SPEC.md "Routes", decision #28).
// `from` comes from router state set by RequireAuth; it is restricted to same-app paths so it
// can never become an open redirect.

const AUTH_PAGES = new Set(['/login', '/register']);

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function redirectTarget(state: unknown): string {
  if (typeof state !== 'object' || state === null) return '/';
  const from: unknown = (state as Record<string, unknown>).from;
  if (typeof from !== 'object' || from === null) return '/';
  const { pathname, search, hash } = from as Record<string, unknown>;
  if (typeof pathname !== 'string') return '/';
  // `/\` is rejected too: URL parsing treats a backslash like `/`, so it would mean `//`.
  if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.startsWith('/\\')) {
    return '/';
  }
  if (AUTH_PAGES.has(pathname)) return '/';
  return pathname + asString(search) + asString(hash);
}
