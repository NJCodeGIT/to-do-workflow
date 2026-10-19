// Inline edit form and its wiring in TaskItem / TaskList / TasksView (S-009, docs/UI_SPEC.md
// "Edit task (S-009)", decisions #54-#57). api.ts is mocked; the whole app is rendered so the
// real list, filter, add form, router and auth provider are involved.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate, type InitialEntry } from 'react-router-dom';
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

/**
 * Every listTasks call answers with a NEW array (like the real api.ts mapping does). A shared
 * array instance would let the derived editing id survive a reload, which cannot happen in
 * production.
 */
function setTasks(...tasks: Task[]) {
  vi.mocked(api.listTasks).mockImplementation(async () => tasks.map((t) => ({ ...t })));
}

let unauthorizedListeners: Array<() => void> = [];

beforeEach(() => {
  vi.resetAllMocks();
  unauthorizedListeners = [];
  vi.mocked(api.getCurrentUser).mockReturnValue(ANN);
  setTasks();
  vi.mocked(api.createTask).mockResolvedValue(task(99));
  vi.mocked(api.updateTask).mockResolvedValue(task(1));
  vi.mocked(api.onUnauthorized).mockImplementation((listener) => {
    unauthorizedListeners.push(listener);
    return () => {
      unauthorizedListeners = unauthorizedListeners.filter((l) => l !== listener);
    };
  });
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

/** Render the home page with these tasks and wait until the first one is shown. */
async function renderList(tasks: Task[], initialEntries?: InitialEntry[]) {
  setTasks(...tasks);
  const view = renderHome(initialEntries);
  await screen.findByText(tasks[0]!.title);
  return view;
}

type User = ReturnType<typeof userEvent.setup>;

const editButton = (title: string) => screen.getByRole('button', { name: `Edit ${title}` });
const editForm = () => screen.getByRole('form', { name: 'Edit task' });
const queryEditForm = () => screen.queryByRole('form', { name: 'Edit task' });
const editTitle = () => within(editForm()).getByLabelText('Title');
const editDescription = () => within(editForm()).getByLabelText('Description (optional)');
const saveButton = () => within(editForm()).getByRole('button', { name: /^(Save|Saving\.\.\.)$/ });
const cancelButton = () => within(editForm()).getByRole('button', { name: 'Cancel' });
const addSection = () => screen.getByRole('region', { name: 'Add a task' });
const addTitle = () => within(addSection()).getByLabelText('Title');
const addButton = () =>
  within(addSection()).getByRole('button', { name: /^(Add task|Adding\.\.\.)$/ });
const addStatus = () => within(addSection()).getByRole('status');
const outsideRegions = () =>
  screen.getAllByRole('status').filter((el) => !addSection().contains(el));
// Region order outside the add form: list results, then the edit confirmation (S-009).
const listStatus = () => outsideRegions()[0]!;
const editStatus = () => {
  const regions = outsideRegions();
  expect(regions).toHaveLength(2);
  return regions[1]!;
};
const filterButton = (name: string) => screen.getByRole('button', { name });
const editAlert = () => screen.queryByText(/^Error: This task no longer exists\.$/);
const formAlert = () => within(editForm()).queryByRole('alert');

async function openEditor(user: User, title: string) {
  await user.click(editButton(title));
  return editForm();
}

async function replaceTitle(user: User, value: string) {
  await user.clear(editTitle());
  await user.click(editTitle());
  await user.paste(value);
}

async function replaceDescription(user: User, value: string) {
  await user.clear(editDescription());
  if (value !== '') {
    await user.click(editDescription());
    await user.paste(value);
  }
}

const lastPatch = () => vi.mocked(api.updateTask).mock.calls.at(-1)![1];

describe('Edit button', () => {
  it('is on every item and its accessible name includes the task title', async () => {
    await renderList([task(1, { title: 'Buy milk' }), task(2, { title: 'Call Bob' })]);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    for (const item of items) expect(within(item).getAllByRole('button')).toHaveLength(1);
    expect(editButton('Buy milk')).toHaveTextContent(/^Edit$/);
    expect(editButton('Call Bob')).toHaveAttribute('type', 'button');
    expect(editButton('Buy milk')).toHaveAttribute('id', 'task-1-edit');
    expect(editButton('Buy milk')).toHaveAttribute('aria-labelledby', 'task-1-edit task-1-title');
  });

  it('works for Active and for Completed tasks', async () => {
    await renderList([
      task(1, { title: 'Open one' }),
      task(2, {
        title: 'Done one',
        status: 'completed',
        completedAt: '2026-01-02T10:00:00.000Z',
      }),
    ]);
    expect(editButton('Open one')).toBeEnabled();
    expect(editButton('Done one')).toBeEnabled();
    const user = userEvent.setup();
    await user.click(editButton('Done one'));
    expect(editTitle()).toHaveValue('Done one');
  });

  it('opens by keyboard: Enter and Space on the focused button', async () => {
    const { user } = await renderList([task(1), task(2)]);
    editButton('Task 1').focus();
    await user.keyboard('{Enter}');
    expect(editTitle()).toHaveValue('Task 1');
    await user.keyboard('{Escape}');
    expect(editButton('Task 1')).toHaveFocus();
    await user.keyboard(' ');
    expect(editTitle()).toHaveValue('Task 1');
  });

  it('is disabled for every other task while one form is open, enabled again after closing', async () => {
    const { user } = await renderList([task(1), task(2), task(3)]);
    await openEditor(user, 'Task 2');
    expect(editButton('Task 1')).toBeDisabled();
    expect(editButton('Task 3')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Edit Task 2' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('form', { name: 'Edit task' })).toHaveLength(1);

    await user.click(cancelButton());
    expect(editButton('Task 1')).toBeEnabled();
    expect(editButton('Task 2')).toBeEnabled();
    expect(editButton('Task 3')).toBeEnabled();
  });

  it('clicking a disabled Edit button opens nothing', async () => {
    const { user } = await renderList([task(1), task(2)]);
    await openEditor(user, 'Task 1');
    await user.click(editButton('Task 2'));
    expect(screen.getAllByRole('form', { name: 'Edit task' })).toHaveLength(1);
    expect(editTitle()).toHaveValue('Task 1');
  });
});

describe('form structure, pre-fill and accessibility', () => {
  it('replaces the item content in the same li; labelled fields; noValidate; no autofocus attrs', async () => {
    const { user } = await renderList([task(1, { title: 'Old', description: 'Old details' })]);
    await openEditor(user, 'Old');
    const item = screen.getByRole('listitem');
    expect(item).toContainElement(editForm());
    expect(editForm()).toHaveAttribute('novalidate');
    expect(within(item).queryByText('Active')).not.toBeInTheDocument();
    expect(editTitle()).toHaveAttribute('id', 'task-1-edit-title');
    expect(editTitle()).toHaveAttribute('type', 'text');
    expect(editDescription().tagName).toBe('TEXTAREA');
    expect(editDescription()).toHaveAttribute('id', 'task-1-edit-description');
    for (const field of [editTitle(), editDescription()]) {
      expect(field).not.toBeRequired();
      expect(field).not.toHaveAttribute('maxlength');
      expect(field).not.toHaveAttribute('autofocus');
      expect(field).not.toHaveAttribute('aria-invalid');
      expect(field).not.toHaveAttribute('aria-describedby');
    }
    expect(saveButton()).toHaveAttribute('type', 'submit');
    expect(saveButton()).toHaveTextContent('Save');
    expect(cancelButton()).toHaveAttribute('type', 'button');
  });

  it('is pre-filled with title and description; null description gives an empty textarea', async () => {
    const { user } = await renderList([
      task(1, { title: 'With text', description: 'Line 1\nLine 2' }),
      task(2, { title: 'No text', description: null }),
    ]);
    await openEditor(user, 'With text');
    expect(editTitle()).toHaveValue('With text');
    expect(editDescription()).toHaveValue('Line 1\nLine 2');
    await user.click(cancelButton());
    await openEditor(user, 'No text');
    expect(editTitle()).toHaveValue('No text');
    expect(editDescription()).toHaveValue('');
  });

  it('moves focus to the title with the caret at the end', async () => {
    const { user } = await renderList([task(1, { title: 'Caret test' })]);
    await openEditor(user, 'Caret test');
    expect(editTitle()).toHaveFocus();
    const input = editTitle() as HTMLInputElement;
    expect(input.selectionStart).toBe('Caret test'.length);
    expect(input.selectionEnd).toBe('Caret test'.length);
  });

  it('Tab order is Title, Description, Save, Cancel', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    expect(editTitle()).toHaveFocus();
    await user.tab();
    expect(editDescription()).toHaveFocus();
    await user.tab();
    expect(saveButton()).toHaveFocus();
    await user.tab();
    expect(cancelButton()).toHaveFocus();
  });

  it('sets no tabindex above 0 anywhere in the form', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    for (const el of editForm().querySelectorAll('[tabindex]')) {
      expect(Number(el.getAttribute('tabindex'))).toBeLessThanOrEqual(0);
    }
  });

  it('is not shown until Edit is pressed and the add form keeps its own labels and ids', async () => {
    await renderList([task(1)]);
    expect(queryEditForm()).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(editButton('Task 1'));
    expect(addTitle()).toHaveAttribute('id', 'add-task-title');
    expect(editTitle()).not.toBe(addTitle());
  });

  it('does not leave an alert or a field error behind on open', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(editStatus()).toBeEmptyDOMElement();
  });
});

