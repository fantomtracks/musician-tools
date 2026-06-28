import { createContext, useContext } from 'react';
import type { User, RegisterResult } from '../services/authService';

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  // Returns { needsVerification: true } when the credentials are correct but the
  // email isn't verified yet (story 7.13) — the caller shows a resend prompt.
  login: (login: string, password: string) => Promise<{ needsVerification: boolean }>;
  register: (name: string, email: string, password: string) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  patchUser: (partial: Partial<User>) => void;
  // Hydrate auth state from a user the server just logged in out-of-band (story
  // 7.13: the verify-email link auto-logs-in and returns the user).
  applyAuthenticatedUser: (user: User) => void;
  isAuthenticated: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
