// Story 20.1 — Catalog Collections (curator CRUD + compose). Models are mocked
// (jest.mock('../models')) per the project's backend test convention — no real DB.
//
// NOTE: the HARD cleanup of membership rows when a catalog entry (or a Collection) is
// deleted (AC #3/#4) is a DB-level FK ON DELETE CASCADE — it is NOT exercised by these
// mocked unit tests. It is validated by the dev-DB migration smoke test (see the story
// file, Task 1), mirroring how story 19.1 validated its functional unique index.
jest.mock('../models', () => ({
  CatalogSong: {
    findByPk: jest.fn(),
  },
  CatalogCollection: {
    create: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn(),
  },
  CatalogCollectionSong: {
    findOrCreate: jest.fn(),
    destroy: jest.fn(),
  },
  User: {
    findByPk: jest.fn(),
  },
}));

const { CatalogSong, CatalogCollection, CatalogCollectionSong, User } = require('../models');
const { Op } = require('sequelize');
const controller = require('../controllers/catalogcontroller');

const COL = '22222222-2222-4222-8222-222222222222';
const SONG = '33333333-3333-4333-8333-333333333333';
const BAD = 'not-a-uuid';

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}
function mockNext() {
  return jest.fn();
}
// A request from a non-curator (User.findByPk -> not a curator) unless overridden.
function req(overrides = {}) {
  return { session: { user: 'user-uid' }, params: {}, body: {}, query: {}, ...overrides };
}

