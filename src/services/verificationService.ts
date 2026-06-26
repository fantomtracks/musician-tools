import { apiFetch } from './apiFetch';
import type { User } from './authService';

const API_BASE = '/api';

export const verificationService = {
  // Confirm an email from the link token (public; the token is the authority).
  // Story 7.13 (hard gate): the link is clicked while logged out and the server
  // auto-logs-in on success, returning the user so the client can hydrate auth.
  async verify(token: string): Promise<User> {
    const res = await apiFetch(`${API_BASE}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Invalid or expired verification link');
    const body = await res.json();
    return body.user as User;
  },

  // Confirm a new email from the change-email link token (public; story 7.11).
  // Returns the newly-confirmed address so the client can refresh it locally.
  async confirmEmailChange(token: string): Promise<string> {
    const res = await apiFetch(`${API_BASE}/auth/change-email/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Invalid or expired link');
    const body = await res.json();
    return body.email as string;
  },

  // Re-send a verification link, keyed by email (story 7.13: the user isn't
  // logged in under the hard gate). The server always answers generically, so a
  // success here reveals nothing about whether the email exists.
  async resend(email: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/auth/verify-email/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Could not resend the verification email');
  },
};
