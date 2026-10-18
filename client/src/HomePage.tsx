import { useEffect } from 'react';
import { useAuth } from './auth/useAuth';

// Protected placeholder until the task stories (docs/UI_SPEC.md "Home placeholder").
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
        <p>Task list coming soon.</p>
      </main>
    </>
  );
}
