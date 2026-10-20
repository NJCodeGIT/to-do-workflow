import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { Task } from '../api';
import { deletePromptText } from './task-actions';

type Props = {
  task: Task;
  /** This task's delete request is in flight: confirm shows `Deleting...`. */
  deleting: boolean;
  /** Any complete/reopen/delete request is in flight (#59). */
  disabled: boolean;
  onConfirm: () => void;
  /** Cancel or Escape; TasksView ignores it while a request is in flight. */
  onCancel: () => void;
  /** Callback ref for the confirm `Delete` button (focus target after an error, #62). */
  confirmRef: (el: HTMLButtonElement | null) => void;
};

// Inline delete confirmation (S-010, docs/UI_SPEC.md "Delete prompt", #58). Replaces the item's
// button row; the title is plain text (React escaping, #26).
export default function DeleteTaskConfirm({
  task,
  deleting,
  disabled,
  onConfirm,
  onCancel,
  confirmRef,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const promptId = `task-${task.id}-delete-prompt`;

  useEffect(() => {
    // Start on the safe choice.
    cancelRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onCancel();
  }

  const buttonsDisabled = deleting || disabled;
  return (
    <div role="group" aria-label="Confirm delete" onKeyDown={handleKeyDown}>
      <p id={promptId}>{deletePromptText(task.title)}</p>
      <button
        type="button"
        id={`task-${task.id}-delete-confirm`}
        aria-describedby={promptId}
        disabled={buttonsDisabled}
        ref={confirmRef}
        onClick={onConfirm}
      >
        {deleting ? 'Deleting...' : 'Delete'}
      </button>{' '}
      <button
        type="button"
        aria-describedby={promptId}
        disabled={buttonsDisabled}
        ref={cancelRef}
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
