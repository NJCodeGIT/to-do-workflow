import type { Task } from '../api';
import DeleteTaskConfirm from './DeleteTaskConfirm';
import EditTaskForm from './EditTaskForm';
import { toggleLabel, type TaskAction, type TaskButtonKind } from './task-actions';

const DESCRIPTION_STYLE = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } as const;

type Props = {
  task: Task;
  /** `edit`: the edit form is open (S-009); `delete`: the delete prompt is open (S-010). */
  mode: 'view' | 'edit' | 'delete';
  /** Any item is open or any complete/reopen/delete request is in flight (#59). */
  actionsDisabled: boolean;
  /** The request in flight for this task, if any (in-flight labels). */
  busyAction: TaskAction | null;
  /** Any complete/reopen/delete request is in flight: disables the prompt's buttons. */
  promptDisabled: boolean;
  onToggle: () => void;
  onEdit: () => void;
  /** Opens the delete prompt (no request). */
  onDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onClose: () => void;
  onSaved: () => void;
  onNotFound: () => void;
  /** Callback ref per button kind (TasksView restores focus to them, #56, #61, #62). */
  buttonRef: (kind: TaskButtonKind, el: HTMLButtonElement | null) => void;
};

// Plain text only (React escaping, #26). No dates (#49). Inline edit (S-009, #54); complete,
// reopen and inline delete confirmation (S-010, #58).
export default function TaskItem({
  task,
  mode,
  actionsDisabled,
  busyAction,
  promptDisabled,
  onToggle,
  onEdit,
  onDelete,
  onCancelDelete,
  onConfirmDelete,
  onClose,
  onSaved,
  onNotFound,
  buttonRef,
}: Props) {
  if (mode === 'edit') {
    return (
      <li>
        <EditTaskForm task={task} onClose={onClose} onSaved={onSaved} onNotFound={onNotFound} />
      </li>
    );
  }

  const titleId = `task-${task.id}-title`;
  const toggleId = `task-${task.id}-toggle`;
  const editId = `task-${task.id}-edit`;
  const deleteId = `task-${task.id}-delete`;
  return (
    <li>
      <p id={titleId}>{task.title}</p>
      {task.description !== null && <p style={DESCRIPTION_STYLE}>{task.description}</p>}
      <p>{task.status === 'completed' ? 'Completed' : 'Active'}</p>
      {mode === 'delete' ? (
        <DeleteTaskConfirm
          task={task}
          deleting={busyAction === 'delete'}
          disabled={promptDisabled}
          onConfirm={onConfirmDelete}
          onCancel={onCancelDelete}
          confirmRef={(el) => buttonRef('confirm', el)}
        />
      ) : (
        <>
          <button
            type="button"
            id={toggleId}
            aria-labelledby={`${toggleId} ${titleId}`}
            disabled={actionsDisabled}
            ref={(el) => buttonRef('toggle', el)}
            onClick={onToggle}
          >
            {toggleLabel(task.status, busyAction === 'status')}
          </button>{' '}
          <button
            type="button"
            id={editId}
            aria-labelledby={`${editId} ${titleId}`}
            disabled={actionsDisabled}
            ref={(el) => buttonRef('edit', el)}
            onClick={onEdit}
          >
            Edit
          </button>{' '}
          <button
            type="button"
            id={deleteId}
            aria-labelledby={`${deleteId} ${titleId}`}
            disabled={actionsDisabled}
            ref={(el) => buttonRef('delete', el)}
            onClick={onDelete}
          >
            Delete
          </button>
        </>
      )}
    </li>
  );
}
