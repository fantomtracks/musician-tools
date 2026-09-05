import { apiFetch } from './apiFetch';
import { SongConflictError } from './songService';
import type { Song } from './songService';

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
  publishedAt?: string | null; // null = draft (19.6) ; timestamp = published
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

// Distinct filterable values present in the whole Catalog, for the browse facet pills.
export type CatalogFacets = {
  genre: string[];
  key: string[];
  mode: string[];
  timeSignature: string[];
  artist?: string[]; // 19.6 — curator form autocomplete (browse pills ignore these)
  album?: string[];
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
  includeDrafts?: boolean; // curator hub only (19.6) — honoured server-side iff isCurator
};

// A MusicBrainz recording that is NOT already a published Catalog entry. Import
// writes the user's Songlist via POST /api/songs (not a Catalog fiche).
export type MusicBrainzHit = {
  mbid: string;
  title: string;
  artist?: string | null;
  album?: string | null;
  durationSeconds?: number | null;
};

export type MusicBrainzArtist = {
  mbid: string;
  name: string;
};

export type MusicBrainzPage<T> = {
  items: T[];
  total: number;
  offset: number;
  limit: number;
};

// Initial MusicBrainz search: first page of artists + matching songs. Later
// pages lazy-load one list at a time (`kind` + `offset`).
export type MusicBrainzSearchResponse = {
  artists: MusicBrainzPage<MusicBrainzArtist>;
  recordings: MusicBrainzPage<MusicBrainzHit>;
};

export const emptyMusicBrainzPage = <T,>(offset = 0, limit = 8): MusicBrainzPage<T> => ({
  items: [],
  total: 0,
  offset,
  limit,
});

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

// A Collection = a curated, SHARED grouping of catalog entries (story 20.1). List
// shape carries a member count; detail carries the member entries themselves.
export type CatalogCollection = {
  uid: string;
  name: string;
  description?: string | null;
  songCount: number;
};

export type CatalogCollectionDetail = {
  uid: string;
  name: string;
  description?: string | null;
  songs: CatalogSong[];
};

// Recap of a whole-collection import into the user's Songlist (story 20.3):
// `added` newly copied, `skipped` already owned, `failed` errored, plus the mirror
// playlist's uid (created or reused).
export type ImportCollectionResult = {
  added: number;
  skipped: number;
  failed: number;
  playlistUid: string;
};

