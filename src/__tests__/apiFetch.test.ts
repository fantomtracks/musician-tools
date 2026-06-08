import { apiFetch } from '../services/apiFetch';

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

  test('forwards the url and init to fetch unchanged', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    const init = { method: 'POST', credentials: 'include' as const, body: '{}' };

    await apiFetch('/api/songs/x/plays', init);

    expect(fetchMock).toHaveBeenCalledWith('/api/songs/x/plays', init);
  });
});
