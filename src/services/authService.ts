import { getCsrfToken, clearCsrfToken } from './csrf';

export type User = {
  uid: string;
  name: string;
  email: string;
  isAdmin: boolean;
};

export type LoginRequest = {
  login: string;
  password: string;
};

export type RegisterRequest = {
  name: string;
  email: string;
  password: string;
};

export type AuthResponse = {
  auth: boolean;
  userId?: string;
  user?: User;
};

const API_BASE = '/api';

export const authService = {
  // Register new user
  async register(name: string, email: string, password: string): Promise<User> {
    const csrfToken = await getCsrfToken();
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      credentials: 'include',
      body: JSON.stringify({ name, email, password }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Registration failed');
    }
    return response.json();
  },

  // Login user
  async login(login: string, password: string): Promise<AuthResponse> {
    const csrfToken = await getCsrfToken();
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      credentials: 'include',
      body: JSON.stringify({ login, password }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }
    return response.json();
  },

  // Logout user. POST (state-changing) + CSRF token (story 7.3). The session is
  // destroyed server-side, so clear the cached token afterwards.
  //
  // Best-effort: a network failure (or a failed token fetch) must never strand
  // the UI in a "logged in" state. We always clear client state in `finally`,
  // so logout works offline / against a dead backend too.
  async logout(): Promise<void> {
    try {
      const csrfToken = await getCsrfToken();
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
      });
    } catch {
      // Swallow: client state is cleared in `finally` regardless.
    } finally {
      clearCsrfToken();
      localStorage.removeItem('user');
    }
  },

  // Check if user is logged in
  isLoggedIn(): boolean {
    return !!localStorage.getItem('user');
  },

  // Get stored user
  getStoredUser(): User | null {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  // Store user session
  storeUser(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
  },
};
