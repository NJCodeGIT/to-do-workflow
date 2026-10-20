// Add-task form and its wiring in TasksView (S-008, docs/UI_SPEC.md "Add task form (S-008)",
// decisions #50-#53). api.ts is mocked; the whole app is rendered so the real list, filter,
// router and auth provider are involved.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, type InitialEntry } from 'react-router-dom';
import * as api from '../api';
import { ApiError, type Task } from '../api';
import App from '../App';
import { AuthProvider } from '../auth/AuthProvider';
import { GENERIC_MESSAGE, NETWORK_MESSAGE } from '../auth/error-messages';
import { currentLocation } from '../test/render-app';

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
  vi.mocked(api.createTask).mockResolvedValue(task(99));
  vi.mocked(api.onUnauthorized).mockImplementation((listener) => {
    unauthorizedListeners.push(listener);
    return () => {
      unauthorizedListeners = unauthorizedListeners.filter((l) => l !== listener);
    };
  });
});

// Exposes the router location for currentLocation() (same markup as test/render-app.tsx).
function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname + location.search + location.hash}
    </div>
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

const titleInput = () => screen.getByLabelText('Title');
const descriptionInput = () => screen.getByLabelText('Description (optional)');
const addButton = () => screen.getByRole('button', { name: /^(Add task|Adding\.\.\.)$/ });
const addSection = () => screen.getByRole('region', { name: 'Add a task' });
const addStatus = () => within(addSection()).getByRole('status');
// The list's results region comes before the edit (S-009) and action (S-010) confirmation regions.
const listStatus = () => {
  const regions = screen.getAllByRole('status').filter((el) => !addSection().contains(el));
  expect(regions).toHaveLength(3);
  return regions[0]!;
};
const formAlert = () => within(addSection()).queryByRole('alert');
const filterButton = (name: string) => screen.getByRole('button', { name });

/** Render the home page and wait until the first list load has settled. */
async function renderReady(initialEntries?: InitialEntry[]) {
  const view = renderHome(initialEntries);
  await screen.findByText(/^(You have no tasks yet\.|No active tasks\.|No completed tasks\.)$/);
  return view;
}

