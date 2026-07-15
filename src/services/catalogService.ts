import { apiFetch } from './apiFetch';

// A Catalog entry: the SHARED, canonical song record (story 19.1). Mirrors the
// INTRINSIC subset of Song columns — NO owner, NO instrument/personal fields.
export type CatalogSong = {
  uid: string;
  title: string;
  artist?: string | null;
  album?: string | null;
  key?: string | null;
  bpm?: number | null;
  mode?: string | null;
  timeSignature?: string | null;
  durationSeconds?: number | null;
  language?: string[] | string | null;
  genre?: string[] | null;
  streamingLinks?: Array<{ label: string; url: string }> | null;
  pitchStandard?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateCatalogDTO = Omit<CatalogSong, 'uid' | 'createdAt' | 'updatedAt'>;
export type UpdateCatalogDTO = Partial<CreateCatalogDTO>;

// Thrown on a 409 from create/update (story 19.1's GLOBAL canonical unique index
// on (lower(title), COALESCE(lower(artist),''))). Carries the existing entry so
// callers can point at it. Mirror of SongConflictError, but the backend body key
// is `entry` (not `song`). Detected by response.status — never by the body text.
export class CatalogConflictError extends Error {
  existingEntry?: CatalogSong;
  constructor(existingEntry?: CatalogSong) {
    super('Catalog entry already exists');
    this.name = 'CatalogConflictError';
    this.existingEntry = existingEntry;
  }
}

const API_BASE = '/api';

export const catalogService = {
  // Create a catalog entry (curator only; the route is gated server-side by
  // requireCurator -> 403). apiFetch attaches the CSRF token.
  async createCatalogEntry(entry: CreateCatalogDTO): Promise<CatalogSong> {
    const response = await apiFetch(`${API_BASE}/catalog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(entry),
      credentials: 'include',
    });
    if (response.status === 409) {
      const body = await response.json().catch(() => ({} as { entry?: CatalogSong }));
      throw new CatalogConflictError(body.entry ?? undefined);
    }
    if (!response.ok) {
      throw new Error('Failed to create catalog entry');
    }
    return response.json();
  },

  // Edit a catalog entry in place (curator only). Ready for the edit flow that
  // the browse list (story 19.3) will wire up.
  async updateCatalogEntry(uid: string, entry: UpdateCatalogDTO): Promise<CatalogSong> {
    const response = await apiFetch(`${API_BASE}/catalog/${uid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(entry),
      credentials: 'include',
    });
    if (response.status === 409) {
      const body = await response.json().catch(() => ({} as { entry?: CatalogSong }));
      throw new CatalogConflictError(body.entry ?? undefined);
    }
    if (!response.ok) {
      throw new Error('Failed to update catalog entry');
    }
    return response.json();
  },
};
