import { songPlayService } from '../services/songPlayService';

describe('songPlayService.markPlayed', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;
  afterEach(() => {
    global.fetch = originalFetch;
    // Restore the real location: the 401 test below stubs it
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  test('sends the client-local day (playedOn) and instrument in the POST body (FR19/FR21)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ uid: 'play-1' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await songPlayService.markPlayed('song-1', { instrumentType: 'Guitar', playedOn: '2026-03-10' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/songs/song-1/plays',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ instrumentType: 'Guitar', playedOn: '2026-03-10' });
  });

  test('throws a clear error when the request fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

    await expect(
      songPlayService.markPlayed('song-1', { instrumentType: 'Guitar', playedOn: '2026-03-10' })
    ).rejects.toThrow('Failed to mark song as played');
  });

  test('a 401 through a real service redirects to /login and clears the user (5.1)', async () => {
    localStorage.setItem('user', JSON.stringify({ uid: 'u1' }));
    const assignMock = jest.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/my-sessions', assign: assignMock },
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;

    // On 401 the call hangs (apiFetch never resolves, the page is navigating),
    // so the service never throws a misleading error. Don't await it.
    let threw = false;
    songPlayService.getPlays('song-1').catch(() => { threw = true; });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(localStorage.getItem('user')).toBeNull();
    expect(assignMock).toHaveBeenCalledWith('/login');
    expect(threw).toBe(false);
  });
});
