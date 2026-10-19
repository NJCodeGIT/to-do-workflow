// Pure helpers for the task filter and its texts (docs/UI_SPEC.md "Task list behavior", #45, #49).
import type { TaskFilter } from '../api';

/** `?status=active|completed` (exactly one value) selects that filter; anything else is All. */
export function filterFromSearchParams(params: URLSearchParams): TaskFilter {
  const values = params.getAll('status');
  if (values.length === 1 && (values[0] === 'active' || values[0] === 'completed')) {
    return values[0];
  }
  return 'all';
}

/** A copy of `params` with `status` set for the filter (removed for All); other params kept. */
export function searchWithFilter(params: URLSearchParams, filter: TaskFilter): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('status');
  if (filter !== 'all') next.set('status', filter);
  return next;
}

export const FILTER_OPTIONS: ReadonlyArray<{ value: TaskFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
];

export const EMPTY_MESSAGES: Readonly<Record<TaskFilter, string>> = {
  all: 'You have no tasks yet.',
  active: 'No active tasks.',
  completed: 'No completed tasks.',
};

export const LOAD_ERROR_MESSAGE = 'Could not load your tasks.';

export function countText(n: number): string {
  return n === 1 ? '1 task' : `${n} tasks`;
}
