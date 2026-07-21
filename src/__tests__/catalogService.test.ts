import { catalogService, CatalogNotFoundError, CatalogConflictError, CollectionNotFoundError } from '../services/catalogService';
import { clearCsrfToken } from '../services/csrf';

// apiFetch does a CSRF round-trip before a mutation (story 7.3): /csrf-token then
// the real endpoint. Mock keyed on URL so the token fetch is transparent here.
function mockFetchWithCsrf(endpointResponse: unknown) {
  return jest.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.endsWith('/csrf-token')) {
      return Promise.resolve({ ok: true, json: async () => ({ csrfToken: 'tok' }) });
    }
    return Promise.resolve(endpointResponse);
  });
}

describe('catalogService.deleteCatalogEntry', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    clearCsrfToken();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('DELETEs /api/catalog/:uid and resolves on 200', async () => {
    const fetchMock = mockFetchWithCsrf({ ok: true, status: 200, json: async () => ({ message: 'Catalog entry deleted' }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(catalogService.deleteCatalogEntry('uid-1')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/catalog/uid-1',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' })
    );
  });

  test('throws CatalogNotFoundError on 404 (already deleted)', async () => {
    const fetchMock = mockFetchWithCsrf({ ok: false, status: 404, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(catalogService.deleteCatalogEntry('gone')).rejects.toBeInstanceOf(CatalogNotFoundError);
  });

  test('throws a generic error on 500', async () => {
    const fetchMock = mockFetchWithCsrf({ ok: false, status: 500, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(catalogService.deleteCatalogEntry('boom')).rejects.toThrow('Failed to delete catalog entry');
  });
});

describe('catalogService.publishCatalogEntry', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { clearCsrfToken(); });
  afterEach(() => { global.fetch = originalFetch; });

  test('POSTs /api/catalog/:uid/publish and returns the entry on 200', async () => {
    const fetchMock = mockFetchWithCsrf({ ok: true, status: 200, json: async () => ({ uid: 'c1', publishedAt: '2026-01-01' }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const entry = await catalogService.publishCatalogEntry('c1');
    expect(entry.uid).toBe('c1');
    expect(fetchMock).toHaveBeenCalledWith('/api/catalog/c1/publish', expect.objectContaining({ method: 'POST', credentials: 'include' }));
  });

  test('throws CatalogConflictError on 409 (a published entry owns the key)', async () => {
    const fetchMock = mockFetchWithCsrf({ ok: false, status: 409, json: async () => ({ entry: { uid: 'dup' } }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(catalogService.publishCatalogEntry('c1')).rejects.toBeInstanceOf(CatalogConflictError);
  });

  test('throws CatalogNotFoundError on 404', async () => {
    const fetchMock = mockFetchWithCsrf({ ok: false, status: 404, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(catalogService.publishCatalogEntry('gone')).rejects.toBeInstanceOf(CatalogNotFoundError);
  });
});

describe('catalogService.listCatalog includeDrafts', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  test('adds includeDrafts=1 to the query when requested (curator hub)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [], total: 0, page: 1, limit: 24 }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await catalogService.listCatalog({ includeDrafts: true });
    expect(fetchMock.mock.calls[0][0] as string).toContain('includeDrafts=1');
  });

  test('omits includeDrafts by default (public browse)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [], total: 0, page: 1, limit: 24 }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await catalogService.listCatalog({});
    expect(fetchMock.mock.calls[0][0] as string).not.toContain('includeDrafts');
  });
});

describe('catalogService.checkCatalogExists', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  test('builds the query with title, artist, excludeUid and parses {exists,entry}', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ exists: true, entry: { uid: 'dup' } }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const res = await catalogService.checkCatalogExists('Zombie', 'The Cranberries', 'uid-1');
    expect(res.exists).toBe(true);
    expect(res.entry).toEqual({ uid: 'dup' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/catalog/exists?');
    expect(url).toContain('title=Zombie');
    expect(url).toContain('artist=The+Cranberries');
    expect(url).toContain('excludeUid=uid-1');
  });

  test('omits artist and excludeUid when not provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ exists: false, entry: null }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await catalogService.checkCatalogExists('Solo');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('title=Solo');
    expect(url).not.toContain('artist=');
    expect(url).not.toContain('excludeUid=');
  });

  test('throws on a non-ok response', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(catalogService.checkCatalogExists('X')).rejects.toThrow('Failed to check catalog existence');
  });
});

// ---- Story 20.2: Collections ----

describe('catalogService Collections', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { clearCsrfToken(); });
  afterEach(() => { global.fetch = originalFetch; });

  test('listCollections GETs /api/catalog/collections', async () => {
    const rows = [{ uid: 'col1', name: 'Rock 90s', description: null, songCount: 2 }];
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => rows });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(catalogService.listCollections()).resolves.toEqual(rows);
    expect(fetchMock).toHaveBeenCalledWith('/api/catalog/collections', expect.objectContaining({ credentials: 'include' }));
  });

  test('createCollection POSTs the name and returns the collection', async () => {
    const created = { uid: 'newc', name: 'Jazz', description: null, songs: [] };
    const fetchMock = mockFetchWithCsrf({ ok: true, status: 201, json: async () => created });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(catalogService.createCollection('Jazz')).resolves.toEqual(created);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/catalog/collections',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Jazz', description: null }) })
    );
  });

  test('getCollection throws CollectionNotFoundError on 404', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(catalogService.getCollection('gone')).rejects.toBeInstanceOf(CollectionNotFoundError);
  });

  test('addSongToCollection POSTs the catalogSongUid', async () => {
    const fetchMock = mockFetchWithCsrf({ ok: true, status: 201, json: async () => ({ message: 'Added to collection' }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(catalogService.addSongToCollection('col1', 's1')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/catalog/collections/col1/songs',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ catalogSongUid: 's1' }) })
    );
  });

  test('removeSongFromCollection DELETEs the nested path', async () => {
    const fetchMock = mockFetchWithCsrf({ ok: true, status: 200, json: async () => ({ message: 'Removed from collection' }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(catalogService.removeSongFromCollection('col1', 's1')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/catalog/collections/col1/songs/s1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  test('deleteCollection throws CollectionNotFoundError on 404', async () => {
    const fetchMock = mockFetchWithCsrf({ ok: false, status: 404, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(catalogService.deleteCollection('gone')).rejects.toBeInstanceOf(CollectionNotFoundError);
  });
});

// ---- Story 20.4: import a Collection ----

describe('catalogService.importCollection', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { clearCsrfToken(); });
  afterEach(() => { global.fetch = originalFetch; });

  test('POSTs add-to-songlist and returns the recap', async () => {
    const recap = { added: 18, skipped: 2, failed: 0, playlistUid: 'p1' };
    const fetchMock = mockFetchWithCsrf({ ok: true, status: 200, json: async () => recap });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(catalogService.importCollection('col1')).resolves.toEqual(recap);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/catalog/collections/col1/add-to-songlist',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
  });

  test('throws CollectionNotFoundError on 404', async () => {
    const fetchMock = mockFetchWithCsrf({ ok: false, status: 404, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(catalogService.importCollection('gone')).rejects.toBeInstanceOf(CollectionNotFoundError);
  });
});
