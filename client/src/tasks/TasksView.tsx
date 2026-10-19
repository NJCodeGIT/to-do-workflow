import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TaskFilter } from '../api';
import TaskFilterControl from './TaskFilterControl';
import TaskList from './TaskList';
import {
  EMPTY_MESSAGES,
  LOAD_ERROR_MESSAGE,
  countText,
  filterFromSearchParams,
  searchWithFilter,
} from './task-filter';
import { useTasks } from './useTasks';

// Task list with the status filter (S-007, docs/UI_SPEC.md "Task list behavior").
// The filter lives only in the URL (#45).
export default function TasksView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = filterFromSearchParams(searchParams);
  const { state, reload } = useTasks(filter);
  const pressedRef = useRef<HTMLButtonElement>(null);

  function changeFilter(next: TaskFilter) {
    // Push (not replace) so Back undoes a filter change.
    setSearchParams(searchWithFilter(searchParams, next));
  }

  function tryAgain() {
    reload();
    // The Try again button is about to unmount; keep focus on the page (#48).
    pressedRef.current?.focus();
  }

  let statusText = '';
  if (state.kind === 'loading') statusText = 'Loading tasks...';
  else if (state.kind === 'ready') {
    statusText = state.tasks.length === 0 ? EMPTY_MESSAGES[filter] : countText(state.tasks.length);
  }

  return (
    <>
      <TaskFilterControl value={filter} onChange={changeFilter} pressedRef={pressedRef} />
      <div role="status">{statusText}</div>
      {state.kind === 'error' && (
        <>
          <div role="alert">Error: {LOAD_ERROR_MESSAGE}</div>
          <button type="button" onClick={tryAgain}>
            Try again
          </button>
        </>
      )}
      {state.kind === 'ready' && state.tasks.length > 0 && <TaskList tasks={state.tasks} />}
    </>
  );
}