describe('catalogcontroller — Collections (story 20.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findByPk.mockResolvedValue({ isCurator: false }); // default: not a curator
  });

  // --- create ---

  test('createCollection with a name -> 201', async () => {
    CatalogCollection.create.mockImplementation(async (data) => ({ ...data, uid: COL }));
    const res = mockRes();
    const next = mockNext();
    await controller.createCollection(req({ body: { name: '  Rock 90s  ', description: '  best of  ' } }), res, next);

    const arg = CatalogCollection.create.mock.calls[0][0];
    expect(arg.name).toBe('Rock 90s'); // trimmed
    expect(arg.description).toBe('best of');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  test('createCollection without a name -> 400 (whitespace-only counts as empty)', async () => {
    const next = mockNext();
    await controller.createCollection(req({ body: { name: '   ' } }), mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(CatalogCollection.create).not.toHaveBeenCalled();
  });

  // --- update ---

  test('updateCollection renames an existing collection', async () => {
    const updated = { uid: COL, name: 'Renamed' };
    const entity = { update: jest.fn().mockResolvedValue(updated) };
    CatalogCollection.findByPk.mockResolvedValue(entity);
    const res = mockRes();
    await controller.updateCollection(req({ params: { uid: COL }, body: { name: 'Renamed' } }), res, mockNext());
    expect(entity.update).toHaveBeenCalledWith({ name: 'Renamed' });
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  test('updateCollection unknown uid -> 404', async () => {
    CatalogCollection.findByPk.mockResolvedValue(null);
    const next = mockNext();
    await controller.updateCollection(req({ params: { uid: COL }, body: { name: 'X' } }), mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(404);
  });

  // --- delete ---

  test('deleteCollection destroys and returns a message', async () => {
    const entity = { destroy: jest.fn().mockResolvedValue() };
    CatalogCollection.findByPk.mockResolvedValue(entity);
    const res = mockRes();
    await controller.deleteCollection(req({ params: { uid: COL } }), res, mockNext());
    expect(entity.destroy).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Collection deleted' });
  });

  test('deleteCollection unknown uid -> 404', async () => {
    CatalogCollection.findByPk.mockResolvedValue(null);
    const next = mockNext();
    await controller.deleteCollection(req({ params: { uid: COL } }), mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(404);
  });

  // --- compose: add ---

  test('addSongToCollection creates the link -> 201', async () => {
    CatalogCollection.findByPk.mockResolvedValue({ uid: COL });
    CatalogSong.findByPk.mockResolvedValue({ uid: SONG });
    CatalogCollectionSong.findOrCreate.mockResolvedValue([{ uid: 'link' }, true]);
    const res = mockRes();
    await controller.addSongToCollection(req({ params: { uid: COL }, body: { catalogSongUid: SONG } }), res, mockNext());

    expect(CatalogCollectionSong.findOrCreate).toHaveBeenCalledWith({
      where: { collectionUid: COL, catalogSongUid: SONG },
      defaults: { collectionUid: COL, catalogSongUid: SONG },
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('addSongToCollection is idempotent — re-adding -> 200, no error', async () => {
    CatalogCollection.findByPk.mockResolvedValue({ uid: COL });
    CatalogSong.findByPk.mockResolvedValue({ uid: SONG });
    CatalogCollectionSong.findOrCreate.mockResolvedValue([{ uid: 'link' }, false]); // already existed
    const res = mockRes();
    const next = mockNext();
    await controller.addSongToCollection(req({ params: { uid: COL }, body: { catalogSongUid: SONG } }), res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  test('addSongToCollection unknown collection -> 404', async () => {
    CatalogCollection.findByPk.mockResolvedValue(null);
    const next = mockNext();
    await controller.addSongToCollection(req({ params: { uid: COL }, body: { catalogSongUid: SONG } }), mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(404);
    expect(CatalogCollectionSong.findOrCreate).not.toHaveBeenCalled();
  });

  test('addSongToCollection unknown catalog entry -> 404', async () => {
    CatalogCollection.findByPk.mockResolvedValue({ uid: COL });
    CatalogSong.findByPk.mockResolvedValue(null);
    const next = mockNext();
    await controller.addSongToCollection(req({ params: { uid: COL }, body: { catalogSongUid: SONG } }), mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(404);
    expect(CatalogCollectionSong.findOrCreate).not.toHaveBeenCalled();
  });

  test('addSongToCollection invalid uid -> 404 (no lookup)', async () => {
    const next = mockNext();
    await controller.addSongToCollection(req({ params: { uid: COL }, body: { catalogSongUid: BAD } }), mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(404);
    expect(CatalogCollection.findByPk).not.toHaveBeenCalled();
  });

  // --- compose: remove ---

  test('removeSongFromCollection destroys the link (idempotent)', async () => {
    CatalogCollectionSong.destroy.mockResolvedValue(1);
    const res = mockRes();
    await controller.removeSongFromCollection(req({ params: { uid: COL, catalogSongUid: SONG } }), res, mockNext());
    expect(CatalogCollectionSong.destroy).toHaveBeenCalledWith({ where: { collectionUid: COL, catalogSongUid: SONG } });
    expect(res.json).toHaveBeenCalledWith({ message: 'Removed from collection' });
  });

  // --- list ---

  test('getCollections returns songCount from the member list', async () => {
    CatalogCollection.findAll.mockResolvedValue([
      { uid: COL, name: 'Rock 90s', description: null, songs: [{ uid: 'a' }, { uid: 'b' }] },
    ]);
    const res = mockRes();
    await controller.getCollections(req(), res, mockNext());
    expect(res.json).toHaveBeenCalledWith([
      { uid: COL, name: 'Rock 90s', description: null, songCount: 2 },
    ]);
  });

  // --- detail + draft safety (AC #7) ---

  test('getCollection unknown uid -> 404', async () => {
    CatalogCollection.findByPk.mockResolvedValue(null);
    const next = mockNext();
    await controller.getCollection(req({ params: { uid: COL } }), mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(404);
  });

  test('getCollection invalid uid -> 404 (no lookup)', async () => {
    const next = mockNext();
    await controller.getCollection(req({ params: { uid: BAD } }), mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(404);
    expect(CatalogCollection.findByPk).not.toHaveBeenCalled();
  });

  test('getCollection as NON-curator filters drafts out of the member include', async () => {
    User.findByPk.mockResolvedValue({ isCurator: false });
    CatalogCollection.findByPk.mockResolvedValue({ uid: COL, songs: [] });
    await controller.getCollection(req({ params: { uid: COL } }), mockRes(), mockNext());

    const options = CatalogCollection.findByPk.mock.calls[0][1];
    const songInclude = options.include[0];
    expect(songInclude.as).toBe('songs');
    expect(songInclude.required).toBe(false);
    // published-only filter present for a non-curator
    expect(songInclude.where).toEqual({ publishedAt: { [Op.not]: null } });
  });

  test('getCollection as CURATOR includes drafts (no published-only filter)', async () => {
    User.findByPk.mockResolvedValue({ isCurator: true });
    CatalogCollection.findByPk.mockResolvedValue({ uid: COL, songs: [] });
    await controller.getCollection(req({ params: { uid: COL } }), mockRes(), mockNext());

    const options = CatalogCollection.findByPk.mock.calls[0][1];
    const songInclude = options.include[0];
    expect(songInclude.where).toBeUndefined();
  });
});
