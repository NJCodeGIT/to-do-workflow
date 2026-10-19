// Pure filter helpers (docs/UI_SPEC.md "Filter and URL", #45).
import { describe, expect, it } from 'vitest';
import {
  EMPTY_MESSAGES,
  FILTER_OPTIONS,
  countText,
  filterFromSearchParams,
  searchWithFilter,
} from './task-filter';

describe('filterFromSearchParams', () => {
  it.each([
    ['', 'all'],
    ['status=active', 'active'],
    ['status=completed', 'completed'],
    ['status=all', 'all'],
    ['status=Active', 'all'],
    ['status=', 'all'],
    ['status=done', 'all'],
    ['status=active&status=active', 'all'],
    ['status=active&status=completed', 'all'],
    ['other=1&status=completed', 'completed'],
  ])('"%s" -> %s', (search, expected) => {
    expect(filterFromSearchParams(new URLSearchParams(search))).toBe(expected);
  });
});

describe('searchWithFilter', () => {
  it('sets status for Active/Completed and keeps other params', () => {
    const params = new URLSearchParams('x=1&status=completed&y=2');
    expect(searchWithFilter(params, 'active').toString()).toBe('x=1&y=2&status=active');
    expect(searchWithFilter(params, 'completed').toString()).toBe('x=1&y=2&status=completed');
  });

  it('removes every status value for All', () => {
    const params = new URLSearchParams('status=a&x=1&status=b');
    expect(searchWithFilter(params, 'all').toString()).toBe('x=1');
  });

  it('does not change the given params', () => {
    const params = new URLSearchParams('status=active');
    searchWithFilter(params, 'all');
    expect(params.toString()).toBe('status=active');
  });
});

describe('texts', () => {
  it('has the three options in order', () => {
    expect(FILTER_OPTIONS.map((o) => o.label)).toEqual(['All', 'Active', 'Completed']);
  });

  it('has one empty message per filter', () => {
    expect(EMPTY_MESSAGES).toEqual({
      all: 'You have no tasks yet.',
      active: 'No active tasks.',
      completed: 'No completed tasks.',
    });
  });

  it.each([
    [0, '0 tasks'],
    [1, '1 task'],
    [2, '2 tasks'],
    [25, '25 tasks'],
  ])('countText(%i) = %s', (n, text) => {
    expect(countText(n)).toBe(text);
  });
});
