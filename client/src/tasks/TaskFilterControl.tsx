import type { Ref } from 'react';
import type { TaskFilter } from '../api';
import { FILTER_OPTIONS } from './task-filter';

type Props = {
  value: TaskFilter;
  onChange: (filter: TaskFilter) => void;
  /** Attached to the pressed button (Try again moves focus there, #48). */
  pressedRef?: Ref<HTMLButtonElement>;
};

const PRESSED_STYLE = { fontWeight: 'bold', border: '2px solid currentColor' } as const;

// Toggle buttons with aria-pressed in a labelled group (docs/UI_SPEC.md "Task filter").
export default function TaskFilterControl({ value, onChange, pressedRef }: Props) {
  return (
    <div role="group" aria-labelledby="task-filter-label">
      <span id="task-filter-label">Show:</span>{' '}
      {FILTER_OPTIONS.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            ref={pressed ? pressedRef : undefined}
            style={pressed ? PRESSED_STYLE : undefined}
            onClick={() => {
              if (!pressed) onChange(option.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