// Thrown on a 404 from a Collection detail/mutation (deep-link or concurrent delete),
// so a page can show a calm not-found. Mirror of CatalogNotFoundError.
export class CollectionNotFoundError extends Error {
  constructor() {
    super('Collection not found');
    this.name = 'CollectionNotFoundError';
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
    if (params.includeDrafts) qs.set('includeDrafts', '1');
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

  // MusicBrainz extras for a catalog text search (artists + songs). Empty `q`
  // is a no-op on the server. `signal` aborts a superseded request. Pass
  // `kind` + `offset` to lazy-load the next page of one list.
  async searchMusicBrainz(
    q: string,
    signal?: AbortSignal,
    opts?: { kind?: 'artists' | 'recordings'; offset?: number },
  ): Promise<MusicBrainzSearchResponse> {
    const qs = new URLSearchParams();
    qs.set('q', q);
    if (opts?.kind) qs.set('kind', opts.kind);
    if (opts?.offset != null) qs.set('offset', String(opts.offset));
    const response = await apiFetch(`${API_BASE}/catalog/musicbrainz-search?${qs.toString()}`, {
      credentials: 'include',
      signal,
    });
    if (!response.ok) {
      throw new Error('Failed to search MusicBrainz');
    }
    return response.json();
  },

  async listMusicBrainzArtistRecordings(
    mbid: string,
    signal?: AbortSignal,
    offset = 0,
  ): Promise<MusicBrainzPage<MusicBrainzHit>> {
    const qs = new URLSearchParams();
    if (offset) qs.set('offset', String(offset));
    const query = qs.toString();
    const response = await apiFetch(
      `${API_BASE}/catalog/musicbrainz-artists/${mbid}/recordings${query ? `?${query}` : ''}`,
      { credentials: 'include', signal },
    );
    if (!response.ok) {
      throw new Error('Failed to load MusicBrainz recordings');
    }
    return response.json();
  },

  // Import a MusicBrainz recording into the user's Songlist. The server looks
  // the MBID up (genre / language / links) and falls back to the list-row fields.
  async importMusicBrainzRecording(hit: MusicBrainzHit): Promise<Song> {
    const response = await apiFetch(`${API_BASE}/catalog/musicbrainz-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        mbid: hit.mbid,
        title: hit.title,
        artist: hit.artist ?? null,
        album: hit.album ?? null,
        durationSeconds: hit.durationSeconds ?? null,
      }),
    });
    if (response.status === 409) {
      const body = await response.json().catch(() => ({} as { song?: Song }));
      throw new SongConflictError(body.song ?? undefined);
    }
    if (!response.ok) {
      throw new Error('Failed to import MusicBrainz recording');
    }
    return response.json();
  },

  // The distinct filterable values across the whole Catalog (for the facet pills).
  async getFacets(signal?: AbortSignal, includeDrafts = false): Promise<CatalogFacets> {
    const qs = includeDrafts ? '?includeDrafts=1' : '';
    const response = await apiFetch(`${API_BASE}/catalog/facets${qs}`, { credentials: 'include', signal });
    if (!response.ok) {
      throw new Error('Failed to load catalog facets');
    }
    return response.json();
  },

  // EXACT (title, artist) duplicate check (curator only, story 19.12). Reuses the
  // server's folded lookup (drafts AND published) — replaces the old best-effort
  // list+substring+client-fold. Returns { exists, entry }. `excludeUid` skips the row
  // being edited (rename). `signal` aborts a superseded debounced check.
  async checkCatalogExists(
    title: string,
    artist?: string,
    excludeUid?: string,
    signal?: AbortSignal,
  ): Promise<{ exists: boolean; entry?: CatalogSong | null }> {
    const qs = new URLSearchParams();
    qs.set('title', title);
    if (artist) qs.set('artist', artist);
    if (excludeUid) qs.set('excludeUid', excludeUid);
    const response = await apiFetch(`${API_BASE}/catalog/exists?${qs.toString()}`, {
      credentials: 'include',
      signal,
    });
    if (!response.ok) {
      throw new Error('Failed to check catalog existence');
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

  // Add a catalog entry to the user's Songlist (snapshot + provenance, story 19.4).
  // 201 -> the created Song. 409 (already in the songlist, Epic 17 guard) ->
  // SongConflictError carrying the existing Song (reused from songService).
  async addToSonglist(uid: string): Promise<Song> {
    const response = await apiFetch(`${API_BASE}/catalog/${uid}/add-to-songlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (response.status === 409) {
      const body = await response.json().catch(() => ({} as { song?: Song }));
      throw new SongConflictError(body.song ?? undefined);
    }
    if (response.status === 404) {
      // The entry was removed from the Catalog (e.g. curator deleted it) — a
      // permanent failure, not a retryable one.
      throw new CatalogNotFoundError();
    }
    if (!response.ok) {
      throw new Error('Failed to add to songlist');
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

  // Delete a catalog entry (curator only). A 404 (already removed elsewhere) is
  // surfaced as CatalogNotFoundError so the manage list can drop the row calmly.
  // Deleting a fiche does NOT touch Songs users already copied from it — there is
  // no FK on Song.sourceCatalogUid (soft reference, §4.7), so it just goes dangling.
  async deleteCatalogEntry(uid: string): Promise<void> {
    const response = await apiFetch(`${API_BASE}/catalog/${uid}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (response.status === 404) {
      throw new CatalogNotFoundError();
    }
    if (!response.ok) {
      throw new Error('Failed to delete catalog entry');
    }
  },

  // Publish a draft (curator, 19.6). 409 = a PUBLISHED entry owns the canonical key
  // (CatalogConflictError carries it) ; 404 = gone ; 400 = missing title.
  async publishCatalogEntry(uid: string): Promise<CatalogSong> {
    const response = await apiFetch(`${API_BASE}/catalog/${uid}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (response.status === 409) {
      const body = await response.json().catch(() => ({} as { entry?: CatalogSong }));
      throw new CatalogConflictError(body.entry ?? undefined);
    }
    if (response.status === 404) {
      throw new CatalogNotFoundError();
    }
    if (!response.ok) {
      throw new Error('Failed to publish catalog entry');
    }
    return response.json();
  },

  // ---- Story 20.2: Collections (curator) ----

  // List all Collections (name + member count). Any logged-in user; the curator hub
  // uses it. `signal` aborts a superseded request.
  async listCollections(signal?: AbortSignal): Promise<CatalogCollection[]> {
    const response = await apiFetch(`${API_BASE}/catalog/collections`, { credentials: 'include', signal });
    if (!response.ok) {
      throw new Error('Failed to load collections');
    }
    return response.json();
  },

  // Create a Collection (curator; requireCurator -> 403). 400 if name is empty. The
  // API returns the created row (no `songs` / `songCount`) — callers use uid/name only.
  async createCollection(name: string, description?: string | null): Promise<{ uid: string; name: string; description?: string | null }> {
    const response = await apiFetch(`${API_BASE}/catalog/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description ?? null }),
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error('Failed to create collection');
    }
    return response.json();
  },

  // Fetch one Collection with its member entries. The curator sees draft members
  // (20.1 draft-safety gates on isCurator). 404 -> CollectionNotFoundError.
  async getCollection(uid: string, signal?: AbortSignal): Promise<CatalogCollectionDetail> {
    const response = await apiFetch(`${API_BASE}/catalog/collections/${uid}`, { credentials: 'include', signal });
    if (response.status === 404) {
      throw new CollectionNotFoundError();
    }
    if (!response.ok) {
      throw new Error('Failed to load the collection');
    }
    return response.json();
  },

  // Rename / re-describe a Collection (curator). 404 -> CollectionNotFoundError. Returns
  // the updated row (no `songs`); callers use name only.
  async updateCollection(uid: string, changes: { name?: string; description?: string | null }): Promise<{ uid: string; name: string; description?: string | null }> {
    const response = await apiFetch(`${API_BASE}/catalog/collections/${uid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
      credentials: 'include',
    });
    if (response.status === 404) {
      throw new CollectionNotFoundError();
    }
    if (!response.ok) {
      throw new Error('Failed to update the collection');
    }
    return response.json();
  },

  // Delete a Collection (curator). Cascades its join rows; the entries survive.
  async deleteCollection(uid: string): Promise<void> {
    const response = await apiFetch(`${API_BASE}/catalog/collections/${uid}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (response.status === 404) {
      throw new CollectionNotFoundError();
    }
    if (!response.ok) {
      throw new Error('Failed to delete the collection');
    }
  },

  // Add a catalog entry to a Collection (curator). Idempotent server-side: the
  // controller's findOrCreate on the composite unique answers 201 when it created the
  // link and 200 when it was already there. We SURFACE that (story 22.2): the bulk
  // "Add to collection" recap has to count an already-member entry as "already in",
  // never as a failure, and no other signal distinguishes the two.
  // 404 -> the collection or the entry is gone.
  async addSongToCollection(uid: string, catalogSongUid: string): Promise<'added' | 'already-in'> {
    const response = await apiFetch(`${API_BASE}/catalog/collections/${uid}/songs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catalogSongUid }),
      credentials: 'include',
    });
    if (response.status === 404) {
      throw new CollectionNotFoundError();
    }
    if (!response.ok) {
      throw new Error('Failed to add to the collection');
    }
    return response.status === 201 ? 'added' : 'already-in';
  },

  // Remove a catalog entry from a Collection (curator). Idempotent.
  async removeSongFromCollection(uid: string, catalogSongUid: string): Promise<void> {
    const response = await apiFetch(`${API_BASE}/catalog/collections/${uid}/songs/${catalogSongUid}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error('Failed to remove from the collection');
    }
  },

  // Import a whole Collection into the user's Songlist (story 20.3, any logged-in user):
  // copies every published member (best-effort) + creates/reuses a mirror Playlist named
  // after the Collection. Returns the {added,skipped,failed,playlistUid} recap. 404 -> gone.
  async importCollection(uid: string, signal?: AbortSignal): Promise<ImportCollectionResult> {
    const response = await apiFetch(`${API_BASE}/catalog/collections/${uid}/add-to-songlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal,
    });
    if (response.status === 404) {
      throw new CollectionNotFoundError();
    }
    if (!response.ok) {
      throw new Error('Failed to import the collection');
    }
    return response.json();
  },
};
