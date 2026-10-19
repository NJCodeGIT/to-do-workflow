import type { Task } from '../api';

const DESCRIPTION_STYLE = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } as const;

// Plain text only (React escaping, #26). No dates (#49).
export default function TaskItem({ task }: { task: Task }) {
  return (
    <li>
      <p id={`task-${task.id}-title`}>{task.title}</p>
      {task.description !== null && <p style={DESCRIPTION_STYLE}>{task.description}</p>}
      <p>{task.status === 'completed' ? 'Completed' : 'Active'}</p>
    </li>
  );
}