describe('validation on Save only', () => {
  it('shows nothing while typing, even an invalid value', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.clear(editTitle());
    expect(screen.queryByText('Enter a title.')).not.toBeInTheDocument();
    expect(editTitle()).not.toHaveAttribute('aria-invalid');
  });

  it('empty title: message, aria wiring, focus on title, nothing sent, form stays open', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.clear(editTitle());
    await user.click(saveButton());

    expect(screen.getByText('Enter a title.')).toHaveAttribute('id', 'task-1-edit-title-error');
    expect(editTitle()).toHaveAttribute('aria-invalid', 'true');
    expect(editTitle()).toHaveAttribute('aria-describedby', 'task-1-edit-title-error');
    expect(editTitle()).toHaveFocus();
    expect(editDescription()).not.toHaveAttribute('aria-invalid');
    expect(api.updateTask).not.toHaveBeenCalled();
    expect(api.listTasks).toHaveBeenCalledOnce();
    expect(formAlert()).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it('whitespace-only title is treated as empty', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.clear(editTitle());
    await user.type(editTitle(), '   ');
    await user.click(saveButton());
    expect(screen.getByText('Enter a title.')).toBeInTheDocument();
    expect(editTitle()).toHaveValue('   ');
    expect(api.updateTask).not.toHaveBeenCalled();
  });

  it('title of 201 characters is rejected and the value is kept', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await replaceTitle(user, 'x'.repeat(201));
    await user.click(saveButton());
    expect(screen.getByText('Title must be at most 200 characters.')).toBeInTheDocument();
    expect(editTitle()).toHaveFocus();
    expect(editTitle()).toHaveValue('x'.repeat(201));
    expect(api.updateTask).not.toHaveBeenCalled();
  });

  it('description of 2001 characters: message, aria wiring, focus on the description', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await replaceDescription(user, 'd'.repeat(2001));
    await user.click(saveButton());
    expect(screen.getByText('Description must be at most 2000 characters.')).toHaveAttribute(
      'id',
      'task-1-edit-description-error',
    );
    expect(editDescription()).toHaveAttribute('aria-invalid', 'true');
    expect(editDescription()).toHaveAttribute('aria-describedby', 'task-1-edit-description-error');
    expect(editDescription()).toHaveFocus();
    expect(editTitle()).not.toHaveAttribute('aria-invalid');
    expect(api.updateTask).not.toHaveBeenCalled();
  });

  it('both invalid: both messages and focus on the title first', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.clear(editTitle());
    await replaceDescription(user, 'd'.repeat(2001));
    await user.click(saveButton());
    expect(screen.getByText('Enter a title.')).toBeInTheDocument();
    expect(screen.getByText('Description must be at most 2000 characters.')).toBeInTheDocument();
    expect(editTitle()).toHaveFocus();
  });

  it('accepts exactly 200 title and 2000 description characters after trim', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    const title = 'x'.repeat(200);
    const description = 'y'.repeat(2000);
    await replaceTitle(user, ` ${title} `);
    await replaceDescription(user, ` ${description} `);
    await user.click(saveButton());
    expect(screen.queryByText(/must be at most/)).not.toBeInTheDocument();
    expect(api.updateTask).toHaveBeenCalledExactlyOnceWith(1, { title, description });
  });

  it('editing a field removes only that field error; the next Save re-validates', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.clear(editTitle());
    await replaceDescription(user, 'd'.repeat(2001));
    await user.click(saveButton());
    expect(screen.getByText('Enter a title.')).toBeInTheDocument();

    await user.type(editTitle(), 'A');
    expect(screen.queryByText('Enter a title.')).not.toBeInTheDocument();
    expect(editTitle()).not.toHaveAttribute('aria-invalid');
    expect(editTitle()).not.toHaveAttribute('aria-describedby');
    expect(screen.getByText('Description must be at most 2000 characters.')).toBeInTheDocument();

    await user.click(saveButton());
    expect(editDescription()).toHaveFocus();
    expect(api.updateTask).not.toHaveBeenCalled();
  });

  it('an invalid Save clears an earlier form-level error', async () => {
    vi.mocked(api.updateTask).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR'));
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), ' changed');
    await user.click(saveButton());
    await within(editForm()).findByRole('alert');
    await user.clear(editTitle());
    await user.click(saveButton());
    expect(formAlert()).not.toBeInTheDocument();
    expect(screen.getByText('Enter a title.')).toBeInTheDocument();
  });

  it('a valid Save clears earlier field errors before the request is sent', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.updateTask).mockReturnValue(pending.promise);
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.clear(editTitle());
    await user.click(saveButton());
    expect(screen.getByText('Enter a title.')).toBeInTheDocument();
    await user.type(editTitle(), 'Fixed');
    await user.click(saveButton());
    expect(screen.queryByText('Enter a title.')).not.toBeInTheDocument();
    expect(api.updateTask).toHaveBeenCalledOnce();
    await act(async () => pending.resolve(task(1)));
  });
});

