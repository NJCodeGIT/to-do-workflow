// The only module allowed to call fetch or touch the stored session (CLAUDE.md architecture
// rule, decisions #26, #29, #30). The token never leaves this module and is never logged.
const API_BASE = '/api/v1';
const SESSION_KEY = 'todo.session';
const GENERIC_MESSAGE = 'Request failed';

export type User = { id: number; email: string };

type Session = { token: string; user: User };

export class ApiError extends Error {
  /** HTTP status; 0 = network failure (fetch rejected). */
  readonly status: number;
  /** Server `error.code`, or `NETWORK_ERROR` / `UNKNOWN_ERROR`. */
  readonly code: string;

  constructor(status: number, code: string, message: string = GENERIC_MESSAGE) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// --- Session -----------------------------------------------------------------------------

// undefined = not loaded from storage yet; null = no session.
let session: Session | null | undefined;

function isUser(value: unknown): value is User {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'number' && typeof v.email === 'string';
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.token === 'string' && v.token !== '' && isUser(v.user);
}

function removeStoredSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage unavailable: nothing to remove.
  }
}

function loadSession(): Session | null {
  if (session !== undefined) return session;
  let raw: string | null;
  try {
    raw = localStorage.getItem(SESSION_KEY);
  } catch {
    raw = null;
  }
  session = null;
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isSession(parsed)) {
        session = { token: parsed.token, user: { id: parsed.user.id, email: parsed.user.email } };
      }
    } catch {
      // Malformed JSON: treated as no session below.
    }
    if (session === null) removeStoredSession();
  }
  return session;
}

function saveSession(next: Session): void {
  session = next;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the in-memory session still works until reload.
  }
}

/** The signed-in user from the stored session, or null. Never exposes the token. */
export function getCurrentUser(): User | null {
  const current = loadSession();
  return current ? { id: current.user.id, email: current.user.email } : null;
}

export function clearSession(): void {
  session = null;
  removeStoredSession();
}

// --- Unauthorized listeners ----------------------------------------------------------------

const unauthorizedListeners = new Set<() => void>();

/** Called after an authenticated request gets 401. Returns an unsubscribe function. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function notifyUnauthorized(): void {
  for (const listener of [...unauthorizedListeners]) listener();
}

// --- Requests -----------------------------------------------------------------------------

type RequestOptions = { method?: string; body?: unknown; auth?: boolean };

async function readJson(res: Response): Promise<unknown> {
  try {
    return (await res.json()) as unknown;
  } catch {
    return undefined;
  }
}

function errorFromBody(status: number, body: unknown): ApiError {
  if (typeof body === 'object' && body !== null) {
    const error = (body as Record<string, unknown>).error;
    if (typeof error === 'object' && error !== null) {
      const { code, message } = error as Record<string, unknown>;
      if (typeof code === 'string' && typeof message === 'string') {
        return new ApiError(status, code, message);
      }
    }
  }
  return new ApiError(status, 'UNKNOWN_ERROR');
}

/**
 * Sends a JSON request to `/api/v1<path>`. `auth` defaults to true: the bearer token is added,
 * and a 401 clears the session and notifies `onUnauthorized` listeners, but only if the stored
 * session is still the one the request sent (a stale 401 is ignored apart from the throw).
 * Resolves to the parsed JSON body, or undefined for 204.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await send(path, options)).data as T;
}

async function send(
  path: string,
  options: RequestOptions,
): Promise<{ status: number; data: unknown }> {
  const { method = 'GET', body, auth = true } = options;
  const headers: Record<string, string> = {};
  let sentToken: string | null = null;

  if (auth) {
    const current = loadSession();
    if (!current) {
      notifyUnauthorized();
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
    }
    sentToken = current.token;
    headers.Authorization = `Bearer ${sentToken}`;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed');
  }

  if (!res.ok) {
    const error = errorFromBody(res.status, await readJson(res));
    if (auth && res.status === 401) {
      // Only clear the session this request used, and only then notify: a stale 401 (the
      // session changed while the request was in flight) must not log out a newer session.
      if (loadSession()?.token === sentToken) {
        clearSession();
        notifyUnauthorized();
      }
    }
    throw error;
  }

  if (res.status === 204) return { status: res.status, data: undefined };
  const data = await readJson(res);
  if (data === undefined) throw new ApiError(res.status, 'UNKNOWN_ERROR');
  return { status: res.status, data };
}

// --- Endpoints ----------------------------------------------------------------------------

async function authenticate(
  path: '/auth/login' | '/auth/register',
  email: string,
  password: string,
): Promise<User> {
  const { status, data } = await send(path, {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
  if (!isSession(data)) throw new ApiError(status, 'UNKNOWN_ERROR');
  const stored: Session = { token: data.token, user: { id: data.user.id, email: data.user.email } };
  saveSession(stored);
  return { id: stored.user.id, email: stored.user.email };
}

/** POST /auth/login. Stores the session and returns the user. */
export function login(email: string, password: string): Promise<User> {
  return authenticate('/auth/login', email, password);
}