describe('structure and accessibility', () => {
  it('has a labelled section with h2, labelled fields, noValidate and no autofocus', async () => {
    await renderReady();
    const section = addSection();
    expect(within(section).getByRole('heading', { level: 2, name: 'Add a task' })).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    const form = within(section).getByRole('form', { name: 'Add a task' });
    expect(form).toHaveAttribute('novalidate');
    expect(titleInput()).toHaveAttribute('id', 'add-task-title');
    expect(titleInput()).toHaveAttribute('type', 'text');
    expect(descriptionInput().tagName).toBe('TEXTAREA');
    expect(descriptionInput()).toHaveAttribute('id', 'add-task-description');
    for (const field of [titleInput(), descriptionInput()]) {
      expect(field).not.toBeRequired();
      expect(field).not.toHaveAttribute('maxlength');
      expect(field).not.toHaveAttribute('aria-invalid');
      expect(field).not.toHaveAttribute('aria-describedby');
    }
    expect(addButton()).toHaveAttribute('type', 'submit');
    expect(addButton()).toBeEnabled();
    expect(document.activeElement).toBe(document.body);
  });

  it('sits between the h1 and the filter, with an empty status region and no alert', async () => {
    await renderReady();
    const h1 = screen.getByRole('heading', { level: 1 });
    const filter = screen.getByRole('group', { name: 'Show:' });
    expect(
      h1.compareDocumentPosition(addSection()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(addSection().compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(addStatus()).toBeEmptyDOMElement();
    expect(formAlert()).not.toBeInTheDocument();
  });

  it('is shown while the list loads and when the list failed to load', async () => {
    const pending = deferred<Task[]>();
    vi.mocked(api.listTasks).mockReturnValueOnce(pending.promise);
    renderHome();
    expect(titleInput()).toBeVisible();
    expect(listStatus()).toHaveTextContent('Loading tasks...');
    await act(async () => pending.reject(new ApiError(500, 'INTERNAL_ERROR')));
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(titleInput()).toBeVisible();
    expect(addButton()).toBeEnabled();
  });

  it('is shown under every filter', async () => {
    for (const path of ['/', '/?status=active', '/?status=completed']) {
      const { unmount } = await renderReady([path]);
      expect(titleInput()).toBeVisible();
      unmount();
    }
  });

  it('the add status region is separate from the list results region', async () => {
    await renderReady();
    expect(addStatus()).not.toBe(listStatus());
    expect(addSection().contains(listStatus())).toBe(false);
  });

  it('works by keyboard: Tab order title, description, button; Enter in title submits', async () => {
    const { user } = await renderReady();
    await user.click(titleInput());
    await user.tab();
    expect(descriptionInput()).toHaveFocus();
    await user.tab();
    expect(addButton()).toHaveFocus();
    await user.click(titleInput());
    await user.type(titleInput(), 'Keyboard task{Enter}');
    expect(api.createTask).toHaveBeenCalledExactlyOnceWith({ title: 'Keyboard task' });
  });

  it('Enter in the description textarea adds a newline and does not submit', async () => {
    const { user } = await renderReady();
    await user.type(titleInput(), 'A');
    await user.type(descriptionInput(), 'line1{Enter}line2');
    expect(descriptionInput()).toHaveValue('line1\nline2');
    expect(api.createTask).not.toHaveBeenCalled();
  });
});

describe('validation on submit', () => {
  it('empty title: message, aria wiring, focus on title, nothing sent', async () => {
    const { user } = await renderReady();
    await user.click(addButton());

    expect(screen.getByText('Enter a title.')).toHaveAttribute('id', 'add-task-title-error');
    expect(titleInput()).toHaveAttribute('aria-invalid', 'true');
    expect(titleInput()).toHaveAttribute('aria-describedby', 'add-task-title-error');
    expect(titleInput()).toHaveFocus();
    expect(descriptionInput()).not.toHaveAttribute('aria-invalid');
    expect(api.createTask).not.toHaveBeenCalled();
    expect(api.listTasks).toHaveBeenCalledOnce();
    expect(formAlert()).not.toBeInTheDocument();
  });

  it('whitespace-only title is treated as empty', async () => {
    const { user } = await renderReady();
    await user.type(titleInput(), '   ');
    await user.click(addButton());
    expect(screen.getByText('Enter a title.')).toBeInTheDocument();
    expect(titleInput()).toHaveValue('   ');
    expect(api.createTask).not.toHaveBeenCalled();
  });

  it('title of 201 characters is rejected; the value is kept (no maxLength cut)', async () => {
    const { user } = await renderReady();
    await user.click(titleInput());
    await user.paste('x'.repeat(201));
    await user.click(addButton());
    expect(screen.getByText('Title must be at most 200 characters.')).toBeInTheDocument();
    expect(titleInput()).toHaveFocus();
    expect(titleInput()).toHaveValue('x'.repeat(201));
    expect(api.createTask).not.toHaveBeenCalled();
  });

  it('description of 2001 characters: message and focus on the description', async () => {
    const { user } = await renderReady();
    await user.type(titleInput(), 'Ok title');
    await user.click(descriptionInput());
    await user.paste('d'.repeat(2001));
    await user.click(addButton());

    expect(screen.getByText('Description must be at most 2000 characters.')).toHaveAttribute(
      'id',
      'add-task-description-error',
    );
    expect(descriptionInput()).toHaveAttribute('aria-invalid', 'true');
    expect(descriptionInput()).toHaveAttribute('aria-describedby', 'add-task-description-error');
    expect(descriptionInput()).toHaveFocus();
    expect(titleInput()).not.toHaveAttribute('aria-invalid');
    expect(api.createTask).not.toHaveBeenCalled();
  });

  it('both invalid: both messages, focus on the title first', async () => {
    const { user } = await renderReady();
    await user.click(descriptionInput());
    await user.paste('d'.repeat(2001));
    await user.click(addButton());
    expect(screen.getByText('Enter a title.')).toBeInTheDocument();
    expect(screen.getByText('Description must be at most 2000 characters.')).toBeInTheDocument();
    expect(titleInput()).toHaveFocus();
  });

  it('accepts exactly 200 title and 2000 description characters (after trim)', async () => {
    const { user } = await renderReady();
    const title = 'x'.repeat(200);
    const description = 'y'.repeat(2000);
    await user.click(titleInput());
    await user.paste(` ${title} `);
    await user.click(descriptionInput());
    await user.paste(` ${description} `);
    await user.click(addButton());
    expect(screen.queryByText(/must be at most/)).not.toBeInTheDocument();
    expect(api.createTask).toHaveBeenCalledExactlyOnceWith({ title, description });
  });

  it('editing a field removes only that field error; the next submit re-validates', async () => {
    const { user } = await renderReady();
    await user.click(descriptionInput());
    await user.paste('d'.repeat(2001));
    await user.click(addButton());
    expect(screen.getByText('Enter a title.')).toBeInTheDocument();

    await user.type(titleInput(), 'A');
    expect(screen.queryByText('Enter a title.')).not.toBeInTheDocument();
    expect(titleInput()).not.toHaveAttribute('aria-invalid');
    expect(titleInput()).not.toHaveAttribute('aria-describedby');
    expect(screen.getByText('Description must be at most 2000 characters.')).toBeInTheDocument();

    await user.click(addButton());
    expect(screen.queryByText('Enter a title.')).not.toBeInTheDocument();
    expect(descriptionInput()).toHaveFocus();
    expect(api.createTask).not.toHaveBeenCalled();
  });

  it('a valid submit clears earlier field errors before the request is sent', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.createTask).mockReturnValue(pending.promise);
    const { user } = await renderReady();
    await user.click(addButton());
    expect(screen.getByText('Enter a title.')).toBeInTheDocument();
    await user.type(titleInput(), 'Fixed');
    await user.click(addButton());
    expect(screen.queryByText('Enter a title.')).not.toBeInTheDocument();
    expect(api.createTask).toHaveBeenCalledOnce();
    await act(async () => pending.resolve(task(1)));
  });
});

describe('request payload', () => {
  it('sends the trimmed title and omits a blank description key', async () => {
    const { user } = await renderReady();
    await user.type(titleInput(), '  Buy milk  ');
    await user.type(descriptionInput(), ' {Enter}  ');
    await user.click(addButton());
    expect(api.createTask).toHaveBeenCalledOnce();
    const payload = vi.mocked(api.createTask).mock.calls[0]![0];
    expect(payload).toEqual({ title: 'Buy milk' });
    expect('description' in payload).toBe(false);
  });

  it('sends the trimmed description when present and keeps inner line breaks', async () => {
    const { user } = await renderReady();
    await user.type(titleInput(), 'Buy milk');
    await user.type(descriptionInput(), '  2 litres{Enter}full fat  ');
    await user.click(addButton());
    expect(api.createTask).toHaveBeenCalledExactlyOnceWith({
      title: 'Buy milk',
      description: '2 litres\nfull fat',
    });
  });

  it('sends nothing but title and description (no status, no user id)', async () => {
    const { user } = await renderReady();
    await user.type(titleInput(), 'T');
    await user.type(descriptionInput(), 'D');
    await user.click(addButton());
    expect(Object.keys(vi.mocked(api.createTask).mock.calls[0]![0]).sort()).toEqual([
      'description',
      'title',
    ]);
  });
});

describe('no double submit', () => {
  it('disables the button with "Adding..." while sending; inputs stay editable', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.createTask).mockReturnValue(pending.promise);
    const { user } = await renderReady();
    await user.type(titleInput(), 'Slow');
    await user.click(addButton());

    expect(addButton()).toBeDisabled();
    expect(addButton()).toHaveTextContent('Adding...');
    expect(screen.queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument();
    expect(titleInput()).toBeEnabled();
    expect(descriptionInput()).toBeEnabled();

    await act(async () => pending.resolve(task(1)));
    expect(addButton()).toBeEnabled();
    expect(addButton()).toHaveTextContent('Add task');
  });

  it('a second click, a second Enter and a raw submit event send one request', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.createTask).mockReturnValue(pending.promise);
    const { user } = await renderReady();
    await user.type(titleInput(), 'Once');
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');
    await user.click(addButton());
    // The guard is a ref flag, not only `disabled`: a submit event must also be ignored.
    fireEvent.submit(within(addSection()).getByRole('form'));
    fireEvent.submit(within(addSection()).getByRole('form'));

    expect(api.createTask).toHaveBeenCalledOnce();
    await act(async () => pending.resolve(task(1)));
    expect(api.createTask).toHaveBeenCalledOnce();
    expect(api.listTasks).toHaveBeenCalledTimes(2); // initial load + one reload
  });

  it('a submit event while sending does not validate or show errors, even if the field was emptied', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.createTask).mockReturnValue(pending.promise);
    const { user } = await renderReady();
    await user.type(titleInput(), 'Once');
    await user.click(addButton());
    await user.clear(titleInput());
    fireEvent.submit(within(addSection()).getByRole('form'));
    expect(screen.queryByText('Enter a title.')).not.toBeInTheDocument();
    expect(api.createTask).toHaveBeenCalledOnce();
    await act(async () => pending.resolve(task(1)));
  });

  it('can add again after a finished add', async () => {
    const { user } = await renderReady();
    await user.type(titleInput(), 'First');
    await user.click(addButton());
    await user.type(titleInput(), 'Second');
    await user.click(addButton());
    expect(vi.mocked(api.createTask).mock.calls.map((c) => c[0])).toEqual([
      { title: 'First' },
      { title: 'Second' },
    ]);
  });

  it('can retry after a failure', async () => {
    vi.mocked(api.createTask).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR'));
    const { user } = await renderReady();
    await user.type(titleInput(), 'Retry me');
    await user.click(addButton());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.click(addButton());
    expect(api.createTask).toHaveBeenCalledTimes(2);
    expect(formAlert()).not.toBeInTheDocument();
    expect(titleInput()).toHaveValue('');
  });
});