describe('request payload (changed fields only)', () => {
  it('title only: sends just the trimmed title, no description key, no status', async () => {
    const { user } = await renderList([task(1, { title: 'Old', description: 'Keep' })]);
    await openEditor(user, 'Old');
    await replaceTitle(user, '  New title  ');
    await user.click(saveButton());
    expect(api.updateTask).toHaveBeenCalledOnce();
    const [id, patch] = vi.mocked(api.updateTask).mock.calls[0]!;
    expect(id).toBe(1);
    expect(patch).toEqual({ title: 'New title' });
    expect(Object.keys(patch)).toEqual(['title']);
  });

  it('description only: sends just the trimmed description and keeps inner line breaks', async () => {
    const { user } = await renderList([task(1, { title: 'Old', description: null })]);
    await openEditor(user, 'Old');
    await user.type(editDescription(), '  2 litres{Enter}full fat  ');
    await user.click(saveButton());
    expect(api.updateTask).toHaveBeenCalledExactlyOnceWith(1, {
      description: '2 litres\nfull fat',
    });
  });

  it('both fields: sends both', async () => {
    const { user } = await renderList([task(1, { title: 'Old', description: 'old d' })]);
    await openEditor(user, 'Old');
    await replaceTitle(user, 'New');
    await replaceDescription(user, 'new d');
    await user.click(saveButton());
    expect(api.updateTask).toHaveBeenCalledExactlyOnceWith(1, {
      title: 'New',
      description: 'new d',
    });
  });

  it('clearing the description sends description: null (not an empty string)', async () => {
    const { user } = await renderList([task(1, { title: 'Old', description: 'Remove me' })]);
    await openEditor(user, 'Old');
    await replaceDescription(user, '');
    await user.click(saveButton());
    expect(api.updateTask).toHaveBeenCalledExactlyOnceWith(1, { description: null });
    expect(lastPatch()).not.toHaveProperty('title');
  });

  it('a whitespace-only description over existing text also sends null', async () => {
    const { user } = await renderList([task(1, { title: 'Old', description: 'Remove me' })]);
    await openEditor(user, 'Old');
    await replaceDescription(user, '   ');
    await user.click(saveButton());
    expect(api.updateTask).toHaveBeenCalledExactlyOnceWith(1, { description: null });
  });

  it('a case-only title change counts as a change', async () => {
    const { user } = await renderList([task(1, { title: 'buy milk' })]);
    await openEditor(user, 'buy milk');
    await replaceTitle(user, 'Buy milk');
    await user.click(saveButton());
    expect(api.updateTask).toHaveBeenCalledExactlyOnceWith(1, { title: 'Buy milk' });
  });

  it('never sends status, id, user id or timestamps, also for a Completed task', async () => {
    const { user } = await renderList([
      task(7, {
        title: 'Done',
        status: 'completed',
        completedAt: '2026-01-02T10:00:00.000Z',
      }),
    ]);
    await openEditor(user, 'Done');
    await replaceTitle(user, 'Done and edited');
    await user.click(saveButton());
    const [id, patch] = vi.mocked(api.updateTask).mock.calls[0]!;
    expect(id).toBe(7);
    expect(patch).toEqual({ title: 'Done and edited' });
    expect(Object.keys(patch)).not.toContain('status');
    expect(Object.keys(patch)).not.toContain('completedAt');
    expect(Object.keys(patch)).not.toContain('userId');
  });

  it('sends the id of the task being edited when it is not the first one', async () => {
    const { user } = await renderList([task(1), task(2), task(3)]);
    await openEditor(user, 'Task 3');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    expect(api.updateTask).toHaveBeenCalledExactlyOnceWith(3, { title: 'Task 3!' });
  });
});

describe('unchanged save', () => {
  it('closes with no request and no message, and focuses that task Edit button', async () => {
    const { user } = await renderList([task(1), task(2)]);
    await openEditor(user, 'Task 2');
    await user.click(saveButton());

    expect(api.updateTask).not.toHaveBeenCalled();
    expect(api.listTasks).toHaveBeenCalledOnce();
    expect(queryEditForm()).not.toBeInTheDocument();
    expect(editStatus()).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(editButton('Task 2')).toHaveFocus();
    expect(editButton('Task 1')).toBeEnabled();
  });

  it('a whitespace-only change (padding added around both fields) counts as unchanged', async () => {
    const { user } = await renderList([task(1, { title: 'Same', description: 'Same d' })]);
    await openEditor(user, 'Same');
    await user.type(editTitle(), '   ');
    await user.type(editDescription(), '  ');
    await user.click(saveButton());
    expect(api.updateTask).not.toHaveBeenCalled();
    expect(queryEditForm()).not.toBeInTheDocument();
    expect(editButton('Same')).toHaveFocus();
  });

  it('Enter in the title with nothing changed closes the form too', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.keyboard('{Enter}');
    expect(api.updateTask).not.toHaveBeenCalled();
    expect(queryEditForm()).not.toBeInTheDocument();
    expect(editButton('Task 1')).toHaveFocus();
  });

  it('an unchanged save shows no new "Task updated." (opening an Edit cleared the old one)', async () => {
    const { user } = await renderList([task(1), task(2)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), 'x');
    await user.click(saveButton());
    await waitFor(() => expect(editStatus()).toHaveTextContent('Task updated.'));
    await openEditor(user, 'Task 2'); // opening clears the confirmation
    expect(editStatus()).toBeEmptyDOMElement();
    await user.click(saveButton());
    expect(editStatus()).toBeEmptyDOMElement();
    expect(api.updateTask).toHaveBeenCalledOnce();
  });
});

describe('no double submit', () => {
  it('shows "Saving..." with Save and Cancel disabled; the inputs stay editable', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.updateTask).mockReturnValue(pending.promise);
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());

    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent('Saving...');
    expect(within(editForm()).queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(cancelButton()).toBeDisabled();
    expect(editTitle()).toBeEnabled();
    expect(editDescription()).toBeEnabled();
    await act(async () => pending.resolve(task(1)));
  });

  it('a second click, repeated Enter and raw submit events send one request', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.updateTask).mockReturnValue(pending.promise);
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');
    await user.click(saveButton());
    // The guard is a ref flag, not only `disabled`: a submit event must also be ignored.
    fireEvent.submit(editForm());
    fireEvent.submit(editForm());

    expect(api.updateTask).toHaveBeenCalledOnce();
    await act(async () => pending.resolve(task(1)));
    expect(api.updateTask).toHaveBeenCalledOnce();
    await waitFor(() => expect(api.listTasks).toHaveBeenCalledTimes(2)); // initial + one reload
  });

  it('a submit event while saving does not validate, even if the field was emptied', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.updateTask).mockReturnValue(pending.promise);
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    await user.clear(editTitle());
    fireEvent.submit(editForm());
    expect(screen.queryByText('Enter a title.')).not.toBeInTheDocument();
    expect(api.updateTask).toHaveBeenCalledOnce();
    await act(async () => pending.resolve(task(1)));
  });

  it('Escape and a click on the disabled Cancel are ignored in flight; the request still completes', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.updateTask).mockReturnValue(pending.promise);
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());

    await user.keyboard('{Escape}');
    fireEvent.keyDown(editTitle(), { key: 'Escape' });
    await user.click(cancelButton());
    expect(editForm()).toBeInTheDocument();
    expect(saveButton()).toHaveTextContent('Saving...');

    await act(async () => pending.resolve(task(1)));
    expect(queryEditForm()).not.toBeInTheDocument();
    expect(editStatus()).toHaveTextContent('Task updated.');
    expect(api.updateTask).toHaveBeenCalledOnce();
  });

  it('the payload is the one sent at Save; typing while saving does not change it', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.updateTask).mockReturnValue(pending.promise);
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    await user.type(editTitle(), 'more');
    await act(async () => pending.resolve(task(1)));
    expect(api.updateTask).toHaveBeenCalledExactlyOnceWith(1, { title: 'Task 1!' });
  });

  it('can save again after a failure', async () => {
    vi.mocked(api.updateTask).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR'));
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    await within(editForm()).findByRole('alert');
    expect(saveButton()).toBeEnabled();
    expect(saveButton()).toHaveTextContent('Save');
    await user.click(saveButton());
    expect(api.updateTask).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(queryEditForm()).not.toBeInTheDocument());
  });
});