/** POST /auth/register. Stores the session (registering logs in) and returns the user. */
export function register(email: string, password: string): Promise<User> {
  return authenticate('/auth/register', email, password);
}

// --- Tasks (S-007, decisions #46, #47) -------------------------------------------------------

export type TaskStatus = 'active' | 'completed';
export type TaskFilter = TaskStatus | 'all';
export type Task = {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function isTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'number' &&
    typeof v.title === 'string' &&
    (typeof v.description === 'string' || v.description === null) &&
    (v.status === 'active' || v.status === 'completed') &&
    (typeof v.completedAt === 'string' || v.completedAt === null) &&
    typeof v.createdAt === 'string' &&
    typeof v.updatedAt === 'string'
  );
}

/** Copies exactly the seven API keys, so unexpected fields never reach the UI. */
function toTask(t: Task): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/**
 * GET /tasks?status=<filter> (always explicit). Authenticated, so a 401 goes through the global
 * handling (#30). A malformed body throws `ApiError(status, 'UNKNOWN_ERROR')`.
 */
export async function listTasks(filter: TaskFilter): Promise<Task[]> {
  const { status, data } = await send(`/tasks?status=${filter}`, {});
  const tasks =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>).tasks : undefined;
  if (!Array.isArray(tasks) || !tasks.every(isTask)) throw new ApiError(status, 'UNKNOWN_ERROR');
  return tasks.map(toTask);
}

/**
 * POST /tasks (S-008, decision #51). Sends `{ title }` or `{ title, description }`: the
 * `description` key is absent when `input.description` is undefined. Authenticated, so a 401
 * goes through the global handling (#30). A malformed body throws
 * `ApiError(status, 'UNKNOWN_ERROR')`.
 */
export async function createTask(input: { title: string; description?: string }): Promise<Task> {
  const body: { title: string; description?: string } = { title: input.title };
  if (input.description !== undefined) body.description = input.description;
  const { status, data } = await send('/tasks', { method: 'POST', body });
  if (!isTask(data)) throw new ApiError(status, 'UNKNOWN_ERROR');
  return toTask(data);
}

/**
 * Fields a PATCH may change: `title`/`description` from the edit form (S-009, #55; `null` clears
 * the description) or `status` from the complete/reopen toggle (S-010, #60).
 */
export type TaskPatch = { title?: string; description?: string | null; status?: TaskStatus };

/**
 * PATCH /tasks/:id (S-009 #55, S-010 #60). Sends only the keys of `patch` that are not undefined
 * (`description: null` is kept). Authenticated, so a 401 goes through the global handling (#30).
 * A malformed body throws `ApiError(status, 'UNKNOWN_ERROR')`.
 */
export async function updateTask(id: number, patch: TaskPatch): Promise<Task> {
  const body: TaskPatch = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.status !== undefined) body.status = patch.status;
  const { status, data } = await send(`/tasks/${id}`, { method: 'PATCH', body });
  if (!isTask(data)) throw new ApiError(status, 'UNKNOWN_ERROR');
  return toTask(data);
}

/**
 * DELETE /tasks/:id (S-010, decision #60). No request body. Authenticated, so a 401 goes through
 * the global handling (#30). Success is only `204`; any other 2xx throws
 * `ApiError(status, 'UNKNOWN_ERROR')`. Errors are mapped by the shared `send`.
 */
export async function deleteTask(id: number): Promise<void> {
  const { status } = await send(`/tasks/${id}`, { method: 'DELETE' });
  if (status !== 204) throw new ApiError(status, 'UNKNOWN_ERROR');
}

export function getHealth(): Promise<{ status: string }> {
  return apiRequest<{ status: string }>('/health', { auth: false });
}