describe('success', () => {
  it('clears both fields, focuses the title, announces "Task added." and refetches the list', async () => {
    const { user } = await renderReady();
    vi.mocked(api.listTasks).mockResolvedValue([task(99, { title: 'New one' }), task(1)]);
    await user.type(titleInput(), 'New one');
    await user.type(descriptionInput(), 'Details');
    await user.click(addButton());

    expect(titleInput()).toHaveValue('');
    expect(descriptionInput()).toHaveValue('');
    expect(titleInput()).toHaveFocus();
    expect(addStatus()).toHaveTextContent(/^Task added\.$/);
    expect(formAlert()).not.toBeInTheDocument();
    expect(addButton()).toBeEnabled();
    expect(api.listTasks).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.listTasks).mock.calls).toEqual([['all'], ['all']]);

    // The new task comes from the API response, in API order; the list status is its own.
    const items = within(await screen.findByRole('list')).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('New one');
    expect(listStatus()).toHaveTextContent('2 tasks');
    expect(addStatus()).toHaveTextContent(/^Task added\.$/);
  });

  it('does not insert the created task itself: the list shows only what the refetch returns', async () => {
    const { user } = await renderReady();
    vi.mocked(api.createTask).mockResolvedValue(task(99, { title: 'Created title' }));
    vi.mocked(api.listTasks).mockResolvedValue([task(5, { title: 'From refetch' })]);
    await user.type(titleInput(), 'Typed');
    await user.click(addButton());
    expect(await screen.findByText('From refetch')).toBeInTheDocument();
    expect(screen.queryByText('Created title')).not.toBeInTheDocument();
  });

  it('shows the list loading state while the refetch is pending, then the result', async () => {
    const { user } = await renderReady();
    const refetch = deferred<Task[]>();
    vi.mocked(api.listTasks).mockReturnValueOnce(refetch.promise);
    await user.type(titleInput(), 'A');
    await user.click(addButton());
    expect(listStatus()).toHaveTextContent('Loading tasks...');
    expect(addStatus()).toHaveTextContent('Task added.');
    expect(titleInput()).toHaveFocus();
    await act(async () => refetch.resolve([task(99, { title: 'A' })]));
    expect(listStatus()).toHaveTextContent('1 task');
  });

  it('the filter and URL are untouched under Active', async () => {
    const { user } = await renderReady(['/?status=active']);
    await user.type(titleInput(), 'A');
    await user.click(addButton());
    expect(addStatus()).toHaveTextContent(/^Task added\.$/);
    expect(currentLocation().path).toBe('/?status=active');
    expect(filterButton('Active')).toHaveAttribute('aria-pressed', 'true');
    expect(vi.mocked(api.listTasks).mock.calls).toEqual([['active'], ['active']]);
  });

  it('under Completed: filter unchanged, list refetched, confirmation says it is not shown', async () => {
    const { user } = await renderReady(['/?status=completed']);
    await user.type(titleInput(), 'A');
    await user.click(addButton());

    expect(addStatus()).toHaveTextContent(
      'Task added. It is active, so it is not shown under Completed.',
    );
    expect(currentLocation().path).toBe('/?status=completed');
    expect(filterButton('Completed')).toHaveAttribute('aria-pressed', 'true');
    expect(filterButton('All')).toHaveAttribute('aria-pressed', 'false');
    expect(vi.mocked(api.listTasks).mock.calls).toEqual([['completed'], ['completed']]);
    expect(await screen.findByText('No completed tasks.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('uses the filter current when the response arrives', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.createTask).mockReturnValue(pending.promise);
    const { user } = await renderReady();
    await user.type(titleInput(), 'A');
    await user.click(addButton());
    await user.click(filterButton('Completed'));
    await act(async () => pending.resolve(task(1)));
    expect(addStatus()).toHaveTextContent('it is not shown under Completed');
    // The reload refetches the filter current at that moment.
    expect(vi.mocked(api.listTasks).mock.calls.at(-1)).toEqual(['completed']);
  });

  it('the confirmation text is fixed once set: a later filter change does not rewrite it', async () => {
    const { user } = await renderReady();
    await user.type(titleInput(), 'A');
    await user.click(addButton());
    expect(addStatus()).toHaveTextContent(/^Task added\.$/);
    await user.click(filterButton('Completed'));
    expect(addStatus()).toHaveTextContent(/^Task added\.$/);
  });

  it('text typed while the request is in flight is cleared on success, and not sent', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.createTask).mockReturnValue(pending.promise);
    const { user } = await renderReady();
    await user.type(titleInput(), 'Sent title');
    await user.click(addButton());
    await user.type(titleInput(), ' extra');
    await user.type(descriptionInput(), 'typed late');
    expect(titleInput()).toHaveValue('Sent title extra');

    await act(async () => pending.resolve(task(1)));
    expect(titleInput()).toHaveValue('');
    expect(descriptionInput()).toHaveValue('');
    expect(api.createTask).toHaveBeenCalledExactlyOnceWith({ title: 'Sent title' });
  });
});

