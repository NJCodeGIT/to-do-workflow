import type { Task } from '../api';
import TaskItem from './TaskItem';
import type { TaskAction, TaskButtonKind } from './task-actions';

type Props = {
  tasks: Task[];
  /** The open task (edit form or delete prompt), or null (S-009 #54, S-010 #59). */
  openId: number | null;
  /** What the open task shows; ignored when `openId` is null. */
  openMode: 'edit' | 'delete';
  /** The complete/reopen/delete request in flight, or null (#59). */
  busy: { id: number; action: TaskAction } | null;
  onToggle: (task: Task) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onCancelDelete: (id: number) => void;
  onConfirmDelete: (task: Task) => void;
  onClose: (id: number) => void;
  onSaved: (id: number) => void;
  onNotFound: (id: number) => void;
  registerButton: (id: number, kind: TaskButtonKind, el: HTMLButtonElement | null) => void;
};

// API order (newest first); no client-side sorting.
export default function TaskList({
  tasks,
  openId,
  openMode,
  busy,
  onToggle,
  onEdit,
  onDelete,
  onCancelDelete,
  onConfirmDelete,
  onClose,
  onSaved,
  onNotFound,
  registerButton,
}: Props) {
  const actionsDisabled = busy !== null || openId !== null;
  return (
    <ul>
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          mode={openId === task.id ? openMode : 'view'}
          actionsDisabled={actionsDisabled}
          busyAction={busy !== null && busy.id === task.id ? busy.action : null}
          promptDisabled={busy !== null}
          onToggle={() => onToggle(task)}
          onEdit={() => onEdit(task.id)}
          onDelete={() => onDelete(task.id)}
          onCancelDelete={() => onCancelDelete(task.id)}
          onConfirmDelete={() => onConfirmDelete(task)}
          onClose={() => onClose(task.id)}
          onSaved={() => onSaved(task.id)}
          onNotFound={() => onNotFound(task.id)}
          buttonRef={(kind, el) => registerButton(task.id, kind, el)}
        />
      ))}
    </ul>
  );
}
