import { catalogService, CatalogNotFoundError } from '../services/catalogService';
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