describe('confirmation lifetime', () => {
  it('stays until the next submit, then is cleared before the request completes', async () => {
    const { user } = await renderReady();
    await user.type(titleInput(), 'One');
    await user.click(addButton());
    expect(addStatus()).toHaveTextContent('Task added.');

    // Typing does not clear it.
    const pending = deferred<Task>();
    vi.mocked(api.createTask).mockReturnValue(pending.promise);
    await user.type(titleInput(), 'Two');
    expect(addStatus()).toHaveTextContent('Task added.');

    await user.click(addButton());
    expect(addStatus()).toBeEmptyDOMElement(); // cleared, so a repeat is announced again
    await act(async () => pending.resolve(task(2)));
    expect(addStatus()).toHaveTextContent(/^Task added\.$/);
  });

  it('is cleared by an invalid submit too', async () => {
    const { user } = await renderReady();
    await user.type(titleInput(), 'One');
    await user.click(addButton());
    expect(addStatus()).toHaveTextContent('Task added.');
    await user.click(addButton()); // empty title now
    expect(screen.getByText('Enter a title.')).toBeInTheDocument();
    expect(addStatus()).toBeEmptyDOMElement();
  });

  it('is cleared by a failed submit, which shows the alert instead', async () => {
    const { user } = await renderReady();
    await user.type(titleInput(), 'One');
    await user.click(addButton());
    vi.mocked(api.createTask).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR'));
    await user.type(titleInput(), 'Two');
    await user.click(addButton());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(addStatus()).toBeEmptyDOMElement();
  });

  it('is not shown after the page is left and returned to (fresh mount)', async () => {
    const { user } = await renderReady();
    await user.type(titleInput(), 'One');
    await user.click(addButton());
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.queryByRole('region', { name: 'Add a task' })).not.toBeInTheDocument();
  });
});

