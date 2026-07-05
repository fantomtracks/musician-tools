import { getCsrfToken, clearCsrfToken } from './csrf';
import { RateLimitError } from './rateLimit';

export type User = {
  uid: string;
  name: string;
  email: string;
  isAdmin: boolean;
  // Discord-style identity (story 7.2/7.8). Optional for backward-compat with any
  // stored user from before; login/register now include them.
  discriminator?: string;
  handle?: string;
  // Soft-gate verification flag (story 7.9). Drives the VerifyEmailBanner. Optional
  // for users stored before 7.9 (undefined → banner not shown until next login).
  emailVerified?: boolean;
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
  // Story 7.13 (hard email gate): correct credentials but the email isn't
  // verified yet → the caller shows a "verify your email" prompt + resend,
  // instead of treating it as a failed login.
  needsVerification?: boolean;
};

// Register has two non-error outcomes (story 7.7, anti-enumeration):
// - 'created': a new email → account created + auto-logged-in (returns the user)
// - 'pending': the email already exists → generic response, the real owner is
//   notified by email; we must NOT reveal that the account exists.
export type RegisterResult =
  | { status: 'created'; user: User }
  | { status: 'pending' };

const API_BASE = '/api';

export const authService = {
  // Register new user
  async register(name: string, email: string, password: string): Promise<RegisterResult> {
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
    const data = await response.json();
    // The server sends an explicit discriminator: { auth:false, pending:true }
    // for an existing email (anti-enumeration), or the user with auth:true for a
    // new one. Key on `pending` (the explicit flag), not on the response shape.
    if (data && data.pending) {
      return { status: 'pending' };
    }
    return { status: 'created', user: data };
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
    // A 429 from the login limiter (story 7.4) must read as "too many attempts",
    // not as a credential error — detect it by status before touching the body
    // (story 15.1). authService bypasses apiFetch, so this check lives here.
    if (response.status === 429) {
      throw new RateLimitError();
    }
    if (!response.ok) {
      // Read the body once: a second response.json() on the same response throws
      // "body stream already read". Story 7.13: correct credentials on an
      // unverified account → 403 with an explicit code — not a failure, surface
      // it so the UI offers a resend; any other error throws.
      const body = await response.json().catch(() => ({} as { code?: string; message?: string }));
      if (response.status === 403 && body.code === 'email_not_verified') {
        return { auth: false, needsVerification: true };
      }
      throw new Error(body.message || 'Login failed');
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
