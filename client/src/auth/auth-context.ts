import { createContext } from 'react';
import type { User } from '../api';

export type AuthContextValue = {
  /** null = anonymous. */
  user: User | null;
  /** true only after a forced logout (global 401, decision #30). */
  sessionExpired: boolean;
  /** Rethrows ApiError on failure. */
  login(email: string, password: string): Promise<void>;
  /** Rethrows ApiError on failure. */
  register(email: string, password: string): Promise<void>;
  logout(): void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
