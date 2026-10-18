import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import { AuthContext, type AuthContextValue } from './auth-context';

// Must be rendered inside the router: logout navigates to /login.
export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  // Read synchronously so a reload shows the right page without a loading state (#29).
  const [user, setUser] = useState<api.User | null>(() => api.getCurrentUser());
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(
    () =>
      api.onUnauthorized(() => {
        setUser(null);
        setSessionExpired(true);
      }),
    [],
  );

  const login = useCallback(async (email: string, password: string) => {
    const next = await api.login(email, password);
    setUser(next);
    setSessionExpired(false);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const next = await api.register(email, password);
    setUser(next);
    setSessionExpired(false);
  }, []);

  const logout = useCallback(() => {
    // Navigate first, in the same batch as clearing the user, so RequireAuth never adds `from`.
    navigate('/login', { replace: true });
    api.clearSession();
    setUser(null);
    setSessionExpired(false);
  }, [navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, sessionExpired, login, register, logout }),
    [user, sessionExpired, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
