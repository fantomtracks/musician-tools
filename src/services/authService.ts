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
  token?: string;
  user?: User;
};

const API_BASE = '/api';

export const authService = {
  // Register new user
  async register(name: string, email: string, password: string): Promise<User> {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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

  // Logout user
  async logout(): Promise<void> {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'GET',
      credentials: 'include',
    });
    localStorage.removeItem('user');
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
