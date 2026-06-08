import { apiFetch } from './apiFetch';
const API_BASE = '/api/songs';

export interface SongPlay {
  uid: string;
  songUid: string;
  instrumentUid: string | null;
  instrumentType: string | null;
  playedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarkPlayedDTO {
  instrumentType?: string;
  // Client-local day of the play (FR19/FR21): the server no longer dates the
  // play from its own clock. Always YYYY-MM-DD built from local components.
  playedOn: string;
}

export const songPlayService = {
  async markPlayed(songUid: string, dto: MarkPlayedDTO): Promise<SongPlay> {
    const response = await apiFetch(`${API_BASE}/${songUid}/plays`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dto),
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to mark song as played');
    }
    return response.json();
  },

  async getPlays(songUid: string): Promise<SongPlay[]> {
    const response = await apiFetch(`${API_BASE}/${songUid}/plays`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to fetch song plays');
    }
    return response.json();
  },

  getLastPlayForInstrument(plays: SongPlay[], instrumentUid?: string): SongPlay | undefined {
    const filtered = plays.filter(p => p.instrumentUid === (instrumentUid || null));
    return filtered.length > 0 ? filtered[0] : undefined;
  },
};
