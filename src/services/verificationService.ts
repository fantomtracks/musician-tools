import { apiFetch } from './apiFetch';

const API_BASE = '/api';

export const verificationService = {
  // Confirm an email from the link token (public; the token is the authority).
  async verify(token: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Invalid or expired verification link');
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

  // Re-send a verification link for the logged-in user (rate-limited per account).
  async resend(): Promise<void> {
    const res = await apiFetch(`${API_BASE}/auth/verify-email/resend`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Could not resend the verification email');
  },
};