describe('failures', () => {
  it('400: shows the server message verbatim in a form-level alert, keeps values, focuses title', async () => {
    vi.mocked(api.createTask).mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'title must be at most 200 characters'),
    );
    const { user } = await renderReady();
    await user.type(titleInput(), 'Keep me');
    await user.type(descriptionInput(), 'Keep too');
    await user.click(descriptionInput());
    await user.click(addButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Error: title must be at most 200 characters');
    expect(addSection()).toContainElement(alert);
    expect(titleInput()).toHaveValue('Keep me');
    expect(descriptionInput()).toHaveValue('Keep too');
    expect(titleInput()).toHaveFocus();
    expect(addButton()).toBeEnabled();
    expect(addStatus()).toBeEmptyDOMElement();
    expect(api.listTasks).toHaveBeenCalledOnce(); // no refetch on failure
  });

  it.each([
    ['network', new ApiError(0, 'NETWORK_ERROR', 'Network request failed'), NETWORK_MESSAGE],
    ['5xx', new ApiError(500, 'INTERNAL_ERROR', 'Server secret detail'), GENERIC_MESSAGE],
    ['503', new ApiError(503, 'UNAVAILABLE', 'Down'), GENERIC_MESSAGE],
    ['400 with another code', new ApiError(400, 'OTHER', 'raw text'), GENERIC_MESSAGE],
    ['400 with empty message', new ApiError(400, 'VALIDATION_ERROR', ''), GENERIC_MESSAGE],
    ['malformed 201', new ApiError(201, 'UNKNOWN_ERROR'), GENERIC_MESSAGE],
    ['non-ApiError', new TypeError('boom'), GENERIC_MESSAGE],
  ])('%s: fixed text, values kept, focus on title', async (_name, error, message) => {
    vi.mocked(api.createTask).mockRejectedValue(error);
    const { user } = await renderReady();
    await user.type(titleInput(), 'Keep me');
    await user.type(descriptionInput(), 'Keep too');
    await user.click(addButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(`Error: ${message}`);
    expect(alert.textContent).not.toMatch(/secret|raw text|boom|Down/);
    expect(titleInput()).toHaveValue('Keep me');
    expect(descriptionInput()).toHaveValue('Keep too');
    expect(titleInput()).toHaveFocus();
    expect(addButton()).toBeEnabled();
    expect(addButton()).toHaveTextContent('Add task');
    expect(api.listTasks).toHaveBeenCalledOnce();
  });

  it('moves focus back to the title even when the user focused the description while sending', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.createTask).mockReturnValue(pending.promise);
    const { user } = await renderReady();
    await user.type(titleInput(), 'T');
    await user.click(addButton());
    await user.click(descriptionInput());
    await act(async () => pending.reject(new ApiError(0, 'NETWORK_ERROR')));
    expect(titleInput()).toHaveFocus();
  });

  it('the form-level error stays while editing and is removed by the next submit', async () => {
    vi.mocked(api.createTask).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR'));
    const { user } = await renderReady();
    await user.type(titleInput(), 'T');
    await user.click(addButton());
    await screen.findByRole('alert');
    await user.type(titleInput(), 'x');
    expect(formAlert()).toBeInTheDocument();
    await user.clear(titleInput());
    await user.click(addButton()); // invalid: clears the form-level error
    expect(formAlert()).not.toBeInTheDocument();
    expect(screen.getByText('Enter a title.')).toBeInTheDocument();
  });

  it('a failure does not touch the list, filter or URL', async () => {
    vi.mocked(api.listTasks).mockResolvedValue([task(1, { title: 'Existing' })]);
    vi.mocked(api.createTask).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR'));
    const { user } = renderHome(['/?status=active']);
    await screen.findByText('Existing');
    await user.type(titleInput(), 'T');
    await user.click(addButton());
    await screen.findByRole('alert');
    expect(screen.getByText('Existing')).toBeInTheDocument();
    expect(currentLocation().path).toBe('/?status=active');
  });

  it('a failure after a success replaces the confirmation with the alert, and a later success clears the alert', async () => {
    vi.mocked(api.createTask).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR'));
    const { user } = await renderReady();
    await user.type(titleInput(), 'T');
    await user.click(addButton());
    await screen.findByRole('alert');
    await user.click(addButton());
    expect(formAlert()).not.toBeInTheDocument();
    expect(addStatus()).toHaveTextContent(/^Task added\.$/);
  });
});

