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
