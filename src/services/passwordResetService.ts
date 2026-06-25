import { apiFetch } from './apiFetch';

const API_BASE = '/api';

export const passwordResetService = {
  // Request a reset link. The response is always generic (anti-enumeration), so
  // success here just means "the request was accepted".
  async requestReset(email: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Could not process the request');
  },

  // Set a new password from the email link token.
  async reset(token: string, newPassword: string, confirmPassword: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword, confirmPassword }),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Invalid or expired reset link');
  },
};
