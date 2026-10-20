// Pure helpers for complete/reopen/delete (S-010, decisions #58-#62).
import { describe, expect, it } from 'vitest';
import { ApiError, type TaskFilter, type TaskStatus } from '../api';
import { GENERIC_MESSAGE, NETWORK_MESSAGE } from '../auth/error-messages';
import {
  TASK_DELETED_MESSAGE,
  actionErrorMessage,
  deletePromptText,
  nextStatus,
  statusChangedMessage,
  toggleLabel,
} from './task-actions';

describe('nextStatus', () => {
  it('flips active and completed', () => {
    expect(nextStatus('active')).toBe('completed');
    expect(nextStatus('completed')).toBe('active');
  });
});

describe('toggleLabel', () => {
  it.each([
    ['active', false, 'Complete'],
    ['active', true, 'Completing...'],
    ['completed', false, 'Reopen'],
    ['completed', true, 'Reopening...'],
  ] as const)('%s, in flight %s -> %s', (status, inFlight, label) => {
    expect(toggleLabel(status, inFlight)).toBe(label);
  });
});

describe('statusChangedMessage', () => {
  const cases: Array<[TaskStatus, TaskFilter, string]> = [
    ['completed', 'all', 'Task completed.'],
    ['completed', 'active', 'Task completed. It is no longer shown under Active.'],
    ['completed', 'completed', 'Task completed.'],
    ['active', 'all', 'Task reopened.'],
    ['active', 'active', 'Task reopened.'],
    ['active', 'completed', 'Task reopened. It is no longer shown under Completed.'],
  ];
  it.each(cases)('new status %s under filter %s', (status, filter, text) => {
    expect(statusChangedMessage(status, filter)).toBe(text);
  });
});

describe('texts', () => {
  it('deleted message', () => {
    expect(TASK_DELETED_MESSAGE).toBe('Task deleted.');
  });

  it('delete prompt names the task and warns', () => {
    expect(deletePromptText('Buy milk')).toBe('Delete "Buy milk"? This cannot be undone.');
  });

  it('delete prompt keeps markup-like and quote characters verbatim', () => {
    expect(deletePromptText('<b>x</b> "q"')).toBe('Delete "<b>x</b> "q""? This cannot be undone.');
  });
});

describe('actionErrorMessage', () => {
  it('401 -> null (global handling)', () => {
    expect(actionErrorMessage(new ApiError(401, 'UNAUTHORIZED'))).toBeNull();
  });

  it('network failure -> network text', () => {
    expect(actionErrorMessage(new ApiError(0, 'NETWORK_ERROR'))).toBe(NETWORK_MESSAGE);
  });

  it.each([400, 403, 404, 409, 500, 502, 200])('status %i -> generic text', (status) => {
    expect(actionErrorMessage(new ApiError(status, 'X', 'server text'))).toBe(GENERIC_MESSAGE);
  });

  it('never returns the server message', () => {
    const message = actionErrorMessage(new ApiError(500, 'INTERNAL', 'secret server detail'));
    expect(message).not.toContain('secret');
  });

  it('non-ApiError values -> generic text', () => {
    expect(actionErrorMessage(new Error('boom'))).toBe(GENERIC_MESSAGE);
    expect(actionErrorMessage('x')).toBe(GENERIC_MESSAGE);
    expect(actionErrorMessage(undefined)).toBe(GENERIC_MESSAGE);
  });
});
