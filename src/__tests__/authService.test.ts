import { authService } from '../services/authService';
import { clearCsrfToken } from '../services/csrf';

// Mutations first fetch the CSRF token (story 7.3), then hit the endpoint.
function mockFetchWithCsrf(endpointResponse: unknown) {
  return jest.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.endsWith('/csrf-token')) {
      return Promise.resolve({ ok: true, json: async () => ({ csrfToken: 'tok' }) });
    }
    return Promise.resolve(endpointResponse);
  });
}

// AC2: authService is intentionally NOT routed through apiFetch — a 401 on
// /auth/login means bad credentials, which must surface the login error, not
// trigger the session-expired redirect (which would loop / hide the error).
describe('authService excluded from the 401 interceptor', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;
  let assignMock: jest.Mock;

  beforeEach(() => {
    clearCsrfToken();
    assignMock = jest.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/login', assign: assignMock },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  test('a 401 on login surfaces the login error and never redirects', async () => {
    global.fetch = mockFetchWithCsrf({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid credentials' }),
    }) as unknown as typeof fetch;

    await expect(authService.login('bob', 'wrong')).rejects.toThrow('Invalid credentials');
    expect(assignMock).not.toHaveBeenCalled();
  });

  test('a 403 with code email_not_verified → { needsVerification } (not an error)', async () => {
    global.fetch = mockFetchWithCsrf({
      ok: false,
      status: 403,
      json: async () => ({ auth: false, code: 'email_not_verified' }),
    }) as unknown as typeof fetch;

    await expect(authService.login('ada@example.com', 'pw')).resolves.toEqual({
      auth: false,
      needsVerification: true,
    });
  });

  test('a 403 WITHOUT that code throws a clean error (regression: body read only once)', async () => {
    // The body must be read a single time — a second response.json() on the same
    // response would throw "body stream already read" instead of a login error.
    const json = jest.fn().mockResolvedValue({ message: 'Forbidden' });
    global.fetch = mockFetchWithCsrf({ ok: false, status: 403, json }) as unknown as typeof fetch;

    await expect(authService.login('ada@example.com', 'pw')).rejects.toThrow('Forbidden');
    expect(json).toHaveBeenCalledTimes(1);
  });
});

// Best-effort logout (story 7.3): a dead backend / network failure must still
// clear client state, otherwise the UI is stranded "logged in".
describe('authService.logout is best-effort', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearCsrfToken();
    localStorage.setItem('user', JSON.stringify({ uid: 'u1' }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('clears the stored user even when the token fetch / request fails', async () => {
    // First call is GET /csrf-token — reject it to simulate a network outage.
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    await expect(authService.logout()).resolves.toBeUndefined();
    expect(localStorage.getItem('user')).toBeNull();
  });

  test('clears the stored user on a successful logout', async () => {
    global.fetch = mockFetchWithCsrf({ ok: true, status: 200 }) as unknown as typeof fetch;

    await authService.logout();
    expect(localStorage.getItem('user')).toBeNull();
  });
});

// Story 7.7: register has two non-error outcomes — 'created' (new email,
// auto-logged-in) and 'pending' (existing email, generic anti-enumeration
// response). authService discriminates on the response shape.
describe('authService.register outcomes (story 7.7)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => clearCsrfToken());
  afterEach(() => { global.fetch = originalFetch; });

  test('a new email → { status: created, user }', async () => {
    global.fetch = mockFetchWithCsrf({
      ok: true,
      json: async () => ({ uid: 'u1', name: 'Ada', email: 'ada@example.com', isAdmin: false, auth: true }),
    }) as unknown as typeof fetch;

    const result = await authService.register('Ada', 'ada@example.com', 'password123');

    expect(result).toEqual({ status: 'created', user: expect.objectContaining({ uid: 'u1', auth: true }) });
  });

  test('an existing email → { status: pending } (no user, no oracle)', async () => {
    global.fetch = mockFetchWithCsrf({
      ok: true,
      json: async () => ({ auth: false, pending: true }),
    }) as unknown as typeof fetch;

    const result = await authService.register('Ada', 'taken@example.com', 'password123');

    expect(result).toEqual({ status: 'pending' });
  });

  test('a real error (e.g. weak password) throws', async () => {
    global.fetch = mockFetchWithCsrf({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Password must be at least 10 characters' }),
    }) as unknown as typeof fetch;

    await expect(authService.register('Ada', 'a@b.com', 'short')).rejects.toThrow('at least 10 characters');
  });
});
