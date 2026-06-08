import { songPlayService } from '../services/songPlayService';

describe('songPlayService.markPlayed', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
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
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    await expect(
      songPlayService.markPlayed('song-1', { instrumentType: 'Guitar', playedOn: '2026-03-10' })
    ).rejects.toThrow('Failed to mark song as played');
  });
});