describe('session handling', () => {
  it('401 shows no form message and no confirmation; values kept, button re-enabled, no focus move', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.createTask).mockReturnValue(pending.promise);
    const { user } = await renderReady();
    await user.type(titleInput(), 'Keep me');
    await user.click(descriptionInput());
    await user.click(addButton());
    await act(async () =>
      pending.reject(new ApiError(401, 'UNAUTHORIZED', 'Invalid or expired token')),
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(addStatus()).toBeEmptyDOMElement();
    expect(titleInput()).toHaveValue('Keep me');
    expect(addButton()).toBeEnabled();
    expect(titleInput()).not.toHaveFocus();
    expect(api.listTasks).toHaveBeenCalledOnce();
  });

  it('after a 401 the global handling redirects to /login keeping the filter', async () => {
    vi.mocked(api.createTask).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED'));
    const { user } = await renderReady(['/?status=active']);
    await user.type(titleInput(), 'T');
    await user.click(addButton());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    act(() => {
      for (const listener of unauthorizedListeners) listener();
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
    expect(currentLocation()).toMatchObject({
      path: '/login',
      state: { from: { pathname: '/', search: '?status=active' } },
    });
  });

  async function logoutAndLoginAsBob(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    vi.mocked(api.login).mockResolvedValue(BOB);
    await user.type(screen.getByLabelText('Email'), BOB.email);
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByText('Signed in as bob@example.com');
  }

  it('drafts, errors and confirmation of one user are not visible to the next user', async () => {
    vi.mocked(api.createTask).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR'));
    const { user } = await renderReady();
    await user.type(titleInput(), 'Ann secret draft');
    await user.type(descriptionInput(), 'Ann secret details');
    await user.click(addButton());
    await screen.findByRole('alert');

    await logoutAndLoginAsBob(user);
    expect(titleInput()).toHaveValue('');
    expect(descriptionInput()).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(addStatus()).toBeEmptyDOMElement();
    expect(addButton()).toBeEnabled();
    expect(screen.queryByText(/Ann secret/)).not.toBeInTheDocument();
  });

  it('a success confirmation from the first session is gone for the next user', async () => {
    const { user } = await renderReady();
    await user.type(titleInput(), 'Ann task');
    await user.click(addButton());
    expect(addStatus()).toHaveTextContent('Task added.');
    await logoutAndLoginAsBob(user);
    expect(addStatus()).toBeEmptyDOMElement();
  });

  it('a response that arrives after logout and the next login does not leak into the new form', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.createTask).mockReturnValue(pending.promise);
    const { user } = await renderReady();
    await user.type(titleInput(), 'Ann slow task');
    await user.click(addButton());

    await logoutAndLoginAsBob(user);
    const callsBefore = vi.mocked(api.listTasks).mock.calls.length;
    await act(async () => pending.resolve(task(1, { title: 'Ann slow task' })));

    expect(addStatus()).toBeEmptyDOMElement();
    expect(titleInput()).toHaveValue('');
    expect(titleInput()).not.toHaveFocus();
    expect(addButton()).toBeEnabled();
    expect(vi.mocked(api.listTasks).mock.calls).toHaveLength(callsBefore);
    expect(screen.queryByText('Ann slow task')).not.toBeInTheDocument();
  });

  it('a failure that arrives after logout shows nothing to the next user', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.createTask).mockReturnValue(pending.promise);
    const { user } = await renderReady();
    await user.type(titleInput(), 'Ann slow task');
    await user.click(addButton());
    await logoutAndLoginAsBob(user);
    await act(async () => pending.reject(new ApiError(500, 'INTERNAL_ERROR')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(titleInput()).not.toHaveFocus();
  });
});

