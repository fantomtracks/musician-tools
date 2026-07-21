// Story 20.3 — import a Collection into the user's Songlist + mirror Playlist
// (best-effort, non-atomic). Models mocked (jest.mock('../models')) per the backend
// test convention — the best-effort loop is fully unit-testable with mocks (unlike
// 20.1's FK CASCADE), so every count path is asserted here.
jest.mock('../models', () => ({
  CatalogCollection: { findByPk: jest.fn() },
  CatalogSong: {}, // referenced by memberSongInclude as the `model` — must exist
  Song: { create: jest.fn(), findOne: jest.fn() },
  Playlist: { create: jest.fn(), findOne: jest.fn() },
  PlaylistSong: { count: jest.fn(), findOrCreate: jest.fn() },
  User: { findByPk: jest.fn() },
}));

const { CatalogCollection, Song, Playlist, PlaylistSong } = require('../models');
const { Op } = require('sequelize');
const controller = require('../controllers/catalogcontroller');

const COL = '44444444-4444-4444-8444-444444444444';
const BAD = 'not-a-uuid';

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}
function mockNext() {
  return jest.fn();
}
function req(overrides = {}) {
  return { session: { user: 'user-uid' }, params: { uid: COL }, body: {}, ...overrides };
}
// A CatalogCollection with N published members (findByPk resolves this).
function collectionWith(members, name = 'Rock 90s') {
  return { uid: COL, name, songs: members };
}
const uniqErr = () => Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError' });

