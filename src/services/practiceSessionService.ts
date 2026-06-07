export type PracticeSession = {
  uid: string;
  date: string; // YYYY-MM-DD, client-local day (FR19)
  instrumentType: string;
  durationMinutes?: number | null;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreatePracticeSessionDTO = Omit<PracticeSession, 'uid' | 'createdAt' | 'updatedAt'>;

const API_BASE = '/api';

export const practiceSessionService = {
  async create(payload: CreatePracticeSessionDTO): Promise<PracticeSession> {
    const res = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include'
    });
    if (res.status === 400) {
      // Surface the server's validation message (e.g. a clock-skewed client
      // failing the future-date bound would otherwise see a useless generic error)
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || 'Failed to create session');
    }
    if (!res.ok) throw new Error('Failed to create session');
    return res.json();
  },
};
