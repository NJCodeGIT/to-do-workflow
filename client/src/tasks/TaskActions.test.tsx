// Complete, reopen and delete in the task list (S-010, docs/UI_SPEC.md "Complete, reopen and
// delete (S-010)", decisions #58-#62). api.ts is mocked with a small in-memory "server" so a
// reload shows the result of the mutation; the whole app is rendered.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate, type InitialEntry } from 'react-router-dom';
import * as api from '../api';
import { ApiError, type Task, type TaskFilter } from '../api';
import App from '../App';
import { AuthProvider } from '../auth/AuthProvider';
import { GENERIC_MESSAGE, NETWORK_MESSAGE } from '../auth/error-messages';
import { currentLocation } from '../test/render-app';
import { EMPTY_MESSAGES, LOAD_ERROR_MESSAGE } from './task-filter';
import { TASK_GONE_MESSAGE } from './task-form';

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
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  };
});

const ANN = { id: 1, email: 'ann@example.com' };

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

function done(id: number, overrides: Partial<Task> = {}): Task {
  return task(id, { status: 'completed', completedAt: '2026-01-02T10:00:00.000Z', ...overrides });
}

function deferred<T = void>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// The fake server. Every listTasks answer is a NEW array of copies (like the real api.ts).
let store: Task[] = [];

function seedServer(...tasks: Task[]) {
  store = tasks.map((t) => ({ ...t }));
  vi.mocked(api.listTasks).mockImplementation(async (filter: TaskFilter) =>
    store.filter((t) => filter === 'all' || t.status === filter).map((t) => ({ ...t })),
  );
  vi.mocked(api.updateTask).mockImplementation(async (id, patch) => {
    const found = store.find((t) => t.id === id);
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'Task not found');
    if (patch.status !== undefined) found.status = patch.status;
    return { ...found };
  });
  vi.mocked(api.deleteTask).mockImplementation(async (id) => {
    if (!store.some((t) => t.id === id)) throw new ApiError(404, 'NOT_FOUND', 'Task not found');
    store = store.filter((t) => t.id !== id);
  });
}

let unauthorizedListeners: Array<() => void> = [];

beforeEach(() => {
  vi.resetAllMocks();
  unauthorizedListeners = [];
  vi.mocked(api.getCurrentUser).mockReturnValue(ANN);
  vi.mocked(api.createTask).mockResolvedValue(task(99));
  vi.mocked(api.onUnauthorized).mockImplementation((listener) => {
    unauthorizedListeners.push(listener);
    return () => {
      unauthorizedListeners = unauthorizedListeners.filter((l) => l !== listener);
    };
  });
  seedServer();
});

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <div data-testid="location" data-state={JSON.stringify(location.state ?? null)}>
        {location.pathname + location.search + location.hash}
      </div>
      <button type="button" onClick={() => void navigate(-1)}>
        history-back
      </button>
      <button type="button" onClick={() => void navigate(1)}>
        history-forward
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

/** Start the fake server with these tasks, render, and wait until the first title is shown. */
async function renderList(tasks: Task[], initialEntries?: InitialEntry[]) {
  seedServer(...tasks);
  const view = renderHome(initialEntries);
  await screen.findByText(tasks[0]!.title);
  return view;
}

const toggleButton = (title: string, verb: 'Complete' | 'Reopen' = 'Complete') =>
  screen.getByRole('button', { name: `${verb} ${title}` });
const editButton = (title: string) => screen.getByRole('button', { name: `Edit ${title}` });
const deleteButton = (title: string) => screen.getByRole('button', { name: `Delete ${title}` });
const prompt = () => screen.getByRole('group', { name: 'Confirm delete' });
const queryPrompt = () => screen.queryByRole('group', { name: 'Confirm delete' });
const confirmButton = () =>
  within(prompt()).getByRole('button', { name: /^(Delete|Deleting\.\.\.)$/ });
const cancelButton = () => within(prompt()).getByRole('button', { name: 'Cancel' });
const filterButton = (name: string) => screen.getByRole('button', { name });
const addSection = () => screen.getByRole('region', { name: 'Add a task' });
const outsideRegions = () =>
  screen.getAllByRole('status').filter((el) => !addSection().contains(el));
// Region order outside the add form: list results, edit confirmation, action confirmation.
const actionStatus = () => {
  const regions = outsideRegions();
  expect(regions).toHaveLength(3);
  return regions[2]!;
};
const item = (title: string) => screen.getByText(title).closest('li')!;
const alertText = () => screen.queryByRole('alert')?.textContent ?? null;
// The list is not "Loading tasks..." any more (the focus effect has run by then).
const listSettled = () =>
  waitFor(() => expect(outsideRegions()[0]).not.toHaveTextContent('Loading tasks...'));
const listCalls = () => vi.mocked(api.listTasks).mock.calls.length;
const buttonLabels = () => within(screen.getByRole('list')).getAllByRole('button');

const NO_LONGER_EXISTS = `Error: ${TASK_GONE_MESSAGE}`;

