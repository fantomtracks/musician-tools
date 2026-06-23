import { apiFetch } from '../services/apiFetch';
import { clearCsrfToken } from '../services/csrf';

// Flush pending microtasks/timers so the post-fetch interceptor body runs
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('apiFetch — 401 interceptor', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;
  let assignMock: jest.Mock;

  function setLocation(pathname: string) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname, assign: assignMock },
    });
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('user', JSON.stringify({ uid: 'u1' }));
    assignMock = jest.fn();
    setLocation('/my-sessions');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    // Restore the real location so the stub never leaks into another test
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  test('a 401 clears the stored user and redirects to /login (and never resolves)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 401, ok: false }) as unknown as typeof fetch;

    let settled = false;
    // Do NOT await: on 401 the promise intentionally hangs (page is navigating)
    apiFetch('/api/sessions', { credentials: 'include' }).then(() => { settled = true; });
    await flush();

    expect(localStorage.getItem('user')).toBeNull();
    expect(assignMock).toHaveBeenCalledWith('/login');
    expect(settled).toBe(false); // hung, so the caller never throws a data error
  });

  test('a 401 while already on /login does NOT redirect (no loop) and resolves', async () => {
    setLocation('/login');
    global.fetch = jest.fn().mockResolvedValue({ status: 401, ok: false }) as unknown as typeof fetch;

    const res = await apiFetch('/api/auth/me', { credentials: 'include' });

    expect(assignMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('user')).not.toBeNull();
    expect((res as unknown as { status: number }).status).toBe(401);
  });

  test('a 200 passes through untouched', async () => {
    const ok = { status: 200, ok: true };
    global.fetch = jest.fn().mockResolvedValue(ok) as unknown as typeof fetch;

    const res = await apiFetch('/api/sessions', { credentials: 'include' });

    expect(res).toBe(ok);
    expect(assignMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('user')).not.toBeNull();
  });

  test('a non-401 error (500) is returned as-is, no redirect (the caller still throws)', async () => {
    const serverError = { status: 500, ok: false };
    global.fetch = jest.fn().mockResolvedValue(serverError) as unknown as typeof fetch;

    const res = await apiFetch('/api/sessions', { credentials: 'include' });

    expect(res).toBe(serverError);
    expect(assignMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('user')).not.toBeNull();
  });

  test('a network rejection propagates and does NOT redirect (AC3)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    await expect(apiFetch('/api/sessions', { credentials: 'include' })).rejects.toThrow('network down');
    expect(assignMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('user')).not.toBeNull();
  });

  test('forwards a GET url and init to fetch unchanged (safe method, no CSRF)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    const init = { credentials: 'include' as const };

    await apiFetch('/api/sessions', init);

    expect(fetchMock).toHaveBeenCalledWith('/api/sessions', init);
  });
});

describe('apiFetch — CSRF injection (story 7.3)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearCsrfToken();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('a mutation fetches the token then injects X-CSRF-Token', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrfToken: 'tok-123' }) }) // GET /csrf-token
      .mockResolvedValueOnce({ status: 201, ok: true }); // the mutation
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiFetch('/api/topics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/csrf-token', { credentials: 'include' });
    const [, mutationInit] = fetchMock.mock.calls[1];
    expect(mutationInit.headers['X-CSRF-Token']).toBe('tok-123');
    expect(mutationInit.headers['Content-Type']).toBe('application/json'); // existing header preserved
  });

  // A response carrying the server's CSRF-failure marker (X-CSRF-Token-Invalid).
  const csrfRejected = { status: 403, ok: false, headers: { get: (h: string) => (h === 'X-CSRF-Token-Invalid' ? '1' : null) } };
  // A legitimate authorization 403 (non-owner, system topic) — no marker.
  const authzRejected = { status: 403, ok: false, headers: { get: () => null } };

  test('a CSRF-flagged 403 refreshes the token and retries the mutation once', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrfToken: 'stale' }) }) // first token
      .mockResolvedValueOnce(csrfRejected) // mutation rejected by CSRF guard
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrfToken: 'fresh' }) }) // refreshed token
      .mockResolvedValueOnce({ status: 200, ok: true }); // retry succeeds
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await apiFetch('/api/topics/1', { method: 'DELETE' });

    expect((res as unknown as { status: number }).status).toBe(200);
    expect(fetchMock.mock.calls[1][1].headers['X-CSRF-Token']).toBe('stale');
    expect(fetchMock.mock.calls[3][1].headers['X-CSRF-Token']).toBe('fresh');
  });

  test('a plain authorization 403 (no CSRF marker) is returned as-is, not retried', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrfToken: 'tok' }) }) // token
      .mockResolvedValueOnce(authzRejected); // authz failure — must NOT trigger refresh/replay
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await apiFetch('/api/topics/1', { method: 'DELETE' });

    expect(res).toBe(authzRejected);
    expect(fetchMock).toHaveBeenCalledTimes(2); // token + single mutation, no retry
  });
});
