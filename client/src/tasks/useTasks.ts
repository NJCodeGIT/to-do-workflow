import { useCallback, useEffect, useState } from 'react';
import { ApiError, listTasks, type Task, type TaskFilter } from '../api';

export type TasksState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; tasks: Task[] };

type Outcome = { kind: 'error' } | { kind: 'ready'; tasks: Task[] };

const LOADING: TasksState = { kind: 'loading' };

/**
 * Loads the tasks for `filter` (#47). The stored result carries its request key, so a result for
 * another filter or an earlier attempt is never shown (state is `loading` until the matching one
 * arrives). Stale responses are dropped by the per-effect `ignore` flag. A 401 sets no error:
 * api.ts already cleared the session and RequireAuth unmounts the page. `reload()` refetches the
 * current filter (Try again now; refresh after create/edit/complete/delete later).
 */
export function useTasks(filter: TaskFilter): { state: TasksState; reload: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; outcome: Outcome } | null>(null);
  const key = `${filter}:${attempt}`;

  useEffect(() => {
    let ignore = false;
    const requestKey = `${filter}:${attempt}`;
    listTasks(filter).then(
      (tasks) => {
        if (!ignore) setResult({ key: requestKey, outcome: { kind: 'ready', tasks } });
      },
      (error: unknown) => {
        if (ignore) return;
        if (error instanceof ApiError && error.status === 401) return;
        setResult({ key: requestKey, outcome: { kind: 'error' } });
      },
    );
    return () => {
      ignore = true;
    };
  }, [filter, attempt]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);

  return { state: result?.key === key ? result.outcome : LOADING, reload };
}
