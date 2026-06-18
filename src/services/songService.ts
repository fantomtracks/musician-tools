import { apiFetch } from './apiFetch';
export type Song = {
  uid: string;
  title: string;
  bpm: number | null;
  durationSeconds?: number | null;
  key: string;
  capo?: number | null;
  timeSignature?: string;
  mode?: string;
  notes: string;
  instrument: string[] | null;
  instrumentLinks?: Record<string, Array<{ label?: string; url: string }>>;
  instrumentDifficulty?: Record<string, number | null>;
  artist: string;
  album?: string;
  language?: string[] | string | null;
  genre?: string[] | null;
  technique?: string[];
  pitchStandard?: number;
  instrumentTuning?: Record<string, string | null>;
  myInstrumentUid?: string;
  lastPlayed?: string;
  streamingLinks?: Array<{ label: string; url: string }>;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateSongDTO = Omit<Song, 'uid' | 'createdAt' | 'updatedAt'>;
export type UpdateSongDTO = Partial<CreateSongDTO>;

const API_BASE = '/api';

export const songService = {
  // Get all songs
  async getAllSongs(): Promise<Song[]> {
    const response = await apiFetch(`${API_BASE}/songs`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to fetch songs');
    }
    return response.json();
  },

  // Get single song by uid
  async getSong(uid: string): Promise<Song> {
    const response = await apiFetch(`${API_BASE}/songs/${uid}`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to fetch song');
    }
    return response.json();
  },

  // Create new song
  async createSong(song: CreateSongDTO): Promise<Song> {
    const response = await apiFetch(`${API_BASE}/songs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(song),
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to create song');
    }
    return response.json();
  },

  // Update existing song
  async updateSong(uid: string, song: UpdateSongDTO): Promise<Song> {
    const response = await apiFetch(`${API_BASE}/songs/${uid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(song),
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to update song');
    }
    return response.json();
  },

  // Delete song
  async deleteSong(uid: string): Promise<void> {
    const response = await apiFetch(`${API_BASE}/songs/${uid}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to delete song');
    }
  },

  async lookupMetadata(title: string, artist: string): Promise<{
    bpm: number | null;
    key: string | null;
    mode: string | null;
    timeSignature: string | null;
    genres: string[];
    album: string | null;
    source: string;
  }> {
    const params = new URLSearchParams({ title, artist });
    const response = await apiFetch(`${API_BASE}/songs/lookup?${params.toString()}`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to lookup song metadata');
    }
    return response.json();
  },
};
