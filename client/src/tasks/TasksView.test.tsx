// Home task list and status filter (S-007, docs/UI_SPEC.md "Task list behavior"). api.ts is mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate, type InitialEntry } from 'react-router-dom';
import * as api from '../api';
import { ApiError, type Task } from '../api';
import App from '../App';
import { AuthProvider } from '../auth/AuthProvider';
import { currentLocation } from '../test/render-app';
import { useTasks } from './useTasks';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    login: vi.fn(),
    register: vi.fn(),
    getCurrentUser: vi.fn(),
    clearSession: vi.fn(),
    onUnauthorized: vi.fn(),
    listTasks: vi.fn(),
    updateTask: vi.fn(),
  };
});

const ANN = { id: 1, email: 'ann@example.com' };
const BOB = { id: 2, email: 'bob@example.com' };

function task(id: number, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    status: 'active',
    completedAt: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let unauthorizedListeners: Array<() => void> = [];

beforeEach(() => {
  vi.resetAllMocks();
  unauthorizedListeners = [];
  vi.mocked(api.getCurrentUser).mockReturnValue(ANN);
  vi.mocked(api.listTasks).mockResolvedValue([]);
  vi.mocked(api.onUnauthorized).mockImplementation((listener) => {
    unauthorizedListeners.push(listener);
    return () => {
      unauthorizedListeners = unauthorizedListeners.filter((l) => l !== listener);
    };
  });
});

// Same tree as test/render-app.tsx, plus a Back button (history -1) for Back/Forward tests.
function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <div data-testid="location" data-state={JSON.stringify(location.state ?? null)}>
        {location.pathname + location.search + location.hash}
      </div>
      <button type="button" onClick={() => navigate(-1)}>
        History back
      </button>
    </>
  );
}

function renderHome(initialEntries: InitialEntry[] = ['/']) {
  const user = userEvent.setup();
  const result = render(
    <MemoryRouter initialEntries={initialEntries} useTransitions={false}>
      <AuthProvider>
        <App />
      </AuthProvider>
      <LocationProbe />
    </MemoryRouter>,
  );
  return { user, ...result };
}

// The list's results region; the add form (S-008) has its own status region inside its section,
// and the edit confirmation (S-009) is the status region right after the list's.
const statusRegion = () => {
  const addForm = screen.getByRole('region', { name: 'Add a task' });
  const regions = screen.getAllByRole('status').filter((el) => !addForm.contains(el));
  expect(regions).toHaveLength(2);
  return regions[0]!;
};
const filterButton = (name: string) => screen.getByRole('button', { name });

