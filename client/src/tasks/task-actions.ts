// Pure rules and texts for complete/reopen and delete (S-010, docs/UI_SPEC.md "Complete, reopen
// and delete (S-010)", decisions #58-#62). The 404 text `TASK_GONE_MESSAGE` lives in
// `task-form.ts` and is shared with the edit form.
import { ApiError, type TaskFilter, type TaskStatus } from '../api';
import { GENERIC_MESSAGE, NETWORK_MESSAGE } from '../auth/error-messages';

export const TASK_DELETED_MESSAGE = 'Task deleted.';

/** Item buttons TasksView keeps in its focus map (`"<id>:<kind>"`, #59). */
export type TaskButtonKind = 'edit' | 'toggle' | 'delete' | 'confirm';

/** Which request is in flight for a task (#59). */
export type TaskAction = 'status' | 'delete';

/** The status the toggle sets: Active -> completed, Completed -> active. */
export function nextStatus(status: TaskStatus): TaskStatus {
  return status === 'active' ? 'completed' : 'active';
}

/** Visible toggle text for a task with `status`; the in-flight form while its request runs. */
export function toggleLabel(status: TaskStatus, inFlight: boolean): string {
  if (status === 'active') return inFlight ? 'Completing...' : 'Complete';
  return inFlight ? 'Reopening...' : 'Reopen';
}

/**
 * Confirmation after a successful complete/reopen (#61), for the filter current when the
 * response arrives. Adds a note when the task leaves the current view.
 */
export function statusChangedMessage(newStatus: TaskStatus, filter: TaskFilter): string {
  if (newStatus === 'completed') {
    return filter === 'active'
      ? 'Task completed. It is no longer shown under Active.'
      : 'Task completed.';
  }
  return filter === 'completed'
    ? 'Task reopened. It is no longer shown under Completed.'
    : 'Task reopened.';
}

/** Text of the inline delete prompt; the title is rendered as plain text by React (#26). */
export function deletePromptText(title: string): string {
  return `Delete "${title}"? This cannot be undone.`;
}

/**
 * Message for a failed complete/reopen/delete (#62), or null for a 401 (global handling, #30).
 * Fixed texts only: the server message is never shown. A 404 is handled by the caller first.
 */
export function actionErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return GENERIC_MESSAGE;
  if (error.status === 401) return null;
  if (error.status === 0) return NETWORK_MESSAGE;
  return GENERIC_MESSAGE;
}
