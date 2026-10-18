import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { redirectTarget } from './redirect';
import { useAuth } from './useAuth';

/** Login/register: a signed-in user is sent to the sanitized `from` target or home. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user) return <Navigate to={redirectTarget(location.state)} replace />;
  return children;
}
