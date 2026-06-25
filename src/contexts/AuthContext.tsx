import { createContext, useContext, useEffect, useState } from 'react';
import { authService, type User, type RegisterResult } from '../services/authService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = authService.getStoredUser();
    if (storedUser) {
      setUser(storedUser);
    }
    setLoading(false);
  }, []);

  const login = async (login: string, password: string) => {
    try {
      const response = await authService.login(login, password);
      if (response.user) {
        authService.storeUser(response.user);
        setUser(response.user);
      }
    } catch (error) {
      throw error;
    }
  };

  const register = async (name: string, email: string, password: string): Promise<RegisterResult> => {
    const result = await authService.register(name, email, password);
    // Only a created (new-email) account is logged in; a 'pending' result
    // (existing email) must not set a user — the caller shows a neutral screen.
    if (result.status === 'created') {
      authService.storeUser(result.user);
      setUser(result.user);
    }
    return result;
  };

  const logout = async () => {
    try {
      await authService.logout();
      setUser(null);
    } catch (error) {
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
