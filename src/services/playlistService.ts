import { apiFetch } from './apiFetch';
export type Playlist = {
  uid: string;
  name: string;
  description?: string;
  songUids: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type CreatePlaylistDTO = Omit<Playlist, 'uid' | 'createdAt' | 'updatedAt'>;
export type UpdatePlaylistDTO = Partial<CreatePlaylistDTO>;

// Thrown on a 409 from create/update (story 10.1's case-insensitive name unique
// index). Carries the canonical existing playlist so callers select it
// deterministically instead of creating a duplicate.
export class PlaylistConflictError extends Error {
  existingPlaylist?: Playlist;
  constructor(existingPlaylist?: Playlist) {
    super('Playlist already exists');
    this.name = 'PlaylistConflictError';
    this.existingPlaylist = existingPlaylist;
  }
}

const API_BASE = '/api';

export const playlistService = {
  // Get all playlists
  async getAllPlaylists(): Promise<Playlist[]> {
    const response = await apiFetch(`${API_BASE}/playlists`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to fetch playlists');
    }
    return response.json();
  },

  // Get single playlist by uid
  async getPlaylist(uid: string): Promise<Playlist> {
    const response = await apiFetch(`${API_BASE}/playlists/${uid}`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to fetch playlist');
    }
    return response.json();
  },

  // Create new playlist
  async createPlaylist(playlist: CreatePlaylistDTO): Promise<Playlist> {
    const response = await apiFetch(`${API_BASE}/playlists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(playlist),
      credentials: 'include'
    });
    if (response.status === 409) {
      const body = await response.json().catch(() => ({} as { playlist?: Playlist }));
      throw new PlaylistConflictError(body.playlist ?? undefined);
    }
    if (!response.ok) {
      throw new Error('Failed to create playlist');
    }
    return response.json();
  },

  // Update existing playlist
  async updatePlaylist(uid: string, playlist: UpdatePlaylistDTO): Promise<Playlist> {
    const response = await apiFetch(`${API_BASE}/playlists/${uid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(playlist),
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to update playlist');
    }
    return response.json();
  },

  // Delete playlist
  async deletePlaylist(uid: string): Promise<void> {
    const response = await apiFetch(`${API_BASE}/playlists/${uid}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to delete playlist');
    }
  },

  // Add song to playlist
  async addSongToPlaylist(playlistUid: string, songUid: string): Promise<Playlist> {
    const response = await apiFetch(`${API_BASE}/playlists/${playlistUid}/songs/${songUid}`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to add song to playlist');
    }
    return response.json();
  },

  // Remove song from playlist
  async removeSongFromPlaylist(playlistUid: string, songUid: string): Promise<Playlist> {
    const response = await apiFetch(`${API_BASE}/playlists/${playlistUid}/songs/${songUid}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to remove song from playlist');
    }
    return response.json();
  },
};
