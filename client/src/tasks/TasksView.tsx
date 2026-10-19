import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import type { Task, TaskFilter } from '../api';
import AddTaskForm from './AddTaskForm';
import TaskFilterControl from './TaskFilterControl';
import TaskList from './TaskList';
import {
  EMPTY_MESSAGES,
  LOAD_ERROR_MESSAGE,
  countText,
  filterFromSearchParams,
  searchWithFilter,
} from './task-filter';
import { TASK_GONE_MESSAGE, TASK_UPDATED_MESSAGE } from './task-form';
import { useTasks } from './useTasks';

// Add form (S-008), task list with the status filter (S-007, docs/UI_SPEC.md "Task list
// behavior") and inline edit (S-009, "Edit task (S-009)", #54-#57). The filter lives only in
// the URL (#45).
export default function TasksView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = filterFromSearchParams(searchParams);
  const { state, reload } = useTasks(filter);
  const pressedRef = useRef<HTMLButtonElement>(null);

  // Which task is open, tied to the list array it was opened on (#54).
  const [editing, setEditing] = useState<{ id: number; tasks: Task[] } | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editAlert, setEditAlert] = useState<string | null>(null);
  // Task whose Edit button gets focus once the refetched list is back (#56).
  const pendingFocusId = useRef<number | null>(null);
  const editButtons = useRef(new Map<number, HTMLButtonElement>());

  // Any list replacement yields a new array or a loading state, so the form closes by itself.
  // Clearing `editing` here (state adjusted during render) makes the close final: useTasks can
  // hand back an earlier outcome object after a quick filter round trip, and it must not reopen.
  if (editing !== null && (state.kind !== 'ready' || state.tasks !== editing.tasks)) {
    setEditing(null);
  }
  const editingId =
    state.kind === 'ready' && editing !== null && editing.tasks === state.tasks ? editing.id : null;

  useEffect(() => {
    const id = pendingFocusId.current;
    if (id === null || state.kind === 'loading') return;
    pendingFocusId.current = null;
    // Only when focus is lost: a user who moved on during the refetch is not pulled back.
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    (editButtons.current.get(id) ?? pressedRef.current)?.focus();
  }, [state]);

  const registerEditButton = useCallback((id: number, el: HTMLButtonElement | null) => {
    if (el) editButtons.current.set(id, el);
    else editButtons.current.delete(id);
  }, []);

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
    if (state.kind !== 'ready') return;
    setEditing({ id, tasks: state.tasks });
    setEditStatus('');
    setEditAlert(null);
  }

  function closeEditor(id: number) {
    flushSync(() => setEditing(null));
    editButtons.current.get(id)?.focus();
  }

  function handleSaved(id: number) {
    setEditing(null);
    setEditStatus(TASK_UPDATED_MESSAGE);
    setEditAlert(null);
    pendingFocusId.current = id;
    reload();
  }

  function handleNotFound(id: number) {
    setEditing(null);
    setEditStatus('');
    setEditAlert(TASK_GONE_MESSAGE);
    pendingFocusId.current = id;
    reload();
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
      {editAlert !== null && <div role="alert">Error: {editAlert}</div>}
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
          editingId={editingId}
          onEdit={openEditor}
          onClose={closeEditor}
          onSaved={handleSaved}
          onNotFound={handleNotFound}
          registerEditButton={registerEditButton}
        />
      )}
    </>
  );
}
