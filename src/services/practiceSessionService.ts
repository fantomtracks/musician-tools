export type SessionItem = {
  uid: string;
  sessionUid: string;
  songUid?: string | null;
  topicUid?: string | null;
  label: string; // server-side snapshot of the song title / topic name (FR4)
  minutes?: number | null;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

// No label here: it is always resolved server-side from the referenced entity
export type CreateSessionItemDTO = {
  songUid?: string;
  topicUid?: string;
  minutes?: number;
  note?: string;
};

export type PracticeSession = {
  uid: string;
  date: string; // YYYY-MM-DD, client-local day (FR19)
  instrumentType: string;
  durationMinutes?: number | null;
  note?: string | null;
  items?: SessionItem[];
  createdAt?: string;
  updatedAt?: string;
};

export type CreatePracticeSessionDTO = Omit<PracticeSession, 'uid' | 'items' | 'createdAt' | 'updatedAt'> & {
  items?: CreateSessionItemDTO[];
};

// Diff-by-uid semantics: an item with uid updates the existing row (label kept
// unless a new ref is provided), without uid it is created, rows absent from
// the array are deleted.
export type UpdateSessionItemDTO = CreateSessionItemDTO & { uid?: string };

export type UpdatePracticeSessionDTO = Partial<Omit<CreatePracticeSessionDTO, 'items'>> & {
  durationMinutes?: number | null;
  note?: string | null;
  items?: UpdateSessionItemDTO[];
};

export type HeatmapDay = {
  // YYYY-MM-DD. Session days carry the client-local day (FR19); play-only
  // rows (FR22 retro-import) carry the UTC day of the server-stamped playedAt
  // — the best truth available for historical plays.
  date: string;
  totalMinutes: number;
  sessionCount: number;
  // Projected play history (FR22 retro-import) — optional so pre-3.3 payloads
  // and existing test fixtures stay valid
  playCount?: number;
};

// A historical "Mark as Played" projected into the day detail (FR22).
// Presence only: no duration, by design.
export type DayPlay = {
  uid: string;
  songUid: string;
  title: string;
  instrumentType?: string | null;
  playedAt: string;
};

const API_BASE = '/api';

export const practiceSessionService = {
  async getHeatmap(year: number): Promise<HeatmapDay[]> {
    const res = await fetch(`${API_BASE}/sessions/heatmap?year=${year}`, {
      credentials: 'include'
    });
    if (res.status === 400) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || 'Failed to fetch heatmap');
    }
    if (!res.ok) throw new Error('Failed to fetch heatmap');
    return res.json();
  },
  async getDayPlays(date: string): Promise<DayPlay[]> {
    const res = await fetch(`${API_BASE}/sessions/plays?date=${encodeURIComponent(date)}`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Failed to fetch plays');
    return res.json();
  },
  async getAll(date?: string): Promise<PracticeSession[]> {
    const res = await fetch(`${API_BASE}/sessions${date ? `?date=${encodeURIComponent(date)}` : ''}`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Failed to fetch sessions');
    return res.json();
  },
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
  async update(uid: string, payload: UpdatePracticeSessionDTO): Promise<PracticeSession> {
    const res = await fetch(`${API_BASE}/sessions/${uid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include'
    });
    if (res.status === 400) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || 'Failed to update session');
    }
    if (!res.ok) throw new Error('Failed to update session');
    return res.json();
  },
  async remove(uid: string): Promise<void> {
    const res = await fetch(`${API_BASE}/sessions/${uid}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) throw new Error('Failed to delete session');
  },
};
