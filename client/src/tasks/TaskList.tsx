import type { Task } from '../api';
import TaskItem from './TaskItem';

// API order (newest first); no client-side sorting.
export default function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <ul>
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} />
      ))}
    </ul>
  );
}
