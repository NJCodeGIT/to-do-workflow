// Pure add-task helpers (docs/UI_SPEC.md "Add task form (S-008)", #50-#53).
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import { GENERIC_MESSAGE, NETWORK_MESSAGE } from '../auth/error-messages';
import { addTaskErrorMessage, addedMessage, newTaskPayload, validateNewTask } from './task-form';

describe('validateNewTask', () => {
  it.each([
    ['a', '', {}],
    ['  a  ', '   ', {}],
    ['x'.repeat(200), 'y'.repeat(2000), {}],
    [` ${'x'.repeat(200)} `, ` ${'y'.repeat(2000)} `, {}],
    ['', '', { title: 'Enter a title.' }],
    ['   ', '', { title: 'Enter a title.' }],
    ['x'.repeat(201), '', { title: 'Title must be at most 200 characters.' }],
    ['a', 'y'.repeat(2001), { description: 'Description must be at most 2000 characters.' }],
    [
      '',
      'y'.repeat(2001),
      { title: 'Enter a title.', description: 'Description must be at most 2000 characters.' },
    ],
  ])('validates case %#', (title, description, expected) => {
    expect(validateNewTask(title, description)).toEqual(expected);
  });
});

describe('newTaskPayload', () => {
  it('trims both values and omits a blank description', () => {
    expect(newTaskPayload('  Buy milk ', ' 2 litres\n')).toEqual({
      title: 'Buy milk',
      description: '2 litres',
    });
    const payload = newTaskPayload('Buy milk', '  \n ');
    expect(payload).toEqual({ title: 'Buy milk' });
    expect('description' in payload).toBe(false);
  });
});

describe('addTaskErrorMessage', () => {
  it.each([
    [new ApiError(401, 'UNAUTHORIZED', 'Invalid or expired token'), null],
    [new ApiError(0, 'NETWORK_ERROR', 'Network request failed'), NETWORK_MESSAGE],
    [new ApiError(400, 'VALIDATION_ERROR', 'title is required'), 'title is required'],
    [new ApiError(400, 'VALIDATION_ERROR', ''), GENERIC_MESSAGE],
    [new ApiError(400, 'OTHER', 'x'), GENERIC_MESSAGE],
    [new ApiError(500, 'INTERNAL_ERROR', 'boom'), GENERIC_MESSAGE],
    [new ApiError(201, 'UNKNOWN_ERROR'), GENERIC_MESSAGE],
    [new Error('x'), GENERIC_MESSAGE],
  ])('maps %o', (error, expected) => {
    expect(addTaskErrorMessage(error)).toBe(expected);
  });
});

describe('addedMessage', () => {
  it('explains that the task is not shown under Completed', () => {
    expect(addedMessage('all')).toBe('Task added.');
    expect(addedMessage('active')).toBe('Task added.');
    expect(addedMessage('completed')).toBe(
      'Task added. It is active, so it is not shown under Completed.',
    );
  });
});
