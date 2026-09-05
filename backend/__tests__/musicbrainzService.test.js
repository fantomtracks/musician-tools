'use strict';

const {
  escapeLucene,
  artistQuery,
  recordingQuery,
  mapArtists,
  mapRecordings,
  mapPopularRecordings,
  searchArtists,
  searchRecordings,
  searchArtistsAndRecordings,
  listPopularRecordingsByArtist,
  resetForTests,
  USER_AGENT,
} = require('../services/musicbrainzService');

const ARTIST_MBID = '0383dadf-2a4e-4d10-a46a-e9e041da8eb3';

describe('musicbrainzService mapping', () => {
  test('escapeLucene escapes specials used in Lucene queries', () => {
    expect(escapeLucene('foo:bar +baz')).toBe('foo\\:bar \\+baz');
  });

  test('artistQuery and recordingQuery target the right Lucene fields', () => {
    expect(artistQuery('cranberries')).toBe('artist:(cranberries)');
    expect(recordingQuery('zombie')).toBe('recording:(zombie)');
  });

  test('mapArtists maps name and mbid', () => {
    expect(mapArtists({
      artists: [
        { id: ARTIST_MBID, name: 'The Cranberries' },
        { id: 'x', name: '  ' },
      ],
    })).toEqual([{ mbid: ARTIST_MBID, name: 'The Cranberries' }]);
  });

  test('mapRecordings skips videos, maps artist-credit and official album, and folds duplicate titles', () => {
    const items = mapRecordings({
      recordings: [
        {
          id: 'r1',
          title: 'Zombie',
          length: 308000,
          'artist-credit': [{ artist: { name: 'The Cranberries' } }],
          releases: [{ title: 'Promo', status: 'Promotion' }, { title: 'No Need to Argue', status: 'Official' }],
        },
        {
          id: 'r1-live',
          title: 'Zombie',
          'artist-credit': [{ artist: { name: 'The Cranberries' } }],
        },
        { id: 'r-vid', title: 'Live clip', video: true, 'artist-credit': [{ artist: { name: 'X' } }] },
        { id: 'r2', title: 'Linger', length: 274000, 'artist-credit': [{ artist: { name: 'The Cranberries' } }] },
      ],
    });
    expect(items).toEqual([
      { mbid: 'r1', title: 'Zombie', artist: 'The Cranberries', album: 'No Need to Argue', durationSeconds: 308 },
      { mbid: 'r2', title: 'Linger', artist: 'The Cranberries', album: null, durationSeconds: 274 },
    ]);
  });

  test('mapPopularRecordings keeps listen-count order, maps fields, and folds duplicate titles', () => {
    const items = mapPopularRecordings([
      {
        recording_mbid: 'r1',
        recording_name: 'Zombie',
        artist_name: 'The Cranberries',
        release_name: 'No Need to Argue',
        length: 308000,
        total_listen_count: 9000,
      },
      {
        recording_mbid: 'r1-live',
        recording_name: 'Zombie',
        artist_name: 'The Cranberries',
        release_name: 'B-sides',
        length: 310000,
        total_listen_count: 100,
      },
      {
        recording_mbid: 'r2',
        recording_name: 'Linger',
        artist_name: 'The Cranberries',
        length: 274000,
      },
      { recording_mbid: 'r3', recording_name: '  ' },
    ]);
    expect(items).toEqual([
      { mbid: 'r1', title: 'Zombie', artist: 'The Cranberries', album: 'No Need to Argue', durationSeconds: 308 },
      { mbid: 'r2', title: 'Linger', artist: 'The Cranberries', album: null, durationSeconds: 274 },
    ]);
  });
});