describe('Complete / Reopen button', () => {
  it('shows Complete on Active and Reopen on Completed items with id, type and aria-labelledby', async () => {
    await renderList([task(1, { title: 'Buy milk' }), done(2, { title: 'Call Bob' })]);
    const complete = toggleButton('Buy milk');
    expect(complete).toHaveTextContent(/^Complete$/);
    expect(complete).toHaveAttribute('type', 'button');
    expect(complete).toHaveAttribute('id', 'task-1-toggle');
    expect(complete).toHaveAttribute('aria-labelledby', 'task-1-toggle task-1-title');
    const reopen = toggleButton('Call Bob', 'Reopen');
    expect(reopen).toHaveTextContent(/^Reopen$/);
    expect(reopen).toHaveAttribute('id', 'task-2-toggle');
    expect(screen.queryByRole('button', { name: 'Complete Call Bob' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reopen Buy milk' })).not.toBeInTheDocument();
  });

  it('every item has the buttons toggle, Edit, Delete in that order, none with a tabIndex', async () => {
    await renderList([task(1), done(2)]);
    for (const li of within(screen.getByRole('list')).getAllByRole('listitem')) {
      const buttons = within(li).getAllByRole('button');
      expect(buttons.map((b) => b.id.replace(/^task-\d+-/, ''))).toEqual([
        'toggle',
        'edit',
        'delete',
      ]);
      for (const b of buttons) expect(b).not.toHaveAttribute('tabindex');
    }
    expect(deleteButton('Task 1')).toHaveAttribute('id', 'task-1-delete');
    expect(deleteButton('Task 2')).toHaveAttribute('aria-labelledby', 'task-2-delete task-2-title');
  });

  it('sends exactly { status: "completed" } for an Active task and { status: "active" } for a Completed one', async () => {
    const { user } = await renderList([task(1), done(2)]);
    await user.click(toggleButton('Task 1'));
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledTimes(1));
    expect(api.updateTask).toHaveBeenLastCalledWith(1, { status: 'completed' });
    await user.click(await screen.findByRole('button', { name: 'Reopen Task 2' }));
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledTimes(2));
    expect(api.updateTask).toHaveBeenLastCalledWith(2, { status: 'active' });
    expect(api.deleteTask).not.toHaveBeenCalled();
  });

  it('works by keyboard: Enter and Space on the focused button', async () => {
    const { user } = await renderList([task(1, { title: 'Buy milk' })]);
    toggleButton('Buy milk').focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('button', { name: 'Reopen Buy milk' });
    expect(toggleButton('Buy milk', 'Reopen')).toHaveFocus();
    await user.keyboard(' ');
    await screen.findByRole('button', { name: 'Complete Buy milk' });
    expect(api.updateTask).toHaveBeenNthCalledWith(1, 1, { status: 'completed' });
    expect(api.updateTask).toHaveBeenNthCalledWith(2, 1, { status: 'active' });
  });
});

describe('complete / reopen success', () => {
  it('All: the item stays in API order with the new status text and label, focus on its toggle', async () => {
    const { user } = await renderList([task(1), task(2), task(3)]);
    await user.click(toggleButton('Task 2'));

    await screen.findByRole('button', { name: 'Reopen Task 2' });
    expect(listCalls()).toBe(2);
    const titles = within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((li) => li.querySelector('p')!.textContent);
    expect(titles).toEqual(['Task 1', 'Task 2', 'Task 3']);
    expect(within(item('Task 2')).getByText('Completed')).toBeInTheDocument();
    expect(within(item('Task 1')).getByText('Active')).toBeInTheDocument();
    expect(actionStatus()).toHaveTextContent(/^Task completed\.$/);
    expect(toggleButton('Task 2', 'Reopen')).toHaveFocus();
    expect(toggleButton('Task 2', 'Reopen')).toBeEnabled();
    expect(alertText()).toBeNull();
    expect(currentLocation().path).toBe('/');
  });

  it('All: reopening says "Task reopened." and focuses the relabelled toggle', async () => {
    const { user } = await renderList([done(1)]);
    await user.click(toggleButton('Task 1', 'Reopen'));
    await screen.findByRole('button', { name: 'Complete Task 1' });
    expect(actionStatus()).toHaveTextContent(/^Task reopened\.$/);
    expect(toggleButton('Task 1')).toHaveFocus();
    expect(within(item('Task 1')).getByText('Active')).toBeInTheDocument();
  });

  it('Active: a completed task disappears, the note is added, focus goes to the pressed filter, URL unchanged', async () => {
    const { user } = await renderList([task(1), task(2)], ['/?status=active']);
    await user.click(toggleButton('Task 1'));

    await waitFor(() => expect(screen.queryByText('Task 1')).not.toBeInTheDocument());

    await listSettled();
    expect(screen.getByText('Task 2')).toBeInTheDocument();
    expect(actionStatus()).toHaveTextContent(
      /^Task completed\. It is no longer shown under Active\.$/,
    );
    expect(filterButton('Active')).toHaveFocus();
    expect(filterButton('Active')).toHaveAttribute('aria-pressed', 'true');
    expect(currentLocation().path).toBe('/?status=active');
    expect(api.listTasks).toHaveBeenLastCalledWith('active');
  });

  it('Completed: a reopened task disappears with the note and focus on the pressed filter', async () => {
    const { user } = await renderList([done(1), done(2)], ['/?status=completed']);
    await user.click(toggleButton('Task 1', 'Reopen'));

    await waitFor(() => expect(screen.queryByText('Task 1')).not.toBeInTheDocument());

    await listSettled();
    expect(actionStatus()).toHaveTextContent(
      /^Task reopened\. It is no longer shown under Completed\.$/,
    );
    expect(filterButton('Completed')).toHaveFocus();
    expect(currentLocation().path).toBe('/?status=completed');
  });

  it('Active: completing the last task shows the empty message and the filter focus', async () => {
    const { user } = await renderList([task(1)], ['/?status=active']);
    await user.click(toggleButton('Task 1'));
    await waitFor(() => expect(screen.queryByText('Task 1')).not.toBeInTheDocument());
    await listSettled();
    expect(filterButton('Active')).toHaveFocus();
    expect(outsideRegions()[0]).toHaveTextContent(EMPTY_MESSAGES.active);
  });

  it('does not pull focus back when the user moved it during the refetch', async () => {
    const pending = deferred<Task>();
    const { user } = await renderList([task(1)]);
    vi.mocked(api.updateTask).mockImplementation(() => pending.promise);
    await user.click(toggleButton('Task 1'));
    const addTitle = within(addSection()).getByLabelText('Title');
    await user.click(addTitle);
    expect(addTitle).toHaveFocus();
    store[0]!.status = 'completed';
    await act(async () => pending.resolve(done(1)));
    await screen.findByRole('button', { name: 'Reopen Task 1' });
    expect(addTitle).toHaveFocus();
    expect(actionStatus()).toHaveTextContent('Task completed.');
  });

  it('clears the message when a new action starts, so a repeat is announced again', async () => {
    const { user } = await renderList([task(1)]);
    await user.click(toggleButton('Task 1'));
    await screen.findByRole('button', { name: 'Reopen Task 1' });
    expect(actionStatus()).toHaveTextContent(/^Task completed\.$/);

    const pending = deferred<Task>();
    vi.mocked(api.updateTask).mockImplementationOnce(() => pending.promise);
    await user.click(toggleButton('Task 1', 'Reopen'));
    expect(actionStatus()).toBeEmptyDOMElement();
    store[0]!.status = 'active';
    await act(async () => pending.resolve(task(1)));
    await screen.findByRole('button', { name: 'Complete Task 1' });
    expect(actionStatus()).toHaveTextContent(/^Task reopened\.$/);
  });

  it('keeps the action region separate from the list count and edit regions', async () => {
    const { user } = await renderList([task(1)]);
    await user.click(toggleButton('Task 1'));
    await screen.findByRole('button', { name: 'Reopen Task 1' });
    const [count, edit, action] = outsideRegions();
    expect(count).toHaveTextContent('1 task');
    expect(edit).toBeEmptyDOMElement();
    expect(action).toHaveTextContent('Task completed.');
  });

  it('Edit still works after Complete and after Reopen (completed items are editable)', async () => {
    const { user } = await renderList([task(1, { title: 'Buy milk' })]);
    await user.click(toggleButton('Buy milk'));
    await screen.findByRole('button', { name: 'Reopen Buy milk' });
    await user.click(editButton('Buy milk'));
    expect(
      within(screen.getByRole('form', { name: 'Edit task' })).getByLabelText('Title'),
    ).toHaveValue('Buy milk');
    await user.click(
      within(screen.getByRole('form', { name: 'Edit task' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await user.click(toggleButton('Buy milk', 'Reopen'));
    await screen.findByRole('button', { name: 'Complete Buy milk' });
    await user.click(editButton('Buy milk'));
    expect(screen.getByRole('form', { name: 'Edit task' })).toBeInTheDocument();
  });
});

describe('in-flight guard', () => {
  it('disables every item button while a toggle is in flight, shows "Completing...", sends one request', async () => {
    const pending = deferred<Task>();
    const { user } = await renderList([task(1), task(2)]);
    vi.mocked(api.updateTask).mockImplementation(() => pending.promise);

    await user.click(toggleButton('Task 1'));
    const busyToggle = screen.getByRole('button', { name: 'Completing... Task 1' });
    expect(busyToggle).toBeDisabled();
    for (const b of buttonLabels()) expect(b).toBeDisabled();

    await user.click(busyToggle);
    await user.click(toggleButton('Task 2'));
    await user.click(deleteButton('Task 2'));
    await user.click(editButton('Task 2'));
    fireEvent.click(busyToggle);
    expect(api.updateTask).toHaveBeenCalledTimes(1);
    expect(queryPrompt()).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Edit task' })).not.toBeInTheDocument();

    store[0]!.status = 'completed';
    await act(async () => pending.resolve(done(1)));
    await screen.findByRole('button', { name: 'Reopen Task 1' });
    for (const b of buttonLabels()) expect(b).toBeEnabled();
  });

  it('shows "Reopening..." for a Completed task', async () => {
    const pending = deferred<Task>();
    const { user } = await renderList([done(1)]);
    vi.mocked(api.updateTask).mockImplementation(() => pending.promise);
    await user.click(toggleButton('Task 1', 'Reopen'));
    expect(screen.getByRole('button', { name: 'Reopening... Task 1' })).toBeDisabled();
    pending.resolve(task(1));
  });

  it('a second activation while the request is in flight sends no second request', async () => {
    const pending = deferred<Task>();
    const { user } = await renderList([task(1)]);
    vi.mocked(api.updateTask).mockImplementation(() => pending.promise);
    toggleButton('Task 1').focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(api.updateTask).toHaveBeenCalledTimes(1);
    pending.resolve(done(1));
  });
});

describe('complete / reopen errors', () => {
  async function failToggle(error: unknown) {
    const view = await renderList([task(1), task(2)]);
    vi.mocked(api.updateTask).mockRejectedValue(error);
    await view.user.click(toggleButton('Task 1'));
    return view;
  }

  it.each([
    ['network failure', new ApiError(0, 'NETWORK_ERROR'), NETWORK_MESSAGE],
    ['500', new ApiError(500, 'INTERNAL_ERROR', 'server detail'), GENERIC_MESSAGE],
    ['400', new ApiError(400, 'VALIDATION_ERROR', 'bad status'), GENERIC_MESSAGE],
    ['malformed 200', new ApiError(200, 'UNKNOWN_ERROR'), GENERIC_MESSAGE],
    ['a non-ApiError', new Error('boom'), GENERIC_MESSAGE],
  ])(
    '%s: fixed text in an alert outside the items, no reload, item unchanged, toggle focused',
    async (_name, error, text) => {
      await failToggle(error);
      await waitFor(() => expect(alertText()).toBe(`Error: ${text}`));
      expect(screen.getByRole('alert').closest('li')).toBeNull();
      expect(screen.getByRole('alert')).not.toHaveTextContent('server detail');
      expect(listCalls()).toBe(1);
      expect(within(item('Task 1')).getByText('Active')).toBeInTheDocument();
      expect(toggleButton('Task 1')).toBeEnabled();
      expect(toggleButton('Task 1')).toHaveTextContent(/^Complete$/);
      expect(toggleButton('Task 1')).toHaveFocus();
      expect(toggleButton('Task 2')).toBeEnabled();
      expect(editButton('Task 1')).toBeEnabled();
      expect(deleteButton('Task 1')).toBeEnabled();
      expect(actionStatus()).toBeEmptyDOMElement();
    },
  );

  it('a retry after an error sends the request again and clears the alert', async () => {
    const { user } = await failToggle(new ApiError(500, 'INTERNAL_ERROR'));
    await waitFor(() => expect(alertText()).not.toBeNull());
    vi.mocked(api.updateTask).mockImplementation(async (id, patch) => {
      store.find((t) => t.id === id)!.status = patch.status!;
      return task(id);
    });
    await user.click(toggleButton('Task 1'));
    await screen.findByRole('button', { name: 'Reopen Task 1' });
    expect(alertText()).toBeNull();
    expect(api.updateTask).toHaveBeenCalledTimes(2);
  });

  it('a failed Reopen keeps the Completed item as it was', async () => {
    const { user } = await renderList([done(1)]);
    vi.mocked(api.updateTask).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR'));
    await user.click(toggleButton('Task 1', 'Reopen'));
    await waitFor(() => expect(alertText()).toBe(`Error: ${NETWORK_MESSAGE}`));
    expect(within(item('Task 1')).getByText('Completed')).toBeInTheDocument();
    expect(toggleButton('Task 1', 'Reopen')).toHaveFocus();
  });

  it('404: alert, list refetched, task gone, focus on the pressed filter', async () => {
    const { user } = await renderList([task(1), task(2)]);
    store = store.filter((t) => t.id !== 1); // deleted elsewhere
    await user.click(toggleButton('Task 1'));

    await waitFor(() => expect(screen.queryByText('Task 1')).not.toBeInTheDocument());

    await listSettled();
    expect(alertText()).toBe(NO_LONGER_EXISTS);
    expect(screen.getByRole('alert').closest('li')).toBeNull();
    expect(listCalls()).toBe(2);
    expect(filterButton('All')).toHaveFocus();
    expect(actionStatus()).toBeEmptyDOMElement();
    expect(screen.getByText('Task 2')).toBeInTheDocument();
    expect(toggleButton('Task 2')).toBeEnabled();
  });

  it('the 404 alert is cleared when the next action starts', async () => {
    const { user } = await renderList([task(1), task(2)]);
    store = store.filter((t) => t.id !== 1);
    await user.click(toggleButton('Task 1'));
    await waitFor(() => expect(alertText()).toBe(NO_LONGER_EXISTS));
    await user.click(toggleButton('Task 2'));
    await screen.findByRole('button', { name: 'Reopen Task 2' });
    expect(alertText()).toBeNull();
  });

  it('401: no inline message, buttons enabled again, no reload, no focus move', async () => {
    const { user } = await renderList([task(1)]);
    vi.mocked(api.updateTask).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED'));
    await user.click(toggleButton('Task 1'));
    await waitFor(() => expect(toggleButton('Task 1')).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(actionStatus()).toBeEmptyDOMElement();
    expect(listCalls()).toBe(1);
  });

  it('401: the global handling redirects to /login keeping the filter', async () => {
    const { user } = await renderList([task(1)], ['/?status=active']);
    vi.mocked(api.updateTask).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED'));
    await user.click(toggleButton('Task 1'));
    act(() => {
      for (const listener of unauthorizedListeners) listener();
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
    expect(currentLocation()).toMatchObject({
      path: '/login',
      state: { from: { pathname: '/', search: '?status=active' } },
    });
  });

  it('a refetch failure after success shows the list error, not an action error', async () => {
    const { user } = await renderList([task(1)]);
    vi.mocked(api.listTasks).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR'));
    await user.click(toggleButton('Task 1'));
    expect(await screen.findByText(`Error: ${LOAD_ERROR_MESSAGE}`)).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByText(`Error: ${GENERIC_MESSAGE}`)).not.toBeInTheDocument();
    expect(actionStatus()).toHaveTextContent('Task completed.');
    expect(filterButton('All')).toHaveFocus();
  });
});

describe('stale results (list replaced or unmounted while the request runs)', () => {
  it('a success after a filter change is ignored: no message, no reload, buttons usable again', async () => {
    const pending = deferred<Task>();
    const { user } = await renderList([task(1), task(2)]);
    vi.mocked(api.updateTask).mockImplementation(() => pending.promise);
    await user.click(toggleButton('Task 1'));
    await user.click(filterButton('Active'));
    await screen.findByRole('button', { name: 'Complete Task 2' });
    const callsBefore = listCalls();

    await act(async () => pending.resolve(done(1)));
    expect(actionStatus()).toBeEmptyDOMElement();
    expect(listCalls()).toBe(callsBefore);
    expect(filterButton('Active')).toHaveFocus();
    expect(currentLocation().path).toBe('/?status=active');
    expect(toggleButton('Task 2')).toBeEnabled();
    expect(editButton('Task 2')).toBeEnabled();
  });

  it('a success after Add replaced the list is ignored', async () => {
    const pending = deferred<Task>();
    const { user } = await renderList([task(1)]);
    vi.mocked(api.updateTask).mockImplementation(() => pending.promise);
    await user.click(toggleButton('Task 1'));
    await user.type(within(addSection()).getByLabelText('Title'), 'Brand new');
    await user.click(within(addSection()).getByRole('button', { name: 'Add task' }));
    await waitFor(() =>
      expect(within(addSection()).getByRole('status')).toHaveTextContent('Task added.'),
    );
    await screen.findByRole('button', { name: 'Completing... Task 1' });
    const callsBefore = listCalls();

    await act(async () => pending.resolve(done(1)));
    expect(actionStatus()).toBeEmptyDOMElement();
    expect(listCalls()).toBe(callsBefore);
    expect(toggleButton('Task 1')).not.toHaveFocus();
    expect(toggleButton('Task 1')).toBeEnabled();
  });

  it('an error after a filter change shows no alert and does not reload', async () => {
    const pending = deferred<Task>();
    const { user } = await renderList([task(1), task(2)]);
    vi.mocked(api.updateTask).mockImplementation(() => pending.promise);
    await user.click(toggleButton('Task 1'));
    await user.click(filterButton('Active'));
    await screen.findByRole('button', { name: 'Complete Task 2' });
    const callsBefore = listCalls();

    await act(async () => pending.reject(new ApiError(500, 'INTERNAL_ERROR')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(listCalls()).toBe(callsBefore);
    expect(toggleButton('Task 2')).toBeEnabled();
  });

  it('a 404 after a filter change does not reload or show the alert', async () => {
    const pending = deferred<Task>();
    const { user } = await renderList([task(1), task(2)]);
    vi.mocked(api.updateTask).mockImplementation(() => pending.promise);
    await user.click(toggleButton('Task 1'));
    await user.click(filterButton('Active'));
    await screen.findByRole('button', { name: 'Complete Task 2' });
    const callsBefore = listCalls();

    await act(async () => pending.reject(new ApiError(404, 'NOT_FOUND')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(listCalls()).toBe(callsBefore);
  });

  it('a delete confirmed and then outdated by a filter change is ignored the same way', async () => {
    const pending = deferred();
    const { user } = await renderList([task(1), task(2)]);
    vi.mocked(api.deleteTask).mockImplementation(() => pending.promise);
    await user.click(deleteButton('Task 1'));
    await user.click(confirmButton());
    await user.click(filterButton('Active'));
    await screen.findByRole('button', { name: 'Complete Task 2' });
    const callsBefore = listCalls();

    await act(async () => pending.resolve());
    expect(actionStatus()).toBeEmptyDOMElement();
    expect(listCalls()).toBe(callsBefore);
    expect(queryPrompt()).not.toBeInTheDocument();
    expect(deleteButton('Task 2')).toBeEnabled();
  });

  it('a result arriving after unmount is ignored (no reload, no error)', async () => {
    const pending = deferred<Task>();
    const { user, unmount } = await renderList([task(1)]);
    vi.mocked(api.updateTask).mockImplementation(() => pending.promise);
    await user.click(toggleButton('Task 1'));
    const callsBefore = listCalls();
    unmount();
    await act(async () => pending.resolve(done(1)));
    expect(listCalls()).toBe(callsBefore);
  });
});

describe('delete prompt', () => {
  it('opens inline in the same li with the prompt text, a named group, Cancel focused, and sends no request', async () => {
    const { user } = await renderList([task(1, { title: 'Buy milk' })]);
    await user.click(deleteButton('Buy milk'));

    expect(item('Buy milk')).toContainElement(prompt());
    expect(prompt()).toHaveAccessibleName('Confirm delete');
    expect(within(prompt()).getByText('Delete "Buy milk"? This cannot be undone.')).toHaveAttribute(
      'id',
      'task-1-delete-prompt',
    );
    expect(cancelButton()).toHaveFocus();
    expect(confirmButton()).toHaveAttribute('id', 'task-1-delete-confirm');
    expect(confirmButton()).toHaveAttribute('aria-describedby', 'task-1-delete-prompt');
    expect(cancelButton()).toHaveAttribute('aria-describedby', 'task-1-delete-prompt');
    expect(confirmButton()).toHaveAccessibleDescription(/Delete "Buy milk"\?/);
    expect(api.deleteTask).not.toHaveBeenCalled();
    expect(api.updateTask).not.toHaveBeenCalled();
    // The title and status stay visible; the button row is replaced.
    expect(within(item('Buy milk')).getByText('Active')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Buy milk' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete Buy milk' })).not.toBeInTheDocument();
  });

  it('works for a Completed item too', async () => {
    const { user } = await renderList([done(1, { title: 'Done one' })]);
    await user.click(deleteButton('Done one'));
    expect(within(prompt()).getByText('Delete "Done one"? This cannot be undone.')).toBeVisible();
  });

  it('Cancel closes the prompt, sends nothing, shows no message and refocuses the item Delete', async () => {
    const { user } = await renderList([task(1), task(2)]);
    await user.click(deleteButton('Task 2'));
    await user.click(cancelButton());

    expect(queryPrompt()).not.toBeInTheDocument();
    expect(deleteButton('Task 2')).toHaveFocus();
    expect(api.deleteTask).not.toHaveBeenCalled();
    expect(listCalls()).toBe(1);
    expect(actionStatus()).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    for (const b of buttonLabels()) expect(b).toBeEnabled();
  });

  it('Escape closes the prompt like Cancel', async () => {
    const { user } = await renderList([task(1)]);
    await user.click(deleteButton('Task 1'));
    await user.keyboard('{Escape}');
    expect(queryPrompt()).not.toBeInTheDocument();
    expect(deleteButton('Task 1')).toHaveFocus();
    expect(api.deleteTask).not.toHaveBeenCalled();
    expect(actionStatus()).toBeEmptyDOMElement();
  });

  it('Escape works with focus on the confirm button too', async () => {
    const { user } = await renderList([task(1)]);
    await user.click(deleteButton('Task 1'));
    await user.tab({ shift: true });
    expect(confirmButton()).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(queryPrompt()).not.toBeInTheDocument();
    expect(deleteButton('Task 1')).toHaveFocus();
  });

  it('Escape during IME composition does not close the prompt', async () => {
    const { user } = await renderList([task(1)]);
    await user.click(deleteButton('Task 1'));
    fireEvent.keyDown(cancelButton(), { key: 'Escape', isComposing: true });
    expect(prompt()).toBeInTheDocument();
    expect(cancelButton()).toHaveFocus();
  });

  it('is operable by keyboard: Enter on the focused Cancel closes it; Tab order is Delete then Cancel', async () => {
    const { user } = await renderList([task(1)]);
    deleteButton('Task 1').focus();
    await user.keyboard('{Enter}');
    expect(cancelButton()).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirmButton()).toHaveFocus();
    await user.tab();
    expect(cancelButton()).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(queryPrompt()).not.toBeInTheDocument();
    expect(deleteButton('Task 1')).toHaveFocus();
  });

  it('only one prompt: while it is open every other item button, and the other items, are disabled', async () => {
    const { user } = await renderList([task(1), task(2), done(3)]);
    await user.click(deleteButton('Task 2'));
    expect(screen.getAllByRole('group', { name: 'Confirm delete' })).toHaveLength(1);
    for (const title of ['Task 1']) {
      expect(toggleButton(title)).toBeDisabled();
      expect(editButton(title)).toBeDisabled();
      expect(deleteButton(title)).toBeDisabled();
    }
    expect(toggleButton('Task 3', 'Reopen')).toBeDisabled();
    expect(editButton('Task 3')).toBeDisabled();
    expect(deleteButton('Task 3')).toBeDisabled();
    // The prompt itself is usable.
    expect(confirmButton()).toBeEnabled();
    expect(cancelButton()).toBeEnabled();

    await user.click(deleteButton('Task 1'));
    await user.click(editButton('Task 1'));
    expect(screen.getAllByRole('group', { name: 'Confirm delete' })).toHaveLength(1);
    expect(screen.queryByRole('form', { name: 'Edit task' })).not.toBeInTheDocument();
    expect(api.updateTask).not.toHaveBeenCalled();

    await user.click(cancelButton());
    for (const b of buttonLabels()) expect(b).toBeEnabled();
  });

  it('while an edit form is open, Complete and Delete of every other item are disabled', async () => {
    const { user } = await renderList([task(1), task(2)]);
    await user.click(editButton('Task 1'));
    expect(toggleButton('Task 2')).toBeDisabled();
    expect(deleteButton('Task 2')).toBeDisabled();
    await user.click(deleteButton('Task 2'));
    expect(queryPrompt()).not.toBeInTheDocument();
  });

  it('a successful Add closes the open prompt and it does not reopen', async () => {
    const { user } = await renderList([task(1), task(2)]);
    await user.click(deleteButton('Task 1'));
    await user.type(within(addSection()).getByLabelText('Title'), 'Brand new');
    await user.click(within(addSection()).getByRole('button', { name: 'Add task' }));
    await waitFor(() =>
      expect(within(addSection()).getByRole('status')).toHaveTextContent('Task added.'),
    );
    await screen.findByRole('button', { name: 'Edit Task 1' });
    expect(queryPrompt()).not.toBeInTheDocument();
    expect(deleteButton('Task 1')).toBeEnabled();
    expect(api.deleteTask).not.toHaveBeenCalled();
  });

  it('a filter change closes the prompt; it does not reopen when the list comes back', async () => {
    const { user } = await renderList([task(1), task(2)]);
    await user.click(deleteButton('Task 1'));
    await user.click(filterButton('Active'));
    await screen.findByRole('button', { name: 'Edit Task 1' });
    expect(queryPrompt()).not.toBeInTheDocument();
    await user.click(filterButton('All'));
    await screen.findByRole('button', { name: 'Edit Task 1' });
    expect(queryPrompt()).not.toBeInTheDocument();
    expect(api.deleteTask).not.toHaveBeenCalled();
  });

  it('Back and Forward close the prompt; it does not reopen', async () => {
    const { user } = await renderList([task(1), task(2)]);
    await user.click(filterButton('Active'));
    await screen.findByRole('button', { name: 'Edit Task 1' });
    await user.click(deleteButton('Task 1'));
    await user.click(screen.getByRole('button', { name: 'history-back' }));
    await screen.findByRole('button', { name: 'Edit Task 1' });
    expect(currentLocation().path).toBe('/');
    expect(queryPrompt()).not.toBeInTheDocument();

    await user.click(deleteButton('Task 2'));
    await user.click(screen.getByRole('button', { name: 'history-forward' }));
    await screen.findByRole('button', { name: 'Edit Task 1' });
    expect(queryPrompt()).not.toBeInTheDocument();
  });
});

describe('delete confirm', () => {
  it('sends DELETE for that id, then the task is gone, "Task deleted." is announced and the filter is focused', async () => {
    const { user } = await renderList([task(1), task(2), task(3)]);
    await user.click(deleteButton('Task 2'));
    await user.click(confirmButton());

    await waitFor(() => expect(screen.queryByText('Task 2')).not.toBeInTheDocument());

    await listSettled();
    expect(api.deleteTask).toHaveBeenCalledExactlyOnceWith(2);
    expect(queryPrompt()).not.toBeInTheDocument();
    expect(actionStatus()).toHaveTextContent(/^Task deleted\.$/);
    expect(filterButton('All')).toHaveFocus();
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Task 3')).toBeInTheDocument();
    expect(listCalls()).toBe(2);
    expect(alertText()).toBeNull();
    expect(api.updateTask).not.toHaveBeenCalled();
  });

  it('under Active and Completed the focus goes to the pressed filter button', async () => {
    const { user } = await renderList([done(1), done(2)], ['/?status=completed']);
    await user.click(deleteButton('Task 1'));
    await user.click(confirmButton());
    await waitFor(() => expect(screen.queryByText('Task 1')).not.toBeInTheDocument());
    await listSettled();
    expect(filterButton('Completed')).toHaveFocus();
    expect(currentLocation().path).toBe('/?status=completed');
  });

  it('deleting the last task shows the empty message and keeps focus on the page', async () => {
    const { user } = await renderList([task(1)]);
    await user.click(deleteButton('Task 1'));
    await user.click(confirmButton());
    await waitFor(() => expect(screen.queryByText('Task 1')).not.toBeInTheDocument());
    await listSettled();
    expect(document.activeElement).not.toBe(document.body);
    expect(filterButton('All')).toHaveFocus();
    expect(actionStatus()).toHaveTextContent('Task deleted.');
  });

  it('shows "Deleting..." with both prompt buttons and all other buttons disabled; Escape and repeated clicks are ignored', async () => {
    const pending = deferred();
    const { user } = await renderList([task(1), task(2)]);
    vi.mocked(api.deleteTask).mockImplementation(() => pending.promise);
    await user.click(deleteButton('Task 1'));
    await user.click(confirmButton());

    expect(confirmButton()).toHaveTextContent(/^Deleting\.\.\.$/);
    expect(confirmButton()).toBeDisabled();
    expect(cancelButton()).toBeDisabled();
    expect(toggleButton('Task 2')).toBeDisabled();
    await user.click(confirmButton());
    fireEvent.click(confirmButton());
    fireEvent.keyDown(prompt(), { key: 'Escape' });
    await user.click(cancelButton());
    expect(prompt()).toBeInTheDocument();
    expect(api.deleteTask).toHaveBeenCalledTimes(1);

    store = store.filter((t) => t.id !== 1);
    await act(async () => pending.resolve());
    await waitFor(() => expect(screen.queryByText('Task 1')).not.toBeInTheDocument());
    await listSettled();
    expect(actionStatus()).toHaveTextContent('Task deleted.');
  });

  it.each([
    ['network failure', new ApiError(0, 'NETWORK_ERROR'), NETWORK_MESSAGE],
    ['500', new ApiError(500, 'INTERNAL_ERROR', 'server detail'), GENERIC_MESSAGE],
    ['a 200 instead of 204', new ApiError(200, 'UNKNOWN_ERROR'), GENERIC_MESSAGE],
  ])(
    '%s: the prompt stays open with focus on its Delete, an alert outside the item, no reload',
    async (_name, error, text) => {
      const { user } = await renderList([task(1), task(2)]);
      vi.mocked(api.deleteTask).mockRejectedValue(error);
      await user.click(deleteButton('Task 1'));
      await user.click(confirmButton());

      await waitFor(() => expect(alertText()).toBe(`Error: ${text}`));
      expect(screen.getByRole('alert').closest('li')).toBeNull();
      expect(prompt()).toBeInTheDocument();
      expect(confirmButton()).toBeEnabled();
      expect(confirmButton()).toHaveTextContent(/^Delete$/);
      expect(confirmButton()).toHaveFocus();
      expect(cancelButton()).toBeEnabled();
      expect(listCalls()).toBe(1);
      expect(actionStatus()).toBeEmptyDOMElement();
      expect(screen.getByText('Task 1')).toBeInTheDocument();
    },
  );

  it('a retry after an error can succeed', async () => {
    const { user } = await renderList([task(1)]);
    vi.mocked(api.deleteTask).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR'));
    await user.click(deleteButton('Task 1'));
    await user.click(confirmButton());
    await waitFor(() => expect(alertText()).not.toBeNull());
    await user.click(confirmButton());
    await waitFor(() => expect(screen.queryByText('Task 1')).not.toBeInTheDocument());
    await listSettled();
    expect(alertText()).toBeNull();
    expect(actionStatus()).toHaveTextContent('Task deleted.');
  });

  it('Cancel after an error closes the prompt and focuses the item Delete; the alert may stay until the next action', async () => {
    const { user } = await renderList([task(1)]);
    vi.mocked(api.deleteTask).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR'));
    await user.click(deleteButton('Task 1'));
    await user.click(confirmButton());
    await waitFor(() => expect(alertText()).not.toBeNull());
    await user.click(cancelButton());
    expect(queryPrompt()).not.toBeInTheDocument();
    expect(deleteButton('Task 1')).toHaveFocus();
  });

  it('404: the prompt closes, the alert is shown, the list is refetched and focus goes to the filter', async () => {
    const { user } = await renderList([task(1), task(2)]);
    store = store.filter((t) => t.id !== 1); // already deleted elsewhere
    await user.click(deleteButton('Task 1'));
    await user.click(confirmButton());

    await waitFor(() => expect(screen.queryByText('Task 1')).not.toBeInTheDocument());

    await listSettled();
    expect(alertText()).toBe(NO_LONGER_EXISTS);
    expect(queryPrompt()).not.toBeInTheDocument();
    expect(listCalls()).toBe(2);
    expect(filterButton('All')).toHaveFocus();
    expect(actionStatus()).toBeEmptyDOMElement();
  });

  it('401: no inline message; the prompt stays and the buttons are enabled again', async () => {
    const { user } = await renderList([task(1)]);
    vi.mocked(api.deleteTask).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED'));
    await user.click(deleteButton('Task 1'));
    await user.click(confirmButton());
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(actionStatus()).toBeEmptyDOMElement();
    expect(listCalls()).toBe(1);
  });

  it('a refetch failure after success shows the list error and keeps "Task deleted."', async () => {
    const { user } = await renderList([task(1)]);
    await user.click(deleteButton('Task 1'));
    vi.mocked(api.listTasks).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR'));
    await user.click(confirmButton());

    expect(await screen.findByText(`Error: ${LOAD_ERROR_MESSAGE}`)).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(actionStatus()).toHaveTextContent('Task deleted.');
    expect(queryPrompt()).not.toBeInTheDocument();
    expect(filterButton('All')).toHaveFocus();
  });
});

describe('plain-text titles', () => {
  const TITLE = '<b>x</b>';

  it('shows markup literally in the names, the prompt and the item', async () => {
    const { user } = await renderList([task(1, { title: TITLE })]);
    expect(toggleButton(TITLE)).toBeInTheDocument();
    expect(editButton(TITLE)).toBeInTheDocument();
    await user.click(deleteButton(TITLE));
    expect(within(prompt()).getByText(`Delete "${TITLE}"? This cannot be undone.`)).toBeVisible();
    expect(item(TITLE).querySelector('b')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
  });
});