describe('catalogcontroller — importCollectionToSonglist (story 20.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PlaylistSong.count.mockResolvedValue(0);
    PlaylistSong.findOrCreate.mockResolvedValue([{ uid: 'link' }, true]);
  });

  test('happy path: 2 fresh members -> playlist created, 2 added, 2 attached', async () => {
    CatalogCollection.findByPk.mockResolvedValue(collectionWith([
      { uid: 's1', title: 'A', artist: 'x' },
      { uid: 's2', title: 'B', artist: 'y' },
    ]));
    Playlist.create.mockResolvedValue({ uid: 'p1', name: 'Rock 90s' });
    Song.create
      .mockResolvedValueOnce({ uid: 'song1' })
      .mockResolvedValueOnce({ uid: 'song2' });
    const res = mockRes();
    const next = mockNext();

    await controller.importCollectionToSonglist(req(), res, next);

    expect(Song.create).toHaveBeenCalledTimes(2);
    expect(PlaylistSong.findOrCreate).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith({ added: 2, skipped: 0, failed: 0, playlistUid: 'p1' });
    expect(next).not.toHaveBeenCalled();
  });

  test('skip-duplicate: an already-owned song is skipped at insert but STILL attached', async () => {
    CatalogCollection.findByPk.mockResolvedValue(collectionWith([
      { uid: 's1', title: 'A', artist: 'x' },
    ]));
    Playlist.create.mockResolvedValue({ uid: 'p1' });
    Song.create.mockRejectedValueOnce(uniqErr());
    Song.findOne.mockResolvedValueOnce({ uid: 'existing1' }); // findExistingUserSong
    const res = mockRes();

    await controller.importCollectionToSonglist(req(), res, mockNext());

    expect(res.json).toHaveBeenCalledWith({ added: 0, skipped: 1, failed: 0, playlistUid: 'p1' });
    // the existing song was attached to the mirror playlist
    expect(PlaylistSong.findOrCreate).toHaveBeenCalledWith(expect.objectContaining({
      where: { playlistUid: 'p1', songUid: 'existing1' },
    }));
  });

  test('best-effort: one entry throws a generic error -> failed++, batch continues, no 500', async () => {
    CatalogCollection.findByPk.mockResolvedValue(collectionWith([
      { uid: 's1', title: 'A', artist: 'x' },
      { uid: 's2', title: 'B', artist: 'y' },
    ]));
    Playlist.create.mockResolvedValue({ uid: 'p1' });
    Song.create
      .mockRejectedValueOnce(new Error('db hiccup'))
      .mockResolvedValueOnce({ uid: 'song2' });
    const res = mockRes();
    const next = mockNext();

    await controller.importCollectionToSonglist(req(), res, next);

    expect(res.json).toHaveBeenCalledWith({ added: 1, skipped: 0, failed: 1, playlistUid: 'p1' });
    expect(next).not.toHaveBeenCalled(); // did NOT bubble to a 500
    expect(PlaylistSong.findOrCreate).toHaveBeenCalledTimes(1); // only the added song attached
  });

  test('idempotent re-import: playlist reused, all songs skipped, no duplicate rows', async () => {
    CatalogCollection.findByPk.mockResolvedValue(collectionWith([
      { uid: 's1', title: 'A', artist: 'x' },
      { uid: 's2', title: 'B', artist: 'y' },
    ]));
    // playlist already exists -> create 23505 -> reuse
    Playlist.create.mockRejectedValue(uniqErr());
    Playlist.findOne.mockResolvedValue({ uid: 'p1' });
    // both songs already in the songlist -> 23505 -> resolved to existing
    Song.create.mockRejectedValue(uniqErr());
    Song.findOne
      .mockResolvedValueOnce({ uid: 'existing1' })
      .mockResolvedValueOnce({ uid: 'existing2' });
    // attaches already exist -> findOrCreate returns created:false
    PlaylistSong.findOrCreate.mockResolvedValue([{ uid: 'link' }, false]);
    const res = mockRes();

    await controller.importCollectionToSonglist(req(), res, mockNext());

    expect(Playlist.findOne).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ added: 0, skipped: 2, failed: 0, playlistUid: 'p1' });
  });

  test('unknown collection -> 404', async () => {
    CatalogCollection.findByPk.mockResolvedValue(null);
    const next = mockNext();
    await controller.importCollectionToSonglist(req(), mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(404);
    expect(Playlist.create).not.toHaveBeenCalled();
  });

  test('invalid uid -> 404 (no lookup)', async () => {
    const next = mockNext();
    await controller.importCollectionToSonglist(req({ params: { uid: BAD } }), mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(404);
    expect(CatalogCollection.findByPk).not.toHaveBeenCalled();
  });

  test('members are fetched PUBLISHED-only (draft entries never imported)', async () => {
    CatalogCollection.findByPk.mockResolvedValue(collectionWith([]));
    Playlist.create.mockResolvedValue({ uid: 'p1' });
    await controller.importCollectionToSonglist(req(), mockRes(), mockNext());

    const options = CatalogCollection.findByPk.mock.calls[0][1];
    const songInclude = options.include[0];
    expect(songInclude.as).toBe('songs');
    expect(songInclude.where).toEqual({ publishedAt: { [Op.not]: null } });
  });

  test('empty collection: playlist still created/reused, all counts zero', async () => {
    CatalogCollection.findByPk.mockResolvedValue(collectionWith([]));
    Playlist.create.mockResolvedValue({ uid: 'p1' });
    const res = mockRes();
    await controller.importCollectionToSonglist(req(), res, mockNext());
    expect(res.json).toHaveBeenCalledWith({ added: 0, skipped: 0, failed: 0, playlistUid: 'p1' });
    expect(Song.create).not.toHaveBeenCalled();
  });

  test('attach is best-effort: a failing findOrCreate does NOT abort the import (no 500)', async () => {
    CatalogCollection.findByPk.mockResolvedValue(collectionWith([
      { uid: 's1', title: 'A', artist: 'x' },
      { uid: 's2', title: 'B', artist: 'y' },
    ]));
    Playlist.create.mockResolvedValue({ uid: 'p1' });
    Song.create.mockResolvedValueOnce({ uid: 'song1' }).mockResolvedValueOnce({ uid: 'song2' });
    // first attach errors (e.g. concurrent-import unique race), second succeeds
    PlaylistSong.findOrCreate
      .mockRejectedValueOnce(Object.assign(new Error('race'), { name: 'SequelizeUniqueConstraintError' }))
      .mockResolvedValueOnce([{ uid: 'link2' }, true]);
    const res = mockRes();
    const next = mockNext();

    await controller.importCollectionToSonglist(req(), res, next);

    // songs were imported; the failed attach did not abort or downgrade the counts
    expect(res.json).toHaveBeenCalledWith({ added: 2, skipped: 0, failed: 0, playlistUid: 'p1' });
    expect(next).not.toHaveBeenCalled(); // did NOT bubble to a 500
    expect(PlaylistSong.findOrCreate).toHaveBeenCalledTimes(2); // both attaches attempted
  });

  test('attach position is seeded from the existing count and increments per created row', async () => {
    CatalogCollection.findByPk.mockResolvedValue(collectionWith([
      { uid: 's1', title: 'A', artist: 'x' },
      { uid: 's2', title: 'B', artist: 'y' },
    ]));
    Playlist.create.mockResolvedValue({ uid: 'p1' });
    Song.create.mockResolvedValueOnce({ uid: 'song1' }).mockResolvedValueOnce({ uid: 'song2' });
    PlaylistSong.count.mockResolvedValue(3); // playlist already has 3 songs
    PlaylistSong.findOrCreate.mockResolvedValue([{ uid: 'link' }, true]);
    await controller.importCollectionToSonglist(req(), mockRes(), mockNext());

    expect(PlaylistSong.findOrCreate.mock.calls[0][0].defaults.position).toBe(3);
    expect(PlaylistSong.findOrCreate.mock.calls[1][0].defaults.position).toBe(4);
  });
});
