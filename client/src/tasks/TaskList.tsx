import type { Task } from '../api';
import TaskItem from './TaskItem';

type Props = {
  tasks: Task[];
  /** The task whose edit form is open, or null (S-009, #54). */
  editingId: number | null;
  onEdit: (id: number) => void;
  onClose: (id: number) => void;
  onSaved: (id: number) => void;
  onNotFound: (id: number) => void;
  registerEditButton: (id: number, el: HTMLButtonElement | null) => void;
};

// API order (newest first); no client-side sorting.
export default function TaskList({
  tasks,
  editingId,
  onEdit,
  onClose,
  onSaved,
  onNotFound,
  registerEditButton,
}: Props) {
  return (
    <ul>
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          editing={editingId === task.id}
          editDisabled={editingId !== null}
          onEdit={() => onEdit(task.id)}
          onClose={() => onClose(task.id)}
          onSaved={() => onSaved(task.id)}
          onNotFound={() => onNotFound(task.id)}
          editButtonRef={(el) => registerEditButton(task.id, el)}
        />
      ))}
    </ul>
  );
}