describe('success', () => {
  it('closes the form, announces "Task updated." in its own region, refetches and focuses that Edit button', async () => {
    const { user } = await renderList([task(1, { title: 'Old' }), task(2)]);
    await openEditor(user, 'Old');
    await replaceTitle(user, 'New');
    setTasks(task(1, { title: 'New' }), task(2));
    await user.click(saveButton());

    expect(await screen.findByRole('button', { name: 'Edit New' })).toBeInTheDocument();
    expect(queryEditForm()).not.toBeInTheDocument();
    expect(editStatus()).toHaveTextContent(/^Task updated\.$/);
    expect(api.listTasks).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.listTasks).mock.calls).toEqual([['all'], ['all']]);
    await waitFor(() => expect(editButton('New')).toHaveFocus());
    expect(editButton('Task 2')).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(listStatus()).toHaveTextContent('2 tasks');
  });

  it('shows what the refetch returns, not the PATCH response', async () => {
    vi.mocked(api.updateTask).mockResolvedValue(task(1, { title: 'From PATCH' }));
    const { user } = await renderList([task(1, { title: 'Old' })]);
    await openEditor(user, 'Old');
    await user.type(editTitle(), '!');
    setTasks(task(1, { title: 'From refetch' }));
    await user.click(saveButton());
    expect(await screen.findByText('From refetch')).toBeInTheDocument();
    expect(screen.queryByText('From PATCH')).not.toBeInTheDocument();
  });

  it('the list shows Loading while the refetch is pending, "Task updated." is already there', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    const refetch = deferred<Task[]>();
    vi.mocked(api.listTasks).mockReturnValueOnce(refetch.promise);
    await user.click(saveButton());
    expect(listStatus()).toHaveTextContent('Loading tasks...');
    expect(editStatus()).toHaveTextContent('Task updated.');
    expect(queryEditForm()).not.toBeInTheDocument();
    await act(async () => refetch.resolve([task(1, { title: 'Task 1!' })]));
    expect(listStatus()).toHaveTextContent('1 task');
    await waitFor(() => expect(editButton('Task 1!')).toHaveFocus());
  });

  it('keeps the filter and the URL (Active)', async () => {
    const { user } = await renderList([task(1)], ['/?status=active']);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    await waitFor(() => expect(editStatus()).toHaveTextContent('Task updated.'));
    expect(currentLocation().path).toBe('/?status=active');
    expect(filterButton('Active')).toHaveAttribute('aria-pressed', 'true');
    expect(vi.mocked(api.listTasks).mock.calls).toEqual([['active'], ['active']]);
  });

  it('keeps the filter and the URL (Completed) and the task stays in the list', async () => {
    const done = task(1, {
      title: 'Done',
      status: 'completed',
      completedAt: '2026-01-02T10:00:00.000Z',
    });
    const { user } = await renderList([done], ['/?status=completed']);
    await openEditor(user, 'Done');
    await replaceTitle(user, 'Done 2');
    setTasks({ ...done, title: 'Done 2' });
    await user.click(saveButton());
    expect(await screen.findByText('Done 2')).toBeInTheDocument();
    expect(currentLocation().path).toBe('/?status=completed');
    expect(vi.mocked(api.listTasks).mock.calls).toEqual([['completed'], ['completed']]);
    expect(within(screen.getByRole('list')).getByText('Completed')).toBeInTheDocument();
  });

  it('the confirmation stays when the filter changes later and is cleared when the next Edit opens', async () => {
    const { user } = await renderList([task(1), task(2)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    await waitFor(() => expect(editStatus()).toHaveTextContent(/^Task updated\.$/));
    await user.click(filterButton('Completed'));
    expect(editStatus()).toHaveTextContent(/^Task updated\.$/);
    await user.click(filterButton('All'));
    await screen.findByRole('button', { name: 'Edit Task 2' });
    await user.click(editButton('Task 2'));
    expect(editStatus()).toBeEmptyDOMElement();
  });

  it('a repeated successful save is announced again (region emptied on open)', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), 'a');
    setTasks(task(1, { title: 'Task 1a' }));
    await user.click(saveButton());
    await waitFor(() => expect(editStatus()).toHaveTextContent('Task updated.'));
    await user.click(await screen.findByRole('button', { name: 'Edit Task 1a' }));
    expect(editStatus()).toBeEmptyDOMElement();
    await user.type(editTitle(), 'b');
    await user.click(saveButton());
    await waitFor(() => expect(editStatus()).toHaveTextContent('Task updated.'));
    expect(api.updateTask).toHaveBeenCalledTimes(2);
  });

  it('the edit confirmation is a separate region from the list results and from the add form', async () => {
    const { user } = await renderList([task(1)]);
    expect(editStatus()).not.toBe(listStatus());
    expect(editStatus()).not.toBe(addStatus());
    expect(addSection().contains(editStatus())).toBe(false);
    expect(
      listStatus().compareDocumentPosition(editStatus()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    await waitFor(() => expect(editStatus()).toHaveTextContent('Task updated.'));
    expect(addStatus()).toBeEmptyDOMElement();
  });

  it('"Task added." and "Task updated." live side by side and do not clear each other', async () => {
    const { user } = await renderList([task(1)]);
    await user.type(addTitle(), 'Added');
    await user.click(addButton());
    await waitFor(() => expect(addStatus()).toHaveTextContent('Task added.'));
    await screen.findByText('Task 1');
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    await waitFor(() => expect(editStatus()).toHaveTextContent('Task updated.'));
    expect(addStatus()).toHaveTextContent(/^Task added\.$/);
  });

  it('does not steal focus: a user who moved to the Add form during the refetch keeps it there', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    const refetch = deferred<Task[]>();
    vi.mocked(api.listTasks).mockReturnValueOnce(refetch.promise);
    await user.click(saveButton());
    await user.click(addTitle());
    await act(async () => refetch.resolve([task(1, { title: 'Task 1!' })]));
    expect(addTitle()).toHaveFocus();
    expect(editButton('Task 1!')).not.toHaveFocus();
  });

  it('refetch failure: list error state, "Task updated." stays, focus goes to the pressed filter button', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    vi.mocked(api.listTasks).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR'));
    await user.click(saveButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Error: Could not load your tasks.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(editStatus()).toHaveTextContent('Task updated.');
    expect(filterButton('All')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(filterButton('All')).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(api.updateTask).toHaveBeenCalledOnce();
  });

  it('refetch failure under Active focuses the Active button', async () => {
    const { user } = await renderList([task(1)], ['/?status=active']);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    vi.mocked(api.listTasks).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR'));
    await user.click(saveButton());
    await screen.findByRole('alert');
    await waitFor(() => expect(filterButton('Active')).toHaveFocus());
  });

  it('the task is gone from the refetched list: focus goes to the pressed filter button', async () => {
    const { user } = await renderList([task(1), task(2)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    setTasks(task(2));
    await user.click(saveButton());
    await screen.findByRole('button', { name: 'Edit Task 2' });
    expect(editStatus()).toHaveTextContent('Task updated.');
    await waitFor(() => expect(filterButton('All')).toHaveFocus());
  });
});

describe('keyboard', () => {
  it('Enter in the title saves', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!{Enter}');
    expect(api.updateTask).toHaveBeenCalledExactlyOnceWith(1, { title: 'Task 1!' });
  });

  it('Enter in the description is a newline and does not save', async () => {
    const { user } = await renderList([task(1, { description: 'a' })]);
    await openEditor(user, 'Task 1');
    await user.click(editDescription());
    await user.keyboard('{Enter}b');
    expect(editDescription()).toHaveValue('a\nb');
    expect(api.updateTask).not.toHaveBeenCalled();
    expect(editForm()).toBeInTheDocument();
  });

  it.each([
    ['title', () => editTitle()],
    ['description', () => editDescription()],
    ['Save button', () => saveButton()],
    ['Cancel button', () => cancelButton()],
  ])(
    'Escape in the %s cancels, discards the draft, focuses Edit, sends nothing',
    async (_n, el) => {
      const { user } = await renderList([task(1, { title: 'Orig', description: 'orig d' })]);
      await openEditor(user, 'Orig');
      await user.type(editTitle(), ' draft');
      await user.type(editDescription(), ' draft');
      el().focus();
      await user.keyboard('{Escape}');

      expect(queryEditForm()).not.toBeInTheDocument();
      expect(editButton('Orig')).toHaveFocus();
      expect(api.updateTask).not.toHaveBeenCalled();
      expect(api.listTasks).toHaveBeenCalledOnce();
      expect(editStatus()).toBeEmptyDOMElement();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      // The draft is gone: reopening shows the stored values.
      await user.click(editButton('Orig'));
      expect(editTitle()).toHaveValue('Orig');
      expect(editDescription()).toHaveValue('orig d');
    },
  );

  it('Escape during IME composition does not cancel', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    fireEvent.keyDown(editTitle(), { key: 'Escape', isComposing: true });
    expect(editForm()).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(queryEditForm()).not.toBeInTheDocument();
  });

  it('other keys do not close the form', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.keyboard('abc{Tab}{Shift>}{Tab}{/Shift}');
    expect(editForm()).toBeInTheDocument();
  });

  it('Cancel discards silently: no request, no message, Edit focused and enabled', async () => {
    const { user } = await renderList([task(1), task(2)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), ' draft');
    await user.click(cancelButton());
    expect(queryEditForm()).not.toBeInTheDocument();
    expect(api.updateTask).not.toHaveBeenCalled();
    expect(editStatus()).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(editButton('Task 1')).toHaveFocus();
    expect(editButton('Task 1')).toBeEnabled();
    expect(editButton('Task 2')).toBeEnabled();
    expect(screen.getByText('Task 1')).toBeInTheDocument();
  });

  it('Cancel by keyboard (Enter on the focused button)', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    cancelButton().focus();
    await user.keyboard('{Enter}');
    expect(queryEditForm()).not.toBeInTheDocument();
    expect(editButton('Task 1')).toHaveFocus();
  });

  it('Escape after a failed save also cancels and discards the error', async () => {
    vi.mocked(api.updateTask).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR'));
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    await within(editForm()).findByRole('alert');
    await user.keyboard('{Escape}');
    expect(queryEditForm()).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(editButton('Task 1'));
    expect(formAlert()).not.toBeInTheDocument();
    expect(editTitle()).toHaveValue('Task 1');
  });
});

