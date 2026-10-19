// Pure rules and texts for the add-task form (docs/UI_SPEC.md "Add task form (S-008)",
// decisions #32, #50-#53). Client checks are UX only; the server's zod schemas decide.
import { ApiError, type TaskFilter } from '../api';
import { GENERIC_MESSAGE, NETWORK_MESSAGE } from '../auth/error-messages';

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 2000;

/** Keys are present only for failing fields. */
export type TaskFieldErrors = { title?: string; description?: string };

/** Validates trimmed values: title 1-200, description at most 2000 (JS string length). */
export function validateNewTask(title: string, description: string): TaskFieldErrors {
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
 * Form-level message for a failed `createTask` (#53), or null for a 401 (global handling, #30).
 * 400 messages are fixed server strings that never echo input, so they are safe to show (#31).
 */
export function addTaskErrorMessage(error: unknown): string | null {
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
