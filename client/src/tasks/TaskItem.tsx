import type { Task } from '../api';
import EditTaskForm from './EditTaskForm';

const DESCRIPTION_STYLE = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } as const;

type Props = {
  task: Task;
  /** This task's edit form is open (S-009). */
  editing: boolean;
  /** Another task is being edited. */
  editDisabled: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSaved: () => void;
  onNotFound: () => void;
  /** Callback ref for the `Edit` button (TasksView restores focus to it, #56). */
  editButtonRef: (el: HTMLButtonElement | null) => void;
};

// Plain text only (React escaping, #26). No dates (#49). Inline edit (S-009, #54).
export default function TaskItem({
  task,
  editing,
  editDisabled,
  onEdit,
  onClose,
  onSaved,
  onNotFound,
  editButtonRef,
}: Props) {
  if (editing) {
    return (
      <li>
        <EditTaskForm task={task} onClose={onClose} onSaved={onSaved} onNotFound={onNotFound} />
      </li>
    );
  }

  const titleId = `task-${task.id}-title`;
  const editId = `task-${task.id}-edit`;
  return (
    <li>
      <p id={titleId}>{task.title}</p>
      {task.description !== null && <p style={DESCRIPTION_STYLE}>{task.description}</p>}
      <p>{task.status === 'completed' ? 'Completed' : 'Active'}</p>
      <button
        type="button"
        id={editId}
        aria-labelledby={`${editId} ${titleId}`}
        disabled={editDisabled}
        ref={editButtonRef}
        onClick={onEdit}
      >
        Edit
      </button>
    </li>
  );
}
