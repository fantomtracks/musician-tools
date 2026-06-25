import { apiFetch } from './apiFetch';

export type Profile = {
  uid: string;
  name: string;
  discriminator: string;
  handle: string;
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
};

export type NameUpdate = {
  name: string;
  discriminator: string;
  handle: string;
};

const API_BASE = '/api';

export const profileService = {
  async getProfile(): Promise<Profile> {
    const res = await apiFetch(`${API_BASE}/account`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load profile');
    return res.json();
  },

  async updateName(name: string): Promise<NameUpdate> {
    const res = await apiFetch(`${API_BASE}/account/name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      credentials: 'include',
    });
    if (res.status === 409) throw new Error('This display name is full, please choose another.');
    if (!res.ok) throw new Error('Failed to update name');
    return res.json();
  },

  async changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/account/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      credentials: 'include',
    });
    if (!res.ok) {
      // Surface the server's message (e.g. "Current password is incorrect") when present.
      let message = 'Failed to change password';
      try {
        const body = await res.json();
        if (body && body.message) message = body.message;
      } catch { /* keep the default message */ }
      throw new Error(message);
    }
  },
};