describe('failures (form stays open, values kept, focus on the title)', () => {
  it('400: shows the server message verbatim in a form-level alert', async () => {
    vi.mocked(api.updateTask).mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'title must be at most 200 characters'),
    );
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), ' new');
    await user.type(editDescription(), 'Keep too');
    await user.click(saveButton());

    const alert = await within(editForm()).findByRole('alert');
    expect(alert.textContent).toBe('Error: title must be at most 200 characters');
    expect(editTitle()).toHaveValue('Task 1 new');
    expect(editDescription()).toHaveValue('Keep too');
    expect(editTitle()).toHaveFocus();
    expect(saveButton()).toBeEnabled();
    expect(saveButton()).toHaveTextContent('Save');
    expect(cancelButton()).toBeEnabled();
    expect(editStatus()).toBeEmptyDOMElement();
    expect(api.listTasks).toHaveBeenCalledOnce(); // no refetch on failure
    expect(editForm()).toBeInTheDocument();
  });

  it.each([
    ['network', new ApiError(0, 'NETWORK_ERROR', 'Network request failed'), NETWORK_MESSAGE],
    ['5xx', new ApiError(500, 'INTERNAL_ERROR', 'Server secret detail'), GENERIC_MESSAGE],
    ['503', new ApiError(503, 'UNAVAILABLE', 'Down'), GENERIC_MESSAGE],
    ['400 with another code', new ApiError(400, 'OTHER', 'raw text'), GENERIC_MESSAGE],
    ['400 with empty message', new ApiError(400, 'VALIDATION_ERROR', ''), GENERIC_MESSAGE],
    ['malformed 200', new ApiError(200, 'UNKNOWN_ERROR'), GENERIC_MESSAGE],
    ['non-ApiError', new TypeError('boom'), GENERIC_MESSAGE],
  ])('%s: fixed text, values kept, focus on title', async (_name, error, message) => {
    vi.mocked(api.updateTask).mockRejectedValue(error);
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), ' new');
    await user.type(editDescription(), 'Keep too');
    await user.click(saveButton());

    const alert = await within(editForm()).findByRole('alert');
    expect(alert.textContent).toBe(`Error: ${message}`);
    expect(alert.textContent).not.toMatch(/secret|raw text|boom|Down/);
    expect(editTitle()).toHaveValue('Task 1 new');
    expect(editDescription()).toHaveValue('Keep too');
    expect(editTitle()).toHaveFocus();
    expect(saveButton()).toBeEnabled();
    expect(api.listTasks).toHaveBeenCalledOnce();
    expect(editStatus()).toBeEmptyDOMElement();
  });

  it('moves focus back to the title even if the user focused the description while saving', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.updateTask).mockReturnValue(pending.promise);
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    await user.click(editDescription());
    await act(async () => pending.reject(new ApiError(0, 'NETWORK_ERROR')));
    expect(editTitle()).toHaveFocus();
  });

  it('the form-level error stays while editing and is removed by the next Save', async () => {
    vi.mocked(api.updateTask).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR'));
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    await within(editForm()).findByRole('alert');
    await user.type(editTitle(), 'x');
    expect(formAlert()).toBeInTheDocument();
    await user.click(saveButton());
    await waitFor(() => expect(queryEditForm()).not.toBeInTheDocument());
  });

  it('a failure does not touch the list, filter, URL or other Edit buttons', async () => {
    vi.mocked(api.updateTask).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR'));
    const { user } = await renderList([task(1), task(2)], ['/?status=active']);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    await within(editForm()).findByRole('alert');
    expect(screen.getByText('Task 2')).toBeInTheDocument();
    expect(currentLocation().path).toBe('/?status=active');
    expect(editButton('Task 2')).toBeDisabled();
  });

  it('no "Task updated." appears after a failure', async () => {
    vi.mocked(api.updateTask).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR'));
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    await within(editForm()).findByRole('alert');
    expect(screen.queryByText('Task updated.')).not.toBeInTheDocument();
  });
});

