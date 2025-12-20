export type Song = {
  uid: string;
  title: string;
  bpm: number;
  key: string;
  chords: string;
  tabs: string;
  instrument: string;
  artist: string;
  lastPlayed?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateSongDTO = Omit<Song, 'uid' | 'createdAt' | 'updatedAt'>;
export type UpdateSongDTO = Partial<CreateSongDTO>;

const API_BASE = '/api';

export const songService = {
  // Get all songs
  async getAllSongs(): Promise<Song[]> {
    const response = await fetch(`${API_BASE}/songs`);
    if (!response.ok) {
      throw new Error('Failed to fetch songs');
    }
    return response.json();
  },

  // Get single song by uid
  async getSong(uid: string): Promise<Song> {
    const response = await fetch(`${API_BASE}/songs/${uid}`);
    if (!response.ok) {
      throw new Error('Failed to fetch song');
    }
    return response.json();
  },

  // Create new song
  async createSong(song: CreateSongDTO): Promise<Song> {
    const response = await fetch(`${API_BASE}/songs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(song),
    });
    if (!response.ok) {
      throw new Error('Failed to create song');
    }
    return response.json();
  },

  // Update existing song
  async updateSong(uid: string, song: UpdateSongDTO): Promise<Song> {
    const response = await fetch(`${API_BASE}/songs/${uid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(song),
    });
    if (!response.ok) {
      throw new Error('Failed to update song');
    }
    return response.json();
  },

  // Delete song
  async deleteSong(uid: string): Promise<void> {
    const response = await fetch(`${API_BASE}/songs/${uid}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete song');
    }
  },
};