describe('musicbrainzService fetches', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetForTests();
    global.fetch = jest.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('empty query does not fetch artists or recordings', async () => {
    const empty = { items: [], total: 0, offset: 0, limit: 8 };
    await expect(searchArtistsAndRecordings('   ')).resolves.toEqual({ artists: empty, recordings: empty });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('searchArtists hits /artist with fmt=json, limit, offset, UA, and artist query', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ count: 20, artists: [{ id: ARTIST_MBID, name: 'The Cranberries' }] }),
    });
    const page = await searchArtists('cranberries', 8);
    expect(page.items[0].name).toBe('The Cranberries');
    expect(page.total).toBe(20);
    expect(page.offset).toBe(8);
    const [url, opts] = global.fetch.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/ws/2/artist');
    expect(parsed.searchParams.get('fmt')).toBe('json');
    expect(parsed.searchParams.get('limit')).toBe('8');
    expect(parsed.searchParams.get('offset')).toBe('8');
    expect(parsed.searchParams.get('query')).toBe('artist:(cranberries)');
    expect(opts.headers['User-Agent']).toBe(USER_AGENT);
  });

  test('searchRecordings hits /recording with a recording query', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ count: 3, recordings: [{ id: 'r1', title: 'Zombie', length: 1000 }] }),
    });
    const page = await searchRecordings('zombie');
    expect(page.items[0].title).toBe('Zombie');
    expect(page.total).toBe(3);
    const parsed = new URL(global.fetch.mock.calls[0][0]);
    expect(parsed.pathname).toBe('/ws/2/recording');
    expect(parsed.searchParams.get('query')).toBe('recording:(zombie)');
    expect(parsed.searchParams.get('fmt')).toBe('json');
    expect(parsed.searchParams.get('offset')).toBe('0');
  });

  test('searchArtistsAndRecordings runs artist then recording (two calls)', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ count: 1, artists: [{ id: ARTIST_MBID, name: 'The Cranberries' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ count: 0, recordings: [] }) });
    const res = await searchArtistsAndRecordings('cranberries');
    expect(res.artists.items).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('listPopularRecordingsByArtist hits ListenBrainz popularity for the artist MBID', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ([
        { recording_mbid: 'r1', recording_name: 'Zombie', artist_name: 'The Cranberries', length: 1000 },
      ]),
    });
    const page = await listPopularRecordingsByArtist(ARTIST_MBID);
    expect(page.items[0].title).toBe('Zombie');
    expect(page.total).toBe(1);
    expect(page.limit).toBe(8);
    expect(page.offset).toBe(0);
    const parsed = new URL(global.fetch.mock.calls[0][0]);
    expect(parsed.hostname).toBe('api.listenbrainz.org');
    expect(parsed.pathname).toBe(`/1/popularity/top-recordings-for-artist/${ARTIST_MBID}`);
    expect(global.fetch.mock.calls[0][1].headers['User-Agent']).toBe(USER_AGENT);
  });

  test('listPopularRecordingsByArtist with a non-MBID does not fetch', async () => {
    await expect(listPopularRecordingsByArtist('not-an-id')).resolves.toEqual({
      items: [], total: 0, offset: 0, limit: 8,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('listPopularRecordingsByArtist pages the cached ListenBrainz list', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      recording_mbid: `r${i}`,
      recording_name: `Song ${i}`,
      artist_name: 'The Cranberries',
      length: 1000,
    }));
    global.fetch.mockResolvedValue({ ok: true, json: async () => rows });
    const first = await listPopularRecordingsByArtist(ARTIST_MBID, 0);
    expect(first.items).toHaveLength(8);
    expect(first.total).toBe(10);
    expect(first.items[0].title).toBe('Song 0');
    const second = await listPopularRecordingsByArtist(ARTIST_MBID, 8);
    expect(second.items).toHaveLength(2);
    expect(second.offset).toBe(8);
    expect(second.items[0].title).toBe('Song 8');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('a 503 / non-OK response returns an empty list (no throw) and is not cached', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ artists: [{ id: ARTIST_MBID, name: 'The Cranberries' }] }),
      });
    await expect(searchArtists('zombie')).resolves.toEqual({ items: [], total: 0, offset: 0, limit: 8 });
    await expect(searchArtists('zombie')).resolves.toEqual({
      items: [{ mbid: ARTIST_MBID, name: 'The Cranberries' }],
      total: 1,
      offset: 0,
      limit: 8,
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('a network failure returns an empty list (no throw)', async () => {
    global.fetch.mockRejectedValue(new Error('offline'));
    await expect(searchArtists('zombie')).resolves.toEqual({ items: [], total: 0, offset: 0, limit: 8 });
  });

  test('a repeated artist query is served from cache', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ artists: [{ id: ARTIST_MBID, name: 'The Cranberries' }] }),
    });
    await searchArtists('zombie');
    await searchArtists('zombie');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
