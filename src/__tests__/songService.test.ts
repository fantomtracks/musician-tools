import { songService, RefreshFromCatalogError } from '../services/songService';
import { clearCsrfToken } from '../services/csrf';

// apiFetch does a CSRF round-trip before a mutation (story 7.3): /csrf-token then the real
// endpoint. Mock keyed on URL so the token fetch is transparent.
function mockFetchWithCsrf(endpointResponse: unknown) {
  return jest.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.endsWith('/csrf-token')) {
      return Promise.resolve({ ok: true, json: async () => ({ csrfToken: 'tok' }) });
    }
    return Promise.resolve(endpointResponse);
  });
}

describe('songService.refreshSongFromCatalog (story 21.2)', () => {
  const originalFetch = global.fetch;
  beforeEach(() => clearCsrfToken());
  afterEach(() => { global.fetch = originalFetch; });

  test('POSTs the refresh URL and returns the updated song', async () => {
    const updated = { uid: 's1', title: 'Zombie', key: 'F#', bpm: 90 };
    const fetchMock = mockFetchWithCsrf({ ok: true, status: 200, json: async () => updated });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(songService.refreshSongFromCatalog('s1')).resolves.toEqual(updated);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/songs/s1/refresh-from-catalog',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
  });

  test('409 source_unavailable → RefreshFromCatalogError code=source_unavailable', async () => {
    const fetchMock = mockFetchWithCsrf({ ok: false, status: 409, json: async () => ({ error: 'source_unavailable' }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(songService.refreshSongFromCatalog('s1')).rejects.toMatchObject({
      name: 'RefreshFromCatalogError', code: 'source_unavailable',
    });
  });

  test('409 not_from_catalog → RefreshFromCatalogError code=not_from_catalog', async () => {
    const fetchMock = mockFetchWithCsrf({ ok: false, status: 409, json: async () => ({ error: 'not_from_catalog' }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(songService.refreshSongFromCatalog('s1')).rejects.toBeInstanceOf(RefreshFromCatalogError);
  });

  test('other error → generic', async () => {
    const fetchMock = mockFetchWithCsrf({ ok: false, status: 500, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(songService.refreshSongFromCatalog('s1')).rejects.toThrow('Failed to refresh from the Catalog');
  });
});