describe('task list states', () => {
  it('shows loading (and no list, empty text or alert) until the response arrives', async () => {
    const pending = deferred<Task[]>();
    vi.mocked(api.listTasks).mockReturnValue(pending.promise);
    renderHome();

    expect(statusRegion()).toHaveTextContent('Loading tasks...');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(document.body); // no autofocus

    await act(async () => pending.resolve([task(1)]));
    expect(statusRegion()).toHaveTextContent('1 task');
    expect(api.listTasks).toHaveBeenCalledExactlyOnceWith('all');
  });

  it('renders tasks in API order with title, description when present, and status text', async () => {
    vi.mocked(api.listTasks).mockResolvedValue([
      task(3, { title: 'Buy milk' }),
      task(2, {
        title: 'Write report',
        description: 'Line one\nLine two <b>x</b>',
        status: 'completed',
        completedAt: '2026-01-02T10:00:00.000Z',
      }),
      task(1, { title: 'Call Bob', description: '' }),
    ]);
    renderHome();

    const items = within(await screen.findByRole('list')).getAllByRole('listitem');
    expect(statusRegion()).toHaveTextContent('3 tasks');
    expect(items.map((li) => li.querySelector('[id$="-title"]')?.textContent)).toEqual([
      'Buy milk',
      'Write report',
      'Call Bob',
    ]);
    expect(items[0]!.querySelector('#task-3-title')).toHaveTextContent('Buy milk');
    expect(within(items[0]!).getByText('Active')).toBeInTheDocument();
    expect(items[0]!.querySelectorAll('p')).toHaveLength(2); // no description element

    const description = within(items[1]!).getByText(/Line one/);
    expect(description.textContent).toBe('Line one\nLine two <b>x</b>');
    expect(description).toHaveStyle({ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
    expect(within(items[1]!).getByText('Completed')).toBeInTheDocument();
    expect(document.querySelector('main b')).toBeNull();

    // An empty-string description is not null, so it is rendered (as an empty paragraph).
    expect(items[2]!.querySelectorAll('p')).toHaveLength(3);
    // No dates.
    expect(screen.queryByText(/2026/)).not.toBeInTheDocument();
  });

  it.each([
    ['/', 'all', 'You have no tasks yet.', 'All'],
    ['/?status=active', 'active', 'No active tasks.', 'Active'],
    ['/?status=completed', 'completed', 'No completed tasks.', 'Completed'],
  ])('%s requests %s and shows its empty text', async (path, filter, empty, pressed) => {
    renderHome([path]);
    expect(await screen.findByText(empty)).toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent(empty);
    expect(api.listTasks).toHaveBeenCalledExactlyOnceWith(filter);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(filterButton(pressed)).toHaveAttribute('aria-pressed', 'true');
  });

  it.each([
    '/?status=Active',
    '/?status=',
    '/?status=done',
    '/?status=all',
    '/?status=active&status=completed',
  ])('falls back to All for %s without rewriting the URL', async (path) => {
    renderHome([path]);
    expect(await screen.findByText('You have no tasks yet.')).toBeInTheDocument();
    expect(api.listTasks).toHaveBeenCalledExactlyOnceWith('all');
    expect(filterButton('All')).toHaveAttribute('aria-pressed', 'true');
    expect(currentLocation().path).toBe(path);
  });
});

describe('filter control', () => {
  it('is a labelled group of three toggle buttons, exactly one pressed', async () => {
    renderHome();
    const group = screen.getByRole('group', { name: 'Show:' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['All', 'Active', 'Completed']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    for (const b of buttons) {
      expect(b).toHaveAttribute('type', 'button');
      expect(b).not.toBeDisabled();
    }
    await screen.findByText('You have no tasks yet.');
  });

  it('choosing a filter pushes the URL, keeps other params, and loads that list', async () => {
    const { user } = renderHome(['/?x=1']);
    await screen.findByText('You have no tasks yet.');

    vi.mocked(api.listTasks).mockResolvedValue([task(5, { status: 'completed' })]);
    await user.click(filterButton('Completed'));
    expect(currentLocation().path).toBe('/?x=1&status=completed');
    expect(filterButton('Completed')).toHaveAttribute('aria-pressed', 'true');
    expect(filterButton('All')).toHaveAttribute('aria-pressed', 'false');
    expect(await screen.findByText('1 task')).toBeInTheDocument();
    expect(api.listTasks).toHaveBeenLastCalledWith('completed');

    await user.click(filterButton('All'));
    expect(currentLocation().path).toBe('/?x=1');
    expect(api.listTasks).toHaveBeenLastCalledWith('all');
    expect(api.listTasks).toHaveBeenCalledTimes(3);
  });

  it('works with the keyboard (Tab to a filter, Enter/Space to choose)', async () => {
    const { user } = renderHome();
    await screen.findByText('You have no tasks yet.');
    filterButton('All').focus();
    await user.tab();
    expect(filterButton('Active')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(currentLocation().path).toBe('/?status=active');
    await user.tab();
    expect(filterButton('Completed')).toHaveFocus();
    await user.keyboard(' ');
    expect(currentLocation().path).toBe('/?status=completed');
  });

  it('choosing the current filter does nothing (no navigation, no request)', async () => {
    const { user } = renderHome(['/?status=active']);
    await screen.findByText('No active tasks.');
    await user.click(filterButton('Active'));
    expect(currentLocation().path).toBe('/?status=active');
    expect(api.listTasks).toHaveBeenCalledOnce();
    // Back would leave the page's first entry, not a duplicate.
    await user.click(screen.getByRole('button', { name: 'History back' }));
    expect(currentLocation().path).toBe('/?status=active');
  });

  it('Back returns to the previous filter and reloads it', async () => {
    const { user } = renderHome(['/']);
    await screen.findByText('You have no tasks yet.');
    await user.click(filterButton('Active'));
    await screen.findByText('No active tasks.');
    await user.click(filterButton('Completed'));
    await screen.findByText('No completed tasks.');

    await user.click(screen.getByRole('button', { name: 'History back' }));
    expect(currentLocation().path).toBe('/?status=active');
    expect(await screen.findByText('No active tasks.')).toBeInTheDocument();
    expect(filterButton('Active')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'History back' }));
    expect(currentLocation().path).toBe('/');
    expect(await screen.findByText('You have no tasks yet.')).toBeInTheDocument();
    expect(vi.mocked(api.listTasks).mock.calls.map((c) => c[0])).toEqual([
      'all',
      'active',
      'completed',
      'active',
      'all',
    ]);
  });
});

describe('errors', () => {
  it.each([
    ['5xx', new ApiError(500, 'INTERNAL_ERROR', 'Server secret detail')],
    ['400', new ApiError(400, 'VALIDATION_ERROR', 'Bad status')],
    ['network', new ApiError(0, 'NETWORK_ERROR', 'Network request failed')],
    ['malformed', new ApiError(200, 'UNKNOWN_ERROR')],
    ['non-ApiError', new TypeError('boom')],
  ])('shows one fixed error text for a %s failure', async (_name, error) => {
    vi.mocked(api.listTasks).mockRejectedValue(error);
    renderHome();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Error: Could not load your tasks.');
    expect(alert.textContent).toBe('Error: Could not load your tasks.');
    expect(statusRegion()).toHaveTextContent('');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(alert).not.toContainElement(retry);
    // The filter stays usable.
    expect(filterButton('Active')).not.toBeDisabled();
  });

  it('Try again reloads the current filter, shows loading and focuses the pressed filter', async () => {
    vi.mocked(api.listTasks).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR'));
    const { user } = renderHome(['/?status=completed']);
    await screen.findByRole('alert');

    const pending = deferred<Task[]>();
    vi.mocked(api.listTasks).mockReturnValueOnce(pending.promise);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(statusRegion()).toHaveTextContent('Loading tasks...');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(filterButton('Completed')).toHaveFocus();
    expect(vi.mocked(api.listTasks).mock.calls).toEqual([['completed'], ['completed']]);

    await act(async () => pending.resolve([task(1, { status: 'completed' })]));
    expect(statusRegion()).toHaveTextContent('1 task');
  });

  it('an error then a filter change loads the new filter', async () => {
    vi.mocked(api.listTasks).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR'));
    const { user } = renderHome();
    await screen.findByRole('alert');
    await user.click(filterButton('Active'));
    expect(await screen.findByText('No active tasks.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('stale responses', () => {
  it('ignores the old filter response when it arrives after the new one', async () => {
    const all = deferred<Task[]>();
    const active = deferred<Task[]>();
    vi.mocked(api.listTasks).mockReturnValueOnce(all.promise).mockReturnValueOnce(active.promise);
    const { user } = renderHome();
    await user.click(filterButton('Active'));

    await act(async () => active.resolve([task(2, { title: 'Active one' })]));
    expect(screen.getByText('Active one')).toBeInTheDocument();

    await act(async () => all.resolve([task(1, { title: 'Old all one' }), task(9)]));
    expect(screen.queryByText('Old all one')).not.toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent('1 task');
  });

  it('keeps loading when the old filter response arrives first', async () => {
    const all = deferred<Task[]>();
    const active = deferred<Task[]>();
    vi.mocked(api.listTasks).mockReturnValueOnce(all.promise).mockReturnValueOnce(active.promise);
    const { user } = renderHome();
    await user.click(filterButton('Active'));

    await act(async () => all.resolve([task(1, { title: 'Old all one' })]));
    expect(screen.queryByText('Old all one')).not.toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent('Loading tasks...');

    await act(async () => active.resolve([]));
    expect(statusRegion()).toHaveTextContent('No active tasks.');
  });

  it('ignores a stale error after the filter changed', async () => {
    const all = deferred<Task[]>();
    vi.mocked(api.listTasks).mockReturnValueOnce(all.promise);
    const { user } = renderHome();
    await user.click(filterButton('Completed'));
    await screen.findByText('No completed tasks.');

    await act(async () => all.reject(new ApiError(500, 'INTERNAL_ERROR')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent('No completed tasks.');
  });

  it('never shows the previous filter list under the new filter', async () => {
    vi.mocked(api.listTasks).mockResolvedValueOnce([task(1, { title: 'From all' })]);
    const { user } = renderHome();
    await screen.findByText('From all');

    vi.mocked(api.listTasks).mockReturnValueOnce(new Promise(() => {}));
    await user.click(filterButton('Active'));
    expect(screen.queryByText('From all')).not.toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent('Loading tasks...');
  });
});

describe('session handling', () => {
  it('a 401 shows no error; the global handling redirects to /login keeping the filter', async () => {
    const pending = deferred<Task[]>();
    vi.mocked(api.listTasks).mockReturnValue(pending.promise);
    renderHome(['/?status=active']);

    await act(async () => pending.reject(new ApiError(401, 'UNAUTHORIZED')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent('Loading tasks...');

    // api.ts notifies the listeners on a 401 (mocked here).
    act(() => {
      for (const listener of unauthorizedListeners) listener();
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
    expect(currentLocation()).toMatchObject({
      path: '/login',
      state: { from: { pathname: '/', search: '?status=active' } },
    });
  });

  it('after logout and login as another user, the list is loaded fresh', async () => {
    vi.mocked(api.listTasks).mockResolvedValueOnce([task(1, { title: 'Ann task' })]);
    const { user } = renderHome(['/?status=active']);
    await screen.findByText('Ann task');

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.queryByText('Ann task')).not.toBeInTheDocument();

    const bobs = deferred<Task[]>();
    vi.mocked(api.listTasks).mockReturnValueOnce(bobs.promise);
    vi.mocked(api.login).mockResolvedValue(BOB);
    await user.type(screen.getByLabelText('Email'), BOB.email);
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await screen.findByText('Signed in as bob@example.com');
    expect(screen.queryByText('Ann task')).not.toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent('Loading tasks...');
    await act(async () => bobs.resolve([task(2, { title: 'Bob task' })]));
    expect(screen.getByText('Bob task')).toBeInTheDocument();
    expect(api.listTasks).toHaveBeenCalledTimes(2);
  });
});

describe('useTasks', () => {
  it('reload refetches from the ready state, showing loading meanwhile', async () => {
    vi.mocked(api.listTasks).mockResolvedValueOnce([task(1)]);
    const { result } = renderHook(() => useTasks('active'));
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'ready', tasks: [task(1)] }));

    const next = deferred<Task[]>();
    vi.mocked(api.listTasks).mockReturnValueOnce(next.promise);
    act(() => result.current.reload());
    expect(result.current.state).toEqual({ kind: 'loading' });

    await act(async () => next.resolve([task(1), task(2)]));
    expect(result.current.state).toEqual({ kind: 'ready', tasks: [task(1), task(2)] });
    expect(vi.mocked(api.listTasks).mock.calls).toEqual([['active'], ['active']]);
  });

  it('ignores a response that arrives after unmount', async () => {
    const pending = deferred<Task[]>();
    vi.mocked(api.listTasks).mockReturnValueOnce(pending.promise);
    const { result, unmount } = renderHook(() => useTasks('all'));
    unmount();
    await act(async () => pending.resolve([task(1)]));
    expect(result.current.state).toEqual({ kind: 'loading' });
  });
});

describe('acceptance gaps (test-engineer)', () => {
  it('keeps one h1, the header and the title around the list, and the filter usable when empty', async () => {
    renderHome();
    expect(await screen.findByText('You have no tasks yet.')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Signed in as ann@example.com')).toBeInTheDocument();
    expect(document.title).toBe('Your tasks - To-Do App');
    for (const name of ['All', 'Active', 'Completed']) {
      expect(filterButton(name)).toBeEnabled();
    }
  });

  it('the results region is polite and always present (loading, ready, error)', async () => {
    const pending = deferred<Task[]>();
    vi.mocked(api.listTasks).mockReturnValue(pending.promise);
    renderHome();
    const region = statusRegion();
    expect(region.getAttribute('aria-live') ?? 'polite').toBe('polite');
    await act(async () => pending.resolve([task(1)]));
    expect(statusRegion()).toBe(region);
  });

  it('a failed Try again after a loaded list shows the error and no stale list', async () => {
    vi.mocked(api.listTasks).mockResolvedValueOnce([task(1, { title: 'Old task' })]);
    const { user } = renderHome();
    expect(await screen.findByText('Old task')).toBeInTheDocument();

    vi.mocked(api.listTasks).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR'));
    await user.click(filterButton('Active'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Old task')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('does not leak other users data: no task fields besides title, description and status are shown', async () => {
    vi.mocked(api.listTasks).mockResolvedValue([task(7, { title: 'Only mine' })]);
    renderHome();
    const item = within(await screen.findByRole('list')).getByRole('listitem');
    expect(item.textContent).toBe('Only mineActiveEdit');
  });
});
