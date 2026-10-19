// Pure task form helpers (docs/UI_SPEC.md "Add task form (S-008)" and "Edit task (S-009)",
// #50-#57).
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import { GENERIC_MESSAGE, NETWORK_MESSAGE } from '../auth/error-messages';
import {
  TASK_GONE_MESSAGE,
  TASK_UPDATED_MESSAGE,
  addedMessage,
  editTaskPatch,
  newTaskPayload,
  taskErrorMessage,
  validateTaskFields,
} from './task-form';

describe('validateTaskFields', () => {
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
    expect(validateTaskFields(title, description)).toEqual(expected);
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

describe('taskErrorMessage', () => {
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
    expect(taskErrorMessage(error)).toBe(expected);
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

describe('editTaskPatch', () => {
  const withText = { title: 'Write report', description: 'Two pages' };
  const withoutText = { title: 'Write report', description: null };

  it.each([
    ['unchanged', withText, 'Write report', 'Two pages', null],
    ['whitespace-only edits', withText, '  Write report ', '\n Two pages  ', null],
    ['unchanged, null description, empty draft', withoutText, 'Write report', '', null],
    ['unchanged, null description, blank draft', withoutText, 'Write report', '   ', null],
    [
      'title changed (trimmed)',
      withText,
      ' Write the report ',
      'Two pages',
      { title: 'Write the report' },
    ],
    ['case-only title change', withText, 'write report', 'Two pages', { title: 'write report' }],
    [
      'description changed (trimmed)',
      withText,
      'Write report',
      ' Three pages\n',
      { description: 'Three pages' },
    ],
    ['description cleared', withText, 'Write report', '  ', { description: null }],
    ['description added to null', withoutText, 'Write report', 'New', { description: 'New' }],
    [
      'both changed',
      withText,
      'New title',
      'New text',
      { title: 'New title', description: 'New text' },
    ],
  ])('%s', (_name, task, title, description, expected) => {
    expect(editTaskPatch(task, title, description)).toEqual(expected);
  });

  // toEqual ignores keys whose value is undefined; the PATCH body must not carry them either.
  it.each([
    [withText, 'New', 'Two pages', ['title']],
    [withText, 'Write report', 'New', ['description']],
    [withText, 'Write report', '', ['description']],
    [withoutText, 'Write report', 'New', ['description']],
    [withText, 'New', 'New', ['description', 'title']],
  ])('has exactly the changed keys (strict) for %j / %s / %s', (task, title, description, keys) => {
    const patch = editTaskPatch(task, title, description);
    expect(Object.keys(patch!).sort()).toEqual(keys);
    expect(patch).not.toHaveProperty('status');
  });

  it('keeps inner line breaks and compares them exactly', () => {
    const multi = { title: 'T', description: 'a\nb' };
    expect(editTaskPatch(multi, 'T', ' a\nb ')).toBeNull();
    expect(editTaskPatch(multi, 'T', 'a\n\nb')).toStrictEqual({ description: 'a\n\nb' });
  });

  it('does not validate: an empty title is reported as a change (validation runs before)', () => {
    expect(editTaskPatch(withText, '   ', 'Two pages')).toStrictEqual({ title: '' });
  });

  it('never returns an empty object or extra keys', () => {
    const patch = editTaskPatch(withText, 'Write report', '');
    expect(patch).toEqual({ description: null });
    expect(Object.keys(patch!)).toEqual(['description']);
  });
});

describe('edit messages', () => {
  it('has the fixed confirmation and task-gone texts', () => {
    expect(TASK_UPDATED_MESSAGE).toBe('Task updated.');
    expect(TASK_GONE_MESSAGE).toBe('This task no longer exists.');
  });
});
