import { catalogService, CatalogNotFoundError, CatalogConflictError } from '../services/catalogService';
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