describe('404: the task no longer exists', () => {
  it('closes the form, refetches, shows the alert and focuses the pressed filter button', async () => {
    const { user } = await renderList([task(1), task(2)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    vi.mocked(api.updateTask).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Task not found'));
    setTasks(task(2));
    await user.click(saveButton());

    expect(await screen.findByText('Error: This task no longer exists.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/^Error: This task no longer exists\.$/);
    expect(queryEditForm()).not.toBeInTheDocument();
    expect(api.listTasks).toHaveBeenCalledTimes(2);
    await screen.findByRole('button', { name: 'Edit Task 2' });
    expect(screen.queryByText('Task 1')).not.toBeInTheDocument();
    expect(editStatus()).toBeEmptyDOMElement();
    expect(screen.queryByText('Task updated.')).not.toBeInTheDocument();
    expect(screen.queryByText('Task not found')).not.toBeInTheDocument();
    await waitFor(() => expect(filterButton('All')).toHaveFocus());
    expect(editButton('Task 2')).toBeEnabled();
  });

  it('the alert is outside the edit form and keeps the filter and URL', async () => {
    vi.mocked(api.updateTask).mockRejectedValue(new ApiError(404, 'NOT_FOUND'));
    const { user } = await renderList([task(1)], ['/?status=active']);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    setTasks();
    await user.click(saveButton());
    await screen.findByText('Error: This task no longer exists.');
    expect(addSection()).not.toContainElement(screen.getByRole('alert'));
    expect(currentLocation().path).toBe('/?status=active');
    await waitFor(() => expect(filterButton('Active')).toHaveFocus());
  });

  it('is cleared when the next Edit opens', async () => {
    vi.mocked(api.updateTask).mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND'));
    const { user } = await renderList([task(1), task(2)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    setTasks(task(2));
    await user.click(saveButton());
    await screen.findByText('Error: This task no longer exists.');
    await screen.findByRole('button', { name: 'Edit Task 2' });
    await user.click(editButton('Task 2'));
    expect(editAlert()).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('is not replaced by a form message and offers no retry', async () => {
    vi.mocked(api.updateTask).mockRejectedValue(new ApiError(404, 'NOT_FOUND'));
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    setTasks();
    await user.click(saveButton());
    await screen.findByText('Error: This task no longer exists.');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.queryByText(GENERIC_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByText(NETWORK_MESSAGE)).not.toBeInTheDocument();
  });

  it('a successful save after a 404 alert replaces the alert with the confirmation', async () => {
    vi.mocked(api.updateTask).mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND'));
    const { user } = await renderList([task(1), task(2)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    setTasks(task(2));
    await user.click(saveButton());
    await screen.findByText('Error: This task no longer exists.');
    await screen.findByRole('button', { name: 'Edit Task 2' });
    await user.click(editButton('Task 2'));
    await user.type(editTitle(), '?');
    await user.click(saveButton());
    await waitFor(() => expect(editStatus()).toHaveTextContent('Task updated.'));
    expect(editAlert()).not.toBeInTheDocument();
  });
});

describe('401', () => {
  it('shows nothing in the form; form stays open, values kept, Save enabled, no focus move', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.updateTask).mockReturnValue(pending.promise);
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    await act(async () =>
      pending.reject(new ApiError(401, 'UNAUTHORIZED', 'Invalid or expired token')),
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(editStatus()).toBeEmptyDOMElement();
    expect(editTitle()).toHaveValue('Task 1!');
    expect(saveButton()).toBeEnabled();
    expect(saveButton()).toHaveTextContent('Save');
    expect(editTitle()).not.toHaveFocus();
    expect(api.listTasks).toHaveBeenCalledOnce();
  });

  it('the global handling then redirects to /login keeping the filter', async () => {
    vi.mocked(api.updateTask).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED'));
    const { user } = await renderList([task(1)], ['/?status=active']);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
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
});

describe('interaction with the rest of the page (draft is discarded, form never reopens)', () => {
  it('a successful Add closes the open form and discards the draft; it does not reopen', async () => {
    const { user } = await renderList([task(1), task(2)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), ' draft');
    await user.type(addTitle(), 'Brand new');
    await user.click(addButton());

    await waitFor(() => expect(addStatus()).toHaveTextContent('Task added.'));
    await screen.findByRole('button', { name: 'Edit Task 1' });
    expect(queryEditForm()).not.toBeInTheDocument();
    expect(editButton('Task 1')).toBeEnabled();
    expect(editButton('Task 2')).toBeEnabled();
    expect(screen.queryByDisplayValue('Task 1 draft')).not.toBeInTheDocument();
    expect(api.updateTask).not.toHaveBeenCalled();
    expect(editStatus()).toBeEmptyDOMElement();
  });

  it('a failed Add leaves the open edit form alone', async () => {
    vi.mocked(api.createTask).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR'));
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), ' draft');
    await user.type(addTitle(), 'Will fail');
    await user.click(addButton());
    await within(addSection()).findByRole('alert');
    expect(editTitle()).toHaveValue('Task 1 draft');
  });

  it('a filter click closes the form and discards the draft; it does not reopen when the list returns', async () => {
    const { user } = await renderList([task(1), task(2)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), ' draft');
    await user.click(filterButton('Active'));
    await screen.findByRole('button', { name: 'Edit Task 1' });
    expect(queryEditForm()).not.toBeInTheDocument();
    expect(currentLocation().path).toBe('/?status=active');
    await user.click(filterButton('All'));
    await screen.findByRole('button', { name: 'Edit Task 1' });
    expect(queryEditForm()).not.toBeInTheDocument();
    await user.click(editButton('Task 1'));
    expect(editTitle()).toHaveValue('Task 1');
  });

  it('pressing the already pressed filter button leaves a list and open form as they are', async () => {
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), ' draft');
    await user.click(filterButton('All'));
    expect(editTitle()).toHaveValue('Task 1 draft');
  });

  it('Back and Forward between filters close the form; it does not reopen', async () => {
    const { user } = await renderList([task(1), task(2)]);
    await user.click(filterButton('Active'));
    await screen.findByRole('button', { name: 'Edit Task 1' });
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), ' draft');

    await user.click(screen.getByRole('button', { name: 'history-back' }));
    await screen.findByRole('button', { name: 'Edit Task 1' });
    expect(currentLocation().path).toBe('/');
    expect(queryEditForm()).not.toBeInTheDocument();

    await openEditor(user, 'Task 2');
    await user.click(screen.getByRole('button', { name: 'history-forward' }));
    await screen.findByRole('button', { name: 'Edit Task 1' });
    expect(currentLocation().path).toBe('/?status=active');
    expect(queryEditForm()).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'history-back' }));
    await screen.findByRole('button', { name: 'Edit Task 1' });
    expect(queryEditForm()).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/draft/)).not.toBeInTheDocument();
  });

  it('a quick filter round trip (before the other filter answers) does not reopen the form', async () => {
    const { user } = await renderList([task(1)], ['/?status=active']);
    await openEditor(user, 'Task 1');
    const pendingAll = deferred<Task[]>();
    const pendingActive = deferred<Task[]>();
    vi.mocked(api.listTasks)
      .mockImplementationOnce(() => pendingAll.promise)
      .mockImplementationOnce(() => pendingActive.promise);

    await user.click(filterButton('All'));
    expect(queryEditForm()).not.toBeInTheDocument();
    await user.click(filterButton('Active'));
    expect(queryEditForm()).not.toBeInTheDocument();
    expect(filterButton('Active')).toHaveFocus();

    await act(async () => pendingActive.resolve([task(1)]));
    await screen.findByRole('button', { name: 'Edit Task 1' });
    expect(queryEditForm()).not.toBeInTheDocument();
    pendingAll.resolve([task(1)]);
  });

  describe('filter round trip before the other filter answers (S-009 fix round 1)', () => {
    /** Records every element that receives focus, to prove the Title is never focused. */
    function recordFocus() {
      const ids: string[] = [];
      const onFocusIn = (event: FocusEvent) => ids.push((event.target as HTMLElement).id);
      document.addEventListener('focusin', onFocusIn);
      return { ids, stop: () => document.removeEventListener('focusin', onFocusIn) };
    }

    /** On /?status=active open Edit on task 1 (with a draft), hold back the next two fetches. */
    async function startRoundTrip() {
      const view = await renderList([task(1), task(2)], ['/?status=active']);
      await openEditor(view.user, 'Task 1');
      await view.user.type(editTitle(), ' draft');
      const pendingAll = deferred<Task[]>();
      const pendingActive = deferred<Task[]>();
      vi.mocked(api.listTasks)
        .mockImplementationOnce(() => pendingAll.promise)
        .mockImplementationOnce(() => pendingActive.promise);
      return { ...view, pendingAll, pendingActive };
    }

    it('returning to the original filter keeps the form closed and focus on the pressed button, never in Title', async () => {
      const { user, pendingAll, pendingActive } = await startRoundTrip();
      const focus = recordFocus();
      try {
        await user.click(filterButton('All'));
        await user.click(filterButton('Active'));
        expect(queryEditForm()).not.toBeInTheDocument();
        expect(screen.queryByDisplayValue(/draft/)).not.toBeInTheDocument();
        expect(filterButton('Active')).toHaveFocus();
        expect(document.activeElement).toBe(filterButton('Active'));

        await act(async () => pendingAll.resolve([task(1), task(2)]));
        expect(queryEditForm()).not.toBeInTheDocument();
        expect(filterButton('Active')).toHaveFocus();
        await act(async () => pendingActive.resolve([task(1), task(2)]));
        await screen.findByRole('button', { name: 'Edit Task 1' });
        expect(queryEditForm()).not.toBeInTheDocument();
        expect(filterButton('Active')).toHaveFocus();
        expect(focus.ids).not.toContain('task-1-edit-title');
        expect(focus.ids).not.toContain('task-1-edit-description');
        expect(currentLocation().path).toBe('/?status=active');
      } finally {
        focus.stop();
      }
    });

    it('the original filter refetch answering afterwards: form still closed, no focus stolen, Edit buttons enabled', async () => {
      const { user, pendingActive } = await startRoundTrip();
      const focus = recordFocus();
      try {
        await user.click(filterButton('All'));
        await user.click(filterButton('Active'));
        await act(async () => pendingActive.resolve([task(1), task(2)]));
        expect(await screen.findByRole('button', { name: 'Edit Task 1' })).toBeEnabled();
        expect(editButton('Task 2')).toBeEnabled();
        expect(queryEditForm()).not.toBeInTheDocument();
        expect(filterButton('Active')).toHaveFocus();
        expect(focus.ids).not.toContain('task-1-edit-title');
        expect(api.updateTask).not.toHaveBeenCalled();
        expect(editStatus()).toBeEmptyDOMElement();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      } finally {
        focus.stop();
      }
    });

    it('a normal reopen still works afterwards: stored values, focus in Title, other Edit buttons disabled', async () => {
      const { user, pendingAll, pendingActive } = await startRoundTrip();
      await user.click(filterButton('All'));
      await user.click(filterButton('Active'));
      await act(async () => pendingActive.resolve([task(1), task(2)]));
      await screen.findByRole('button', { name: 'Edit Task 1' });
      await act(async () => pendingAll.resolve([task(1), task(2)]));
      expect(queryEditForm()).not.toBeInTheDocument();

      await user.click(editButton('Task 1'));
      expect(editForm()).toBeInTheDocument();
      expect(editTitle()).toHaveValue('Task 1'); // draft was discarded
      expect(editTitle()).toHaveFocus();
      expect(editButton('Task 2')).toBeDisabled();

      // and it can be saved
      await user.type(editTitle(), '!');
      await user.click(saveButton());
      expect(api.updateTask).toHaveBeenCalledExactlyOnceWith(1, { title: 'Task 1!' });
      await waitFor(() => expect(editStatus()).toHaveTextContent('Task updated.'));
      expect(queryEditForm()).not.toBeInTheDocument();
    });

    it('Back and Forward variant: returning before the other fetch answers does not reopen the form or move focus', async () => {
      const { user } = await renderList([task(1), task(2)]);
      await user.click(filterButton('Active'));
      await screen.findByRole('button', { name: 'Edit Task 1' });
      await openEditor(user, 'Task 1');
      await user.type(editTitle(), ' draft');

      const pendingAll = deferred<Task[]>();
      const pendingActive = deferred<Task[]>();
      vi.mocked(api.listTasks)
        .mockImplementationOnce(() => pendingAll.promise)
        .mockImplementationOnce(() => pendingActive.promise);
      const focus = recordFocus();
      try {
        await user.click(screen.getByRole('button', { name: 'history-back' }));
        expect(currentLocation().path).toBe('/');
        expect(queryEditForm()).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'history-forward' }));
        expect(currentLocation().path).toBe('/?status=active');
        expect(queryEditForm()).not.toBeInTheDocument();
        expect(screen.queryByDisplayValue(/draft/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'history-forward' })).toHaveFocus();

        await act(async () => pendingActive.resolve([task(1), task(2)]));
        await screen.findByRole('button', { name: 'Edit Task 1' });
        expect(queryEditForm()).not.toBeInTheDocument();
        await act(async () => pendingAll.resolve([task(1), task(2)]));
        expect(queryEditForm()).not.toBeInTheDocument();
        expect(focus.ids).not.toContain('task-1-edit-title');
        expect(screen.getByRole('button', { name: 'history-forward' })).toHaveFocus();

        await user.click(editButton('Task 1'));
        expect(editTitle()).toHaveValue('Task 1');
      } finally {
        focus.stop();
      }
    });

    it('started while a save is in flight: the late save result neither closes, reloads nor reopens anything', async () => {
      const pendingSave = deferred<Task>();
      vi.mocked(api.updateTask).mockReturnValue(pendingSave.promise);
      const { user } = await renderList([task(1), task(2)], ['/?status=active']);
      await openEditor(user, 'Task 1');
      await user.type(editTitle(), '!');
      await user.click(saveButton());
      expect(saveButton()).toHaveTextContent('Saving...');

      const pendingAll = deferred<Task[]>();
      const pendingActive = deferred<Task[]>();
      vi.mocked(api.listTasks)
        .mockImplementationOnce(() => pendingAll.promise)
        .mockImplementationOnce(() => pendingActive.promise);
      const focus = recordFocus();
      try {
        await user.click(filterButton('All'));
        await user.click(filterButton('Active'));
        expect(queryEditForm()).not.toBeInTheDocument();
        const calls = vi.mocked(api.listTasks).mock.calls.length;

        // The save answers while both fetches are still held back.
        await act(async () => pendingSave.resolve(task(1, { title: 'Task 1!' })));
        expect(queryEditForm()).not.toBeInTheDocument();
        expect(editStatus()).toBeEmptyDOMElement();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(vi.mocked(api.listTasks).mock.calls).toHaveLength(calls); // no reload
        expect(filterButton('Active')).toHaveFocus();

        await act(async () => pendingActive.resolve([task(1), task(2)]));
        await screen.findByRole('button', { name: 'Edit Task 2' });
        await act(async () => pendingAll.resolve([task(1), task(2)]));
        expect(queryEditForm()).not.toBeInTheDocument();
        expect(editStatus()).toBeEmptyDOMElement();
        expect(vi.mocked(api.listTasks).mock.calls).toHaveLength(calls);
        expect(api.updateTask).toHaveBeenCalledOnce();
        expect(filterButton('Active')).toHaveFocus();
        expect(focus.ids).not.toContain('task-1-edit-title');
        expect(editButton('Task 1')).toBeEnabled();
        expect(editButton('Task 2')).toBeEnabled();
      } finally {
        focus.stop();
      }
    });
  });

  it('opening the form does not change the URL or refetch', async () => {
    const { user } = await renderList([task(1)], ['/?status=completed']);
    const before = currentLocation().path;
    await openEditor(user, 'Task 1');
    expect(currentLocation().path).toBe(before);
    expect(api.listTasks).toHaveBeenCalledOnce();
  });

  it('a stale save result after the list was replaced is ignored and cannot close another form', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.updateTask).mockReturnValueOnce(pending.promise);
    const { user } = await renderList([task(1), task(2)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());

    // The Add form succeeds while task 1 is saving: the list is replaced, form 1 unmounts.
    await user.type(addTitle(), 'Other');
    await user.click(addButton());
    await waitFor(() => expect(addStatus()).toHaveTextContent('Task added.'));
    await screen.findByRole('button', { name: 'Edit Task 2' });
    expect(queryEditForm()).not.toBeInTheDocument();

    await openEditor(user, 'Task 2');
    await user.type(editTitle(), ' draft');
    const listCalls = vi.mocked(api.listTasks).mock.calls.length;
    await act(async () => pending.resolve(task(1)));

    expect(editForm()).toBeInTheDocument();
    expect(editTitle()).toHaveValue('Task 2 draft');
    expect(editStatus()).toBeEmptyDOMElement();
    expect(vi.mocked(api.listTasks).mock.calls).toHaveLength(listCalls); // no reload
    expect(editTitle()).toHaveFocus();
  });

  it('a stale 404 or failure after the form closed shows nothing and cannot close another form', async () => {
    for (const error of [new ApiError(404, 'NOT_FOUND'), new ApiError(500, 'INTERNAL_ERROR')]) {
      vi.mocked(api.listTasks).mockReset();
      setTasks(task(1), task(2));
      vi.mocked(api.updateTask).mockReset();
      const pending = deferred<Task>();
      vi.mocked(api.updateTask).mockReturnValueOnce(pending.promise);
      const { user, unmount } = renderHome();
      await screen.findByText('Task 1');
      await openEditor(user, 'Task 1');
      await user.type(editTitle(), '!');
      await user.click(saveButton());
      await user.click(filterButton('Active')); // replaces the list while saving
      await screen.findByRole('button', { name: 'Edit Task 2' });
      await openEditor(user, 'Task 2');
      await user.type(editTitle(), ' draft');
      const calls = vi.mocked(api.listTasks).mock.calls.length;

      await act(async () => pending.reject(error));
      expect(editForm()).toBeInTheDocument();
      expect(editTitle()).toHaveValue('Task 2 draft');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(editAlert()).not.toBeInTheDocument();
      expect(vi.mocked(api.listTasks).mock.calls).toHaveLength(calls);
      unmount();
    }
  });

  it('Cancel is not possible while saving, so a draft cannot be discarded under a pending save', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.updateTask).mockReturnValue(pending.promise);
    const { user } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    expect(cancelButton()).toBeDisabled();
    await act(async () => pending.resolve(task(1)));
  });
});

