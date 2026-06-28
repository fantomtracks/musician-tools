import { getCsrfToken, clearCsrfToken } from '../services/csrf';

describe('getCsrfToken', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    clearCsrfToken();
  });

  test('concurrent cold-start calls share a single /csrf-token request', async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    const fetchMock = jest.fn().mockImplementation(() => new Promise(res => { resolveFetch = res; }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const calls = [getCsrfToken(), getCsrfToken(), getCsrfToken()];
    expect(fetchMock).toHaveBeenCalledTimes(1); // deduped before the request resolves

    resolveFetch({ ok: true, json: async () => ({ csrfToken: 'tok' }) });
    await expect(Promise.all(calls)).resolves.toEqual(['tok', 'tok', 'tok']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('caches the token: a later call does not refetch', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, json: async () => ({ csrfToken: 'tok' }),
    }) as unknown as typeof fetch;

    expect(await getCsrfToken()).toBe('tok');
    expect(await getCsrfToken()).toBe('tok');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('forceRefresh refetches even when a token is cached', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrfToken: 'a' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrfToken: 'b' }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await getCsrfToken()).toBe('a');
    expect(await getCsrfToken(true)).toBe('b');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('a failed fetch clears the in-flight slot so the next call retries', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrfToken: 'tok' }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(getCsrfToken()).rejects.toThrow('Failed to obtain CSRF token');
    expect(await getCsrfToken()).toBe('tok'); // not stuck on the rejected promise
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
