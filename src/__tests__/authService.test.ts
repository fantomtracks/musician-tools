import { authService } from '../services/authService';

// AC2: authService is intentionally NOT routed through apiFetch — a 401 on
// /auth/login means bad credentials, which must surface the login error, not
// trigger the session-expired redirect (which would loop / hide the error).
describe('authService excluded from the 401 interceptor', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;
  let assignMock: jest.Mock;

  beforeEach(() => {
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
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid credentials' }),
    }) as unknown as typeof fetch;

    await expect(authService.login('bob', 'wrong')).rejects.toThrow('Invalid credentials');
    expect(assignMock).not.toHaveBeenCalled();
  });
});