describe('session handling', () => {
  async function logoutAndLoginAsBob(user: User) {
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    vi.mocked(api.login).mockResolvedValue(BOB);
    await user.type(screen.getByLabelText('Email'), BOB.email);
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByText('Signed in as bob@example.com');
  }

  it('an open form, its draft and an error of one user are not visible to the next user', async () => {
    vi.mocked(api.updateTask).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR'));
    const { user } = await renderList([task(1, { title: 'Ann secret title' })]);
    await openEditor(user, 'Ann secret title');
    await user.type(editTitle(), ' draft');
    await user.type(editDescription(), 'Ann secret details');
    await user.click(saveButton());
    await within(editForm()).findByRole('alert');

    setTasks(task(5, { title: 'Bob task' }));
    await logoutAndLoginAsBob(user);
    await screen.findByText('Bob task');
    expect(queryEditForm()).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Ann secret/)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/Ann secret/)).not.toBeInTheDocument();
    expect(editButton('Bob task')).toBeEnabled();
  });

  it('"Task updated." and the 404 alert from the first session are gone for the next user', async () => {
    const { user } = await renderList([task(1), task(2)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    await waitFor(() => expect(editStatus()).toHaveTextContent('Task updated.'));
    await logoutAndLoginAsBob(user);
    await screen.findByText('Task 1');
    expect(editStatus()).toBeEmptyDOMElement();

    vi.mocked(api.updateTask).mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND'));
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    await screen.findByText('Error: This task no longer exists.');
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    vi.mocked(api.login).mockResolvedValue(ANN);
    await user.type(screen.getByLabelText('Email'), ANN.email);
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByText('Signed in as ann@example.com');
    expect(editAlert()).not.toBeInTheDocument();
  });

  it('a save result that arrives after logout and the next login does not leak into the new view', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.updateTask).mockReturnValue(pending.promise);
    const { user } = await renderList([task(1, { title: 'Ann task' })]);
    await openEditor(user, 'Ann task');
    await user.type(editTitle(), '!');
    await user.click(saveButton());

    setTasks(task(5, { title: 'Bob task' }));
    await logoutAndLoginAsBob(user);
    await screen.findByText('Bob task');
    const calls = vi.mocked(api.listTasks).mock.calls.length;
    await act(async () => pending.resolve(task(1)));

    expect(editStatus()).toBeEmptyDOMElement();
    expect(queryEditForm()).not.toBeInTheDocument();
    expect(vi.mocked(api.listTasks).mock.calls).toHaveLength(calls);
    expect(document.body).toHaveFocus();
  });

  it('a 404 or failure that arrives after logout shows nothing to the next user', async () => {
    const pending = deferred<Task>();
    vi.mocked(api.updateTask).mockReturnValue(pending.promise);
    const { user } = await renderList([task(1, { title: 'Ann task' })]);
    await openEditor(user, 'Ann task');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    setTasks(task(5, { title: 'Bob task' }));
    await logoutAndLoginAsBob(user);
    await screen.findByText('Bob task');
    await act(async () => pending.reject(new ApiError(404, 'NOT_FOUND')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(editAlert()).not.toBeInTheDocument();
  });
});

