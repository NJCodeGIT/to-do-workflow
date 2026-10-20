import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { ApiError, deleteTask, updateTask, type Task, type TaskFilter } from '../api';
import AddTaskForm from './AddTaskForm';
import TaskFilterControl from './TaskFilterControl';
import TaskList from './TaskList';
import {
  TASK_DELETED_MESSAGE,
  actionErrorMessage,
  nextStatus,
  statusChangedMessage,
  type TaskAction,
  type TaskButtonKind,
} from './task-actions';
import {
  EMPTY_MESSAGES,
  LOAD_ERROR_MESSAGE,
  countText,
  filterFromSearchParams,
  searchWithFilter,
} from './task-filter';
import { TASK_GONE_MESSAGE, TASK_UPDATED_MESSAGE } from './task-form';
import { useTasks } from './useTasks';

type OpenItem = { id: number; mode: 'edit' | 'delete'; tasks: Task[] };
type Busy = { id: number; action: TaskAction };
type PendingFocus = { id: number; button: 'edit' | 'toggle' | 'delete' };

function buttonKey(id: number, kind: TaskButtonKind): string {
  return `${id}:${kind}`;
}

// Add form (S-008), task list with the status filter (S-007, docs/UI_SPEC.md "Task list
// behavior"), inline edit (S-009, "Edit task (S-009)", #54-#57) and complete/reopen/delete
// (S-010, "Complete, reopen and delete (S-010)", #58-#62). The filter lives only in the URL (#45).
export default function TasksView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = filterFromSearchParams(searchParams);
  const { state, reload } = useTasks(filter);
  const pressedRef = useRef<HTMLButtonElement>(null);

  // Which task is open (edit form or delete prompt), tied to the list array it was opened on
  // (#54, #59).
  const [openItem, setOpenItem] = useState<OpenItem | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [actionStatus, setActionStatus] = useState('');
  // Edit 404 and all complete/reopen/delete errors (#57, #62).
  const [taskAlert, setTaskAlert] = useState<string | null>(null);
  // One complete/reopen/delete at a time, not tied to the list (#59). `busy` drives `disabled`
  // and labels; the `inFlight` ref is the guard every handler checks first.
  const [busy, setBusy] = useState<Busy | null>(null);
  const inFlight = useRef(false);
  // The list currently shown, or null when not ready or unmounted: a result is applied only if
  // this is still the array its action started on (#59).
  const shownTasks = useRef<Task[] | null>(null);
  // Button that gets focus once the refetched list is back (#56, #61).
  const pendingFocus = useRef<PendingFocus | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  useLayoutEffect(() => {
    shownTasks.current = state.kind === 'ready' ? state.tasks : null;
    return () => {
      shownTasks.current = null;
    };
  }, [state]);

  // Any list replacement yields a new array or a loading state, so the form or prompt closes by
  // itself. Clearing `openItem` here (state adjusted during render) makes the close final:
  // useTasks can hand back an earlier outcome object after a quick filter round trip, and it
  // must not reopen.
  if (openItem !== null && (state.kind !== 'ready' || state.tasks !== openItem.tasks)) {
    setOpenItem(null);
  }
  const openId =
    state.kind === 'ready' && openItem !== null && openItem.tasks === state.tasks
      ? openItem.id
      : null;
  const openMode = openItem?.mode ?? 'edit';

  useEffect(() => {
    const pending = pendingFocus.current;
    if (pending === null || state.kind === 'loading') return;
    pendingFocus.current = null;
    // Only when focus is lost: a user who moved on during the refetch is not pulled back.
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    (buttons.current.get(buttonKey(pending.id, pending.button)) ?? pressedRef.current)?.focus();
  }, [state]);

  const registerButton = useCallback(
    (id: number, kind: TaskButtonKind, el: HTMLButtonElement | null) => {
      if (el) buttons.current.set(buttonKey(id, kind), el);
      else buttons.current.delete(buttonKey(id, kind));
    },
    [],
  );

  function changeFilter(next: TaskFilter) {
    // Push (not replace) so Back undoes a filter change.
    setSearchParams(searchWithFilter(searchParams, next));
  }

  function tryAgain() {
    reload();
    // The Try again button is about to unmount; keep focus on the page (#48).
    pressedRef.current?.focus();
  }

  function openEditor(id: number) {
    if (inFlight.current || state.kind !== 'ready') return;
    setOpenItem({ id, mode: 'edit', tasks: state.tasks });
    setEditStatus('');
    setTaskAlert(null);
  }

  function closeEditor(id: number) {
    flushSync(() => setOpenItem(null));
    buttons.current.get(buttonKey(id, 'edit'))?.focus();
  }

  function handleSaved(id: number) {
    setOpenItem(null);
    setEditStatus(TASK_UPDATED_MESSAGE);
    setTaskAlert(null);
    pendingFocus.current = { id, button: 'edit' };
    reload();
  }

  function handleNotFound(id: number) {
    setOpenItem(null);
    setEditStatus('');
    setTaskAlert(TASK_GONE_MESSAGE);
    pendingFocus.current = { id, button: 'edit' };
    reload();
  }

  /**
   * Runs one complete/reopen/delete request (#59-#62). `onSuccess` runs only if the list the
   * action started on is still shown; a stale result only clears `busy`/`inFlight`.
   */
  async function runAction(
    task: Task,
    action: TaskAction,
    request: () => Promise<unknown>,
    onSuccess: () => void,
  ) {
    if (inFlight.current || state.kind !== 'ready') return;
    const startedOn = state.tasks;
    inFlight.current = true;
    setBusy({ id: task.id, action });
    setActionStatus('');
    setTaskAlert(null);

    try {
      await request();
    } catch (error) {
      inFlight.current = false;
      if (shownTasks.current !== startedOn) {
        setBusy(null);
        return;
      }
      if (error instanceof ApiError && error.status === 404) {
        setBusy(null);
        setOpenItem(null);
        setTaskAlert(TASK_GONE_MESSAGE);
        pendingFocus.current = { id: task.id, button: action === 'status' ? 'toggle' : 'delete' };
        reload();
        return;
      }
      const message = actionErrorMessage(error);
      if (message === null) {
        // 401: the global handling (#30) clears the session and redirects; no message, no focus.
        setBusy(null);
        return;
      }
      // Re-enable the buttons before focusing the one that was used, so the user can retry.
      flushSync(() => {
        setBusy(null);
        setTaskAlert(message);
      });
      buttons.current.get(buttonKey(task.id, action === 'status' ? 'toggle' : 'confirm'))?.focus();
      return;
    }

    inFlight.current = false;
    setBusy(null);
    if (shownTasks.current !== startedOn) return;
    onSuccess();
  }

  function handleToggle(task: Task) {
    const status = nextStatus(task.status);
    void runAction(
      task,
      'status',
      // Body exactly `{ status }` (#60); the returned task is not used, the list is refetched.
      () => updateTask(task.id, { status }),
      () => {
        setActionStatus(statusChangedMessage(status, filter));
        pendingFocus.current = { id: task.id, button: 'toggle' };
        reload();
      },
    );
  }

  function openDeletePrompt(id: number) {
    if (inFlight.current || state.kind !== 'ready') return;
    setOpenItem({ id, mode: 'delete', tasks: state.tasks });
    setTaskAlert(null);
  }

  function cancelDelete(id: number) {
    if (inFlight.current) return;
    flushSync(() => setOpenItem(null));
    buttons.current.get(buttonKey(id, 'delete'))?.focus();
  }

  function confirmDelete(task: Task) {
    void runAction(
      task,
      'delete',
      () => deleteTask(task.id),
      () => {
        setOpenItem(null);
        setActionStatus(TASK_DELETED_MESSAGE);
        // The task is gone, so the focus effect falls back to the pressed filter button.
        pendingFocus.current = { id: task.id, button: 'delete' };
        reload();
      },
    );
  }

  let statusText = '';
  if (state.kind === 'loading') statusText = 'Loading tasks...';
  else if (state.kind === 'ready') {
    statusText = state.tasks.length === 0 ? EMPTY_MESSAGES[filter] : countText(state.tasks.length);
  }

  return (
    <>
      <AddTaskForm filter={filter} onAdded={reload} />
      <TaskFilterControl value={filter} onChange={changeFilter} pressedRef={pressedRef} />
      <div role="status">{statusText}</div>
      <div role="status">{editStatus}</div>
      <div role="status">{actionStatus}</div>
      {taskAlert !== null && <div role="alert">Error: {taskAlert}</div>}
      {state.kind === 'error' && (
        <>
          <div role="alert">Error: {LOAD_ERROR_MESSAGE}</div>
          <button type="button" onClick={tryAgain}>
            Try again
          </button>
        </>
      )}
      {state.kind === 'ready' && state.tasks.length > 0 && (
        <TaskList
          tasks={state.tasks}
          openId={openId}
          openMode={openMode}
          busy={busy}
          onToggle={handleToggle}
          onEdit={openEditor}
          onDelete={openDeletePrompt}
          onCancelDelete={cancelDelete}
          onConfirmDelete={confirmDelete}
          onClose={closeEditor}
          onSaved={handleSaved}
          onNotFound={handleNotFound}
          registerButton={registerButton}
        />
      )}
    </>
  );
}
