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
  // Story 21.1/21.2: present (from getSong) when this song is a Catalog copy AND the
  // source is still published. `drift` = the source changed since this copy was synced.
  sourceCatalog?: { uid: string; updatedAt: string; drift: boolean };
};

export type CreateSongDTO = Omit<Song, 'uid' | 'createdAt' | 'updatedAt'>;
export type UpdateSongDTO = Partial<CreateSongDTO>;

// Thrown on a 409 from create/update (story 17.1's case-insensitive
// (user_uid, lower(title), COALESCE(lower(artist),'')) unique index). Carries the
// canonical existing song so callers can block the write and point at it. Mirror
// of PlaylistConflictError. Detected by response.status — never by the body text.
export class SongConflictError extends Error {
  existingSong?: Song;
  constructor(existingSong?: Song) {
    super('Song already exists');
    this.name = 'SongConflictError';
    this.existingSong = existingSong;
  }
}

// Thrown on a 409 from refresh-from-catalog (story 21.1): the copy can't be refreshed
// because it isn't a Catalog copy (`not_from_catalog`) or its source was deleted/unpublished
// (`source_unavailable`). Carries the code so the UI can distinguish the messages.
export class RefreshFromCatalogError extends Error {
  code: 'not_from_catalog' | 'source_unavailable';
  constructor(code: 'not_from_catalog' | 'source_unavailable') {
    super(code === 'source_unavailable' ? 'The source is no longer in the Catalog' : 'This song was not added from the Catalog');
    this.name = 'RefreshFromCatalogError';
    this.code = code;
  }
}

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

  // Story 21.2: pull the current Catalog version into this copy (overwrites the intrinsic
  // fields, preserves personal + identity — story 21.1). Returns the updated Song.
  async refreshSongFromCatalog(uid: string): Promise<Song> {
    const response = await apiFetch(`${API_BASE}/songs/${uid}/refresh-from-catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (response.status === 409) {
      const body = await response.json().catch(() => ({} as { error?: string }));
      throw new RefreshFromCatalogError(body.error === 'source_unavailable' ? 'source_unavailable' : 'not_from_catalog');
    }
    if (!response.ok) {
      throw new Error('Failed to refresh from the Catalog');
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
    if (response.status === 409) {
      const body = await response.json().catch(() => ({} as { song?: Song }));
      throw new SongConflictError(body.song ?? undefined);
    }
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
    if (response.status === 409) {
      const body = await response.json().catch(() => ({} as { song?: Song }));
      throw new SongConflictError(body.song ?? undefined);
    }
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
    durationSeconds: number | null;
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