describe('refetch failure after a successful add', () => {
  it('shows the list error state, not an add failure; form stays cleared and confirmation stays', async () => {
    const { user } = await renderReady();
    vi.mocked(api.listTasks).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR'));
    await user.type(titleInput(), 'Saved task');
    await user.click(addButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Error: Could not load your tasks.');
    expect(addSection()).not.toContainElement(alert);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(formAlert()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    expect(titleInput()).toHaveValue('');
    expect(descriptionInput()).toHaveValue('');
    expect(addStatus()).toHaveTextContent(/^Task added\.$/);
    expect(addButton()).toBeEnabled();
    expect(api.createTask).toHaveBeenCalledOnce();
  });

  it('Try again after the refetch failure reloads the list without re-adding the task', async () => {
    const { user } = await renderReady();
    vi.mocked(api.listTasks).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR'));
    await user.type(titleInput(), 'Saved task');
    await user.click(addButton());
    await screen.findByRole('alert');

    vi.mocked(api.listTasks).mockResolvedValueOnce([task(99, { title: 'Saved task' })]);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Saved task')).toBeInTheDocument();
    expect(api.createTask).toHaveBeenCalledOnce();
    expect(addStatus()).toHaveTextContent('Task added.');
  });

  it('a network failure on the refetch is not reported with the network message in the form', async () => {
    const { user } = await renderReady();
    vi.mocked(api.listTasks).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR'));
    await user.type(titleInput(), 'Saved task');
    await user.click(addButton());
    await screen.findByRole('alert');
    expect(screen.queryByText(NETWORK_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByText(GENERIC_MESSAGE)).not.toBeInTheDocument();
  });
});

describe('two adds in a row', () => {
  it('ends with the list from the last reload (a stale list response is dropped)', async () => {
    const { user } = await renderReady();
    const first = deferred<Task[]>();
    const second = deferred<Task[]>();
    vi.mocked(api.listTasks).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await user.type(titleInput(), 'One');
    await user.click(addButton());
    await user.type(titleInput(), 'Two');
    await user.click(addButton());

    await act(async () => second.resolve([task(2, { title: 'Two' }), task(1, { title: 'One' })]));
    await act(async () => first.resolve([task(1, { title: 'One' })]));
    expect(listStatus()).toHaveTextContent('2 tasks');
    expect(screen.getByText('Two')).toBeInTheDocument();
  });
});
