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

// The list endpoint is the app's ONLY enveloped response (story 19.3): the client
// needs `total` to paginate. Unit endpoints (detail, add) stay raw.
export type CatalogListResponse = {
  items: CatalogSong[];
  total: number;
  page: number;
  limit: number;
};

export type CatalogListParams = {
  search?: string;
  key?: string;
  mode?: string;
  timeSignature?: string;
  genre?: string;
  sort?: string;
  page?: number;
  limit?: number;
};

// Thrown when a detail lookup 404s (deep-link to a removed/unknown entry). Lets the
// page show a calm not-found instead of a generic error.
export class CatalogNotFoundError extends Error {
  constructor() {
    super('Catalog entry not found');
    this.name = 'CatalogNotFoundError';
  }
}

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
  // Browse the shared Catalog (any logged-in user). Returns the {items,total,page,limit}
  // envelope. `signal` lets the caller abort a superseded request (debounced search).
  async listCatalog(params: CatalogListParams = {}, signal?: AbortSignal): Promise<CatalogListResponse> {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.key) qs.set('key', params.key);
    if (params.mode) qs.set('mode', params.mode);
    if (params.timeSignature) qs.set('timeSignature', params.timeSignature);
    if (params.genre) qs.set('genre', params.genre);
    if (params.sort) qs.set('sort', params.sort);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    const response = await apiFetch(`${API_BASE}/catalog${query ? `?${query}` : ''}`, {
      credentials: 'include',
      signal,
    });
    if (!response.ok) {
      throw new Error('Failed to load the catalog');
    }
    return response.json();
  },

  // Fetch one entry (detail). 404 -> CatalogNotFoundError so the page shows a calm
  // not-found (deep-link to a removed entry).
  async getCatalogEntry(uid: string, signal?: AbortSignal): Promise<CatalogSong> {
    const response = await apiFetch(`${API_BASE}/catalog/${uid}`, {
      credentials: 'include',
      signal,
    });
    if (response.status === 404) {
      throw new CatalogNotFoundError();
    }
    if (!response.ok) {
      throw new Error('Failed to load the catalog entry');
    }
    return response.json();
  },

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
