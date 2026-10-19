// Pure rules and texts for the add-task form (docs/UI_SPEC.md "Add task form (S-008)",
// decisions #32, #50-#53) and the edit-task form ("Edit task (S-009)", #54-#57). Both forms share
// the validation and error mapping. Client checks are UX only; the server's zod schemas decide.
import { ApiError, type Task, type TaskFilter, type TaskPatch } from '../api';
import { GENERIC_MESSAGE, NETWORK_MESSAGE } from '../auth/error-messages';

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 2000;

export const TASK_UPDATED_MESSAGE = 'Task updated.';
export const TASK_GONE_MESSAGE = 'This task no longer exists.';

/** Keys are present only for failing fields. */
export type TaskFieldErrors = { title?: string; description?: string };

/** Validates trimmed values: title 1-200, description at most 2000 (JS string length). */
export function validateTaskFields(title: string, description: string): TaskFieldErrors {
  const errors: TaskFieldErrors = {};
  const t = title.trim();
  if (t === '') errors.title = 'Enter a title.';
  else if (t.length > TITLE_MAX) errors.title = `Title must be at most ${TITLE_MAX} characters.`;
  if (description.trim().length > DESCRIPTION_MAX) {
    errors.description = `Description must be at most ${DESCRIPTION_MAX} characters.`;
  }
  return errors;
}

/** Trimmed title; trimmed description, key omitted when blank (#51). */
export function newTaskPayload(
  title: string,
  description: string,
): { title: string; description?: string } {
  const payload: { title: string; description?: string } = { title: title.trim() };
  const d = description.trim();
  if (d !== '') payload.description = d;
  return payload;
}

/**
 * Changed fields only (#55): trimmed title if it differs from `task.title`; trimmed description
 * if it differs from `task.description ?? ''`, as `null` when cleared. Exact comparison after
 * trim, so a case-only change counts. Returns null when nothing changed (never `{}`, #35).
 */
export function editTaskPatch(
  task: Pick<Task, 'title' | 'description'>,
  title: string,
  description: string,
): TaskPatch | null {
  const patch: TaskPatch = {};
  const t = title.trim();
  if (t !== task.title) patch.title = t;
  const d = description.trim();
  if (d !== (task.description ?? '')) patch.description = d === '' ? null : d;
  return patch.title === undefined && patch.description === undefined ? null : patch;
}

/**
 * Form-level message for a failed `createTask` or `updateTask` (#53, #57), or null for a 401
 * (global handling, #30). 400 messages are fixed server strings that never echo input, so they
 * are safe to show (#31). A 404 on edit is handled by the caller before this is used.
 */
export function taskErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return GENERIC_MESSAGE;
  if (error.status === 401) return null;
  if (error.status === 0) return NETWORK_MESSAGE;
  if (error.status === 400 && error.code === 'VALIDATION_ERROR' && error.message !== '') {
    return error.message;
  }
  return GENERIC_MESSAGE;
}

/** Confirmation after a successful add, for the filter current when the response arrives. */
export function addedMessage(filter: TaskFilter): string {
  return filter === 'completed'
    ? 'Task added. It is active, so it is not shown under Completed.'
    : 'Task added.';
}
