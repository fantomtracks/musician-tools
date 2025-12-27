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

const API_BASE = '/api';

export const playlistService = {
  // Get all playlists
  async getAllPlaylists(): Promise<Playlist[]> {
    const response = await fetch(`${API_BASE}/playlists`);
    if (!response.ok) {
      throw new Error('Failed to fetch playlists');
    }
    return response.json();
  },

  // Get single playlist by uid
  async getPlaylist(uid: string): Promise<Playlist> {
    const response = await fetch(`${API_BASE}/playlists/${uid}`);
    if (!response.ok) {
      throw new Error('Failed to fetch playlist');
    }
    return response.json();
  },

  // Create new playlist
  async createPlaylist(playlist: CreatePlaylistDTO): Promise<Playlist> {
    const response = await fetch(`${API_BASE}/playlists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(playlist),
    });
    if (!response.ok) {
      throw new Error('Failed to create playlist');
    }
    return response.json();
  },

  // Update existing playlist
  async updatePlaylist(uid: string, playlist: UpdatePlaylistDTO): Promise<Playlist> {
    const response = await fetch(`${API_BASE}/playlists/${uid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(playlist),
    });
    if (!response.ok) {
      throw new Error('Failed to update playlist');
    }
    return response.json();
  },

  // Delete playlist
  async deletePlaylist(uid: string): Promise<void> {
    const response = await fetch(`${API_BASE}/playlists/${uid}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete playlist');
    }
  },

  // Add song to playlist
  async addSongToPlaylist(playlistUid: string, songUid: string): Promise<Playlist> {
    const response = await fetch(`${API_BASE}/playlists/${playlistUid}/songs/${songUid}`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Failed to add song to playlist');
    }
    return response.json();
  },

  // Remove song from playlist
  async removeSongFromPlaylist(playlistUid: string, songUid: string): Promise<Playlist> {
    const response = await fetch(`${API_BASE}/playlists/${playlistUid}/songs/${songUid}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to remove song from playlist');
    }
    return response.json();
  },
};
