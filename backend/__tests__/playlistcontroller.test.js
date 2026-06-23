jest.mock('../models', () => ({
  Playlist: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn()
  },
  PlaylistSong: {
    findAll: jest.fn(),
    destroy: jest.fn(),
    bulkCreate: jest.fn()
  },
  Song: {
    findAll: jest.fn()
  },
  sequelize: {
    transaction: jest.fn(async (callback) => callback({ id: 'tx' }))
  }
}));

const { Playlist, PlaylistSong, Song } = require('../models');
const controller = require('../controllers/playlistcontroller');

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    send: jest.fn()
  };
}
const mockNext = () => jest.fn();

// A persisted playlist row the user owns
function ownedPlaylist(overrides = {}) {
  return {
    uid: 'p1',
    userUid: 'user-1',
    toJSON: () => ({ uid: 'p1', name: 'My set', ...overrides.json }),
    update: jest.fn(),
    destroy: jest.fn(),
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Safe defaults; individual tests override as needed
  PlaylistSong.findAll.mockResolvedValue([]);
  PlaylistSong.destroy.mockResolvedValue();
  PlaylistSong.bulkCreate.mockResolvedValue();
  Song.findAll.mockResolvedValue([]);
});

describe('getAllPlaylists', () => {
  test('derives an ordered songUids array from the join table', async () => {
    Playlist.findAll.mockResolvedValue([ownedPlaylist()]);
    // Returned in position order (the controller asks the DB to order by position)
    PlaylistSong.findAll.mockResolvedValue([
      { playlistUid: 'p1', songUid: 's1', position: 0 },
      { playlistUid: 'p1', songUid: 's2', position: 1 }
    ]);

    const res = mockRes();
    await controller.getAllPlaylists({ session: { user: 'user-1' } }, res, mockNext());

    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ uid: 'p1', songUids: ['s1', 's2'] })
    ]);
  });

  test('no playlists → empty response, join table not queried', async () => {
    Playlist.findAll.mockResolvedValue([]);
    const res = mockRes();
    await controller.getAllPlaylists({ session: { user: 'user-1' } }, res, mockNext());
    expect(res.json).toHaveBeenCalledWith([]);
    expect(PlaylistSong.findAll).not.toHaveBeenCalled();
  });

  test('401 when not authenticated', async () => {
    const next = mockNext();
    await controller.getAllPlaylists({ session: {} }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(401);
  });
});

describe('createPlaylist', () => {
  function createReq(body) {
    return { session: { user: 'user-1' }, body };
  }

  test('keeps only the owner\'s existing songs, preserves order, returns derived songUids', async () => {
    Playlist.create.mockResolvedValue(ownedPlaylist());
    // 'sX' is not among the owned songs → dropped
    Song.findAll.mockResolvedValue([{ uid: 's1' }, { uid: 's2' }]);

    const res = mockRes();
    await controller.createPlaylist(createReq({ name: 'My set', songUids: ['s1', 'sX', 's2'] }), res, mockNext());

    expect(PlaylistSong.destroy).toHaveBeenCalledWith(expect.objectContaining({ where: { playlistUid: 'p1' } }));
    expect(PlaylistSong.bulkCreate).toHaveBeenCalledWith(
      [
        { playlistUid: 'p1', songUid: 's1', position: 0 },
        { playlistUid: 'p1', songUid: 's2', position: 1 }
      ],
      expect.objectContaining({ transaction: expect.anything() })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ uid: 'p1', songUids: ['s1', 's2'] }));
  });

  test('deduplicates repeated song UIDs', async () => {
    Playlist.create.mockResolvedValue(ownedPlaylist());
    Song.findAll.mockResolvedValue([{ uid: 's1' }, { uid: 's2' }]);

    const res = mockRes();
    await controller.createPlaylist(createReq({ name: 'Dupes', songUids: ['s1', 's1', 's2'] }), res, mockNext());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ songUids: ['s1', 's2'] }));
  });

  test('400 when name is missing', async () => {
    const next = mockNext();
    await controller.createPlaylist(createReq({ songUids: [] }), mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(Playlist.create).not.toHaveBeenCalled();
  });

  test('401 when not authenticated', async () => {
    const next = mockNext();
    await controller.createPlaylist({ session: {}, body: { name: 'X' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(401);
  });
});

describe('updatePlaylist', () => {
  test('omitting songUids keeps the existing songs (never clears them)', async () => {
    Playlist.findOne.mockResolvedValue(ownedPlaylist());
    PlaylistSong.findAll.mockResolvedValue([
      { playlistUid: 'p1', songUid: 's1', position: 0 }
    ]);

    const res = mockRes();
    await controller.updatePlaylist(
      { session: { user: 'user-1' }, params: { uid: 'p1' }, body: { name: 'Renamed' } }, res, mockNext()
    );

    // No re-sync: the join table is left untouched
    expect(PlaylistSong.destroy).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ songUids: ['s1'] }));
  });
});

describe('getPlaylist / ownership', () => {
  test('404 when the playlist belongs to another user (scoped out, story 7.5)', async () => {
    Playlist.findOne.mockResolvedValue(null); // scoped where excludes a foreign playlist
    const next = mockNext();
    await controller.getPlaylist({ session: { user: 'user-1' }, params: { uid: 'p1' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(404);
  });

  test('404 when the playlist does not exist', async () => {
    Playlist.findOne.mockResolvedValue(null);
    const next = mockNext();
    await controller.getPlaylist({ session: { user: 'user-1' }, params: { uid: 'nope' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(404);
  });
});

describe('removeSongFromPlaylist', () => {
  test('removes the song from the join table, returns the remaining ordered songUids', async () => {
    Playlist.findOne.mockResolvedValue(ownedPlaylist());
    PlaylistSong.findAll.mockResolvedValue([
      { playlistUid: 'p1', songUid: 's1', position: 0 },
      { playlistUid: 'p1', songUid: 's2', position: 1 }
    ]);
    Song.findAll.mockResolvedValue([{ uid: 's2' }]); // the one kept

    const res = mockRes();
    await controller.removeSongFromPlaylist(
      { session: { user: 'user-1' }, params: { uid: 'p1', songUid: 's1' } }, res, mockNext()
    );

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ songUids: ['s2'] }));
  });
});

describe('addSongToPlaylist', () => {
  test('appends an owned song to the join table', async () => {
    Playlist.findOne.mockResolvedValue(ownedPlaylist());
    PlaylistSong.findAll.mockResolvedValue([
      { playlistUid: 'p1', songUid: 's1', position: 0 }
    ]);
    Song.findAll.mockResolvedValue([{ uid: 's1' }, { uid: 's2' }]);

    const res = mockRes();
    await controller.addSongToPlaylist(
      { session: { user: 'user-1' }, params: { uid: 'p1', songUid: 's2' } }, res, mockNext()
    );

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ songUids: ['s1', 's2'] }));
  });
});