describe('plain text rendering (no markup is interpreted)', () => {
  const MARKUP_TITLE = '<b>x</b>';
  const MARKUP_DESCRIPTION = '<img src=x onerror="alert(1)"><script>window.hacked = 1</script>';

  it('list: markup in a title and a description is shown as text, never as elements', async () => {
    const { container } = await renderList([
      task(1, { title: MARKUP_TITLE, description: MARKUP_DESCRIPTION }),
    ]);
    expect(screen.getByText(MARKUP_TITLE)).toBeInTheDocument();
    expect(screen.getByText(MARKUP_DESCRIPTION)).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(editButton(MARKUP_TITLE)).toBeInTheDocument();
  });

  it('edit form: markup is pre-filled as literal text in the fields', async () => {
    const { user, container } = await renderList([
      task(1, { title: MARKUP_TITLE, description: MARKUP_DESCRIPTION }),
    ]);
    await openEditor(user, MARKUP_TITLE);
    expect(editTitle()).toHaveValue(MARKUP_TITLE);
    expect(editDescription()).toHaveValue(MARKUP_DESCRIPTION);
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('edit flow: typed markup is sent verbatim and shown as text after the refetch', async () => {
    const { user, container } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await replaceTitle(user, MARKUP_TITLE);
    await replaceDescription(user, MARKUP_DESCRIPTION);
    setTasks(task(1, { title: MARKUP_TITLE, description: MARKUP_DESCRIPTION }));
    await user.click(saveButton());
    expect(api.updateTask).toHaveBeenCalledExactlyOnceWith(1, {
      title: MARKUP_TITLE,
      description: MARKUP_DESCRIPTION,
    });
    expect(await screen.findByText(MARKUP_TITLE)).toBeInTheDocument();
    expect(screen.getByText(MARKUP_DESCRIPTION)).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('edit flow: a 400 message containing markup is rendered as text', async () => {
    vi.mocked(api.updateTask).mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', '<b>bad</b> <img src=x onerror=alert(1)>'),
    );
    const { user, container } = await renderList([task(1)]);
    await openEditor(user, 'Task 1');
    await user.type(editTitle(), '!');
    await user.click(saveButton());
    const alert = await within(editForm()).findByRole('alert');
    expect(alert.textContent).toBe('Error: <b>bad</b> <img src=x onerror=alert(1)>');
    expect(alert.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('add flow: typed markup is sent verbatim and shown as text after the refetch', async () => {
    const { user, container } = await renderList([task(1)]);
    await user.click(addTitle());
    await user.paste(MARKUP_TITLE);
    await user.click(within(addSection()).getByLabelText('Description (optional)'));
    await user.paste(MARKUP_DESCRIPTION);
    setTasks(task(9, { title: MARKUP_TITLE, description: MARKUP_DESCRIPTION }), task(1));
    await user.click(addButton());
    expect(api.createTask).toHaveBeenCalledExactlyOnceWith({
      title: MARKUP_TITLE,
      description: MARKUP_DESCRIPTION,
    });
    expect(await screen.findByText(MARKUP_TITLE)).toBeInTheDocument();
    expect(screen.getByText(MARKUP_DESCRIPTION)).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('add flow: a 400 message containing markup is rendered as text', async () => {
    vi.mocked(api.createTask).mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', '<b>bad</b> <img src=x onerror=alert(1)>'),
    );
    const { user, container } = await renderList([task(1)]);
    await user.type(addTitle(), 'Ok');
    await user.click(addButton());
    const alert = await within(addSection()).findByRole('alert');
    expect(alert.textContent).toBe('Error: <b>bad</b> <img src=x onerror=alert(1)>');
    expect(alert.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('the markup test strings do not execute anything', () => {
    expect((window as unknown as { hacked?: number }).hacked).toBeUndefined();
  });
});
