import { useEffect } from 'react';
import { useAuth } from './auth/useAuth';
import TasksView from './tasks/TasksView';

// Protected home: the user's task list with the status filter (docs/UI_SPEC.md "Home: task list").
export default function HomePage() {
  const { user, logout } = useAuth();

  useEffect(() => {
    document.title = 'Your tasks - To-Do App';
  }, []);

  return (
    <>
      <header>
        <p>To-Do App</p>
        {/* Rendered as text (React escaping); never as HTML (#26). */}
        {user && <p>Signed in as {user.email}</p>}
        <button type="button" onClick={logout}>
          Log out
        </button>
      </header>
      <main>
        <h1>Your tasks</h1>
        {/* Keyed by user so a different session always gets a fresh mount and request. */}
        <TasksView key={user?.id} />
      </main>
    </>
  );
}
