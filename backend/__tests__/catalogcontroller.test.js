jest.mock('../models', () => ({
  CatalogSong: {
    create: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAndCountAll: jest.fn(),
    sequelize: { query: jest.fn(), QueryTypes: { SELECT: 'SELECT' } },
  },
  Song: {
    create: jest.fn(),
    findOne: jest.fn(),
  },
  User: {
    findByPk: jest.fn(),
  },
}));

const { CatalogSong, Song, User } = require('../models');
const { Op } = require('sequelize');
const controller = require('../controllers/catalogcontroller');

const UID = '11111111-1111-4111-8111-111111111111';

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}
function mockNext() {
  return jest.fn();
}

describe('catalogcontroller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- create ---

  test('createCatalogEntry creates an entry with title only -> 201', async () => {
    CatalogSong.create.mockImplementation(async (data) => ({ ...data, uid: 'new-uid' }));
    const req = { body: { title: '  Zombie  ', artist: 'The Cranberries', bpm: 84 } };
    const res = mockRes();
    const next = mockNext();

    await controller.createCatalogEntry(req, res, next);

    const arg = CatalogSong.create.mock.calls[0][0];
    expect(arg.title).toBe('Zombie'); // trimmed
    expect(arg.artist).toBe('The Cranberries');
    expect(arg.bpm).toBe(84);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  test('createCatalogEntry without a title -> 400 (whitespace-only counts as empty)', async () => {
    const next = mockNext();
    await controller.createCatalogEntry({ body: { title: '   ' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(CatalogSong.create).not.toHaveBeenCalled();
  });

  test('createCatalogEntry without a JSON body -> 400, not 500', async () => {
    const next = mockNext();
    await controller.createCatalogEntry({}, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
  });

  test('createCatalogEntry maps a canonical collision to a typed 409 with the existing entry', async () => {
    CatalogSong.create.mockRejectedValue({ name: 'SequelizeUniqueConstraintError' });
    CatalogSong.findOne.mockResolvedValue({ uid: 'existing', title: 'Zombie', artist: 'The Cranberries' });
    const res = mockRes();
    const next = mockNext();

    await controller.createCatalogEntry({ body: { title: 'zombie', artist: 'the cranberries' } }, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('duplicate_catalog_entry');
    expect(body.entry.uid).toBe('existing');
    expect(next).not.toHaveBeenCalled();
  });

  // --- update ---

  test('updateCatalogEntry edits IN PLACE and preserves uid', async () => {
    const entry = { uid: UID, title: 'Old', update: jest.fn(async (u) => ({ uid: UID, title: u.title || 'Old' })) };
    CatalogSong.findByPk.mockResolvedValue(entry);
    const res = mockRes();
    const next = mockNext();

    await controller.updateCatalogEntry({ params: { uid: UID }, body: { title: 'New title', bpm: 100 } }, res, next);

    expect(entry.update).toHaveBeenCalled();
    const updates = entry.update.mock.calls[0][0];
    expect(updates.title).toBe('New title');
    expect(updates.bpm).toBe(100);
    const returned = res.json.mock.calls[0][0];
    expect(returned.uid).toBe(UID); // uid preserved (no delete+recreate)
    expect(next).not.toHaveBeenCalled();
  });

  test('updateCatalogEntry on a rename collision -> 409 (excludes self)', async () => {
    const entry = { uid: UID, title: 'Zombie', update: jest.fn().mockRejectedValue({ name: 'SequelizeUniqueConstraintError' }) };
    CatalogSong.findByPk.mockResolvedValue(entry);
    CatalogSong.findOne.mockResolvedValue({ uid: 'other', title: 'Numb', artist: 'Linkin Park' });
    const res = mockRes();
    const next = mockNext();

    await controller.updateCatalogEntry({ params: { uid: UID }, body: { title: 'Numb', artist: 'Linkin Park' } }, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error).toBe('duplicate_catalog_entry');
  });

  test('updateCatalogEntry with an unknown uid -> 404', async () => {
    CatalogSong.findByPk.mockResolvedValue(null);
    const next = mockNext();
    await controller.updateCatalogEntry({ params: { uid: UID }, body: { title: 'X' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(404);
  });

  test('updateCatalogEntry with an invalid uid -> 404 (no DB hit)', async () => {
    const next = mockNext();
    await controller.updateCatalogEntry({ params: { uid: 'not-a-uuid' }, body: { title: 'X' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(404);
    expect(CatalogSong.findByPk).not.toHaveBeenCalled();
  });

  test('updateCatalogEntry clearing the title -> 400', async () => {
    const entry = { uid: UID, title: 'Old', update: jest.fn() };
    CatalogSong.findByPk.mockResolvedValue(entry);
    const next = mockNext();
    await controller.updateCatalogEntry({ params: { uid: UID }, body: { title: '   ' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(entry.update).not.toHaveBeenCalled();
  });

  test('updateCatalogEntry rename changing ONLY the artist still returns the conflicting entry (review P1: not null)', async () => {
    const entry = { uid: UID, title: 'Zombie', artist: null, update: jest.fn().mockRejectedValue({ name: 'SequelizeUniqueConstraintError' }) };
    CatalogSong.findByPk.mockResolvedValue(entry);
    CatalogSong.findOne.mockResolvedValue({ uid: 'conflict', title: 'Zombie', artist: 'The Cranberries' });
    const res = mockRes();
    const next = mockNext();

    // Title absent from the body -> lookup must fall back to entry.title, not ''.
    await controller.updateCatalogEntry({ params: { uid: UID }, body: { artist: 'The Cranberries' } }, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('duplicate_catalog_entry');
    expect(body.entry.uid).toBe('conflict'); // was null before the fix
  });

  test('createCatalogEntry clears an invalid/negative durationSeconds instead of 500 (review P2)', async () => {
    CatalogSong.create.mockImplementation(async (d) => ({ ...d, uid: 'x' }));

    await controller.createCatalogEntry({ body: { title: 'A', durationSeconds: 'abc' } }, mockRes(), mockNext());
    expect(CatalogSong.create.mock.calls[0][0].durationSeconds).toBeNull();

    jest.clearAllMocks();
    CatalogSong.create.mockImplementation(async (d) => ({ ...d, uid: 'x' }));
    await controller.createCatalogEntry({ body: { title: 'B', durationSeconds: -5 } }, mockRes(), mockNext());
    expect(CatalogSong.create.mock.calls[0][0].durationSeconds).toBeNull();

    jest.clearAllMocks();
    CatalogSong.create.mockImplementation(async (d) => ({ ...d, uid: 'x' }));
    await controller.createCatalogEntry({ body: { title: 'C', durationSeconds: 210 } }, mockRes(), mockNext());
    expect(CatalogSong.create.mock.calls[0][0].durationSeconds).toBe(210);
  });

  // --- delete ---

  test('deleteCatalogEntry destroys and returns a message', async () => {
    const entry = { uid: UID, destroy: jest.fn().mockResolvedValue() };
    CatalogSong.findByPk.mockResolvedValue(entry);
    const res = mockRes();
    const next = mockNext();

    await controller.deleteCatalogEntry({ params: { uid: UID } }, res, next);

    expect(entry.destroy).toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].message).toMatch(/deleted/i);
    expect(next).not.toHaveBeenCalled();
  });

  test('deleteCatalogEntry with an unknown uid -> 404', async () => {
    CatalogSong.findByPk.mockResolvedValue(null);
    const next = mockNext();
    await controller.deleteCatalogEntry({ params: { uid: UID } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(404);
  });

  // --- list (story 19.3) ---

  test('getCatalogList returns the {items,total,page,limit} envelope', async () => {
    CatalogSong.findAndCountAll.mockResolvedValue({ rows: [{ uid: 'a' }], count: 1 });
    const res = mockRes();
    await controller.getCatalogList({ query: {} }, res, mockNext());
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({ items: [{ uid: 'a' }], total: 1, page: 1, limit: 24 });
  });

  test('getCatalogList clamps limit (max 100) and defaults a garbage limit', async () => {
    CatalogSong.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const res = mockRes();
    await controller.getCatalogList({ query: { limit: '9999', page: '3' } }, res, mockNext());
    let arg = CatalogSong.findAndCountAll.mock.calls[0][0];
    expect(arg.limit).toBe(100);
    expect(arg.offset).toBe((3 - 1) * 100);
    expect(res.json.mock.calls[0][0].limit).toBe(100);

    CatalogSong.findAndCountAll.mockClear();
    await controller.getCatalogList({ query: { limit: 'abc', page: '0' } }, mockRes(), mockNext());
    arg = CatalogSong.findAndCountAll.mock.calls[0][0];
    expect(arg.limit).toBe(24); // garbage -> default
    expect(arg.offset).toBe(0); // page clamped to >= 1
  });

  test('getCatalogList ignores an out-of-whitelist sort (falls back to artist->title->uid)', async () => {
    CatalogSong.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    await controller.getCatalogList({ query: { sort: 'title); DROP TABLE' } }, mockRes(), mockNext());
    const arg = CatalogSong.findAndCountAll.mock.calls[0][0];
    expect(arg.order).toEqual([['artist', 'ASC'], ['title', 'ASC'], ['uid', 'ASC']]);
  });

  test('getCatalogList query is NOT scoped by userUid (shared read, §3)', async () => {
    CatalogSong.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    await controller.getCatalogList({ query: { key: 'Em' }, session: { user: 'u1' } }, mockRes(), mockNext());
    const arg = CatalogSong.findAndCountAll.mock.calls[0][0];
    // filters present, but userUid never injected into the where.
    expect(JSON.stringify(arg.where)).not.toContain('userUid');
    expect(JSON.stringify(arg.where)).not.toContain('user_uid');
  });

  test('getCatalogList with a search term builds the folded-LIKE where without crashing (exercises fn/col/whereFn)', async () => {
    CatalogSong.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const next = mockNext();
    // %/_ are escaped to literals; the point is the search branch actually runs.
    await controller.getCatalogList({ query: { search: '50%_test' } }, mockRes(), next);
    expect(CatalogSong.findAndCountAll).toHaveBeenCalled();
    expect(CatalogSong.findAndCountAll.mock.calls[0][0].where).toBeDefined();
    expect(next).not.toHaveBeenCalled(); // no 500
  });

  test('getCatalogList accepts comma-separated multi-value filters (facet pills)', async () => {
    CatalogSong.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    await controller.getCatalogList({ query: { key: 'Em,Am', genre: 'Rock,Reggae' } }, mockRes(), mockNext());
    const where = CatalogSong.findAndCountAll.mock.calls[0][0].where;
    const and = where[Op.and];
    const keyClause = and.find(c => c.key);
    expect(keyClause.key[Op.in]).toEqual(['Em', 'Am']); // multi-key -> Op.in
    const genreClause = and.find(c => c[Op.or]);
    expect(genreClause[Op.or]).toHaveLength(2); // multi-genre -> OR of 2 @> contains
  });

  test('getCatalogFacets returns distinct genre/key/mode/timeSignature', async () => {
    CatalogSong.sequelize.query.mockResolvedValue([{ v: 'Rock' }, { v: 'Reggae' }]);
    const res = mockRes();
    await controller.getCatalogFacets({}, res, mockNext());
    const body = res.json.mock.calls[0][0];
    expect(body.genre).toEqual(['Rock', 'Reggae']);
    expect(body).toHaveProperty('key');
    expect(body).toHaveProperty('mode');
    expect(body).toHaveProperty('timeSignature');
  });

  // --- detail (story 19.3) ---

  test('getCatalogEntry returns the raw entity', async () => {
    CatalogSong.findByPk.mockResolvedValue({ uid: UID, title: 'Zombie', publishedAt: '2026-01-01T00:00:00.000Z' });
    const res = mockRes();
    await controller.getCatalogEntry({ params: { uid: UID } }, res, mockNext());
    expect(res.json.mock.calls[0][0].uid).toBe(UID);
  });

  test('getCatalogEntry -> 404 calm on unknown or invalid uid', async () => {
    CatalogSong.findByPk.mockResolvedValue(null);
    const n1 = mockNext();
    await controller.getCatalogEntry({ params: { uid: UID } }, mockRes(), n1);
    expect(n1.mock.calls[0][0].status).toBe(404);

    const n2 = mockNext();
    await controller.getCatalogEntry({ params: { uid: 'not-a-uuid' } }, mockRes(), n2);
    expect(n2.mock.calls[0][0].status).toBe(404);
    expect(CatalogSong.findByPk).toHaveBeenCalledTimes(1); // invalid uid didn't hit the DB
  });

  // --- Add to my songlist (story 19.4) ---

  const CATALOG = {
    uid: UID, title: 'Zombie', artist: 'The Cranberries', album: 'No Need to Argue',
    key: 'Em', bpm: 84, mode: 'minor', timeSignature: '4/4', durationSeconds: 260,
    language: ['English'], genre: ['Rock'], streamingLinks: [{ label: 'YouTube', url: 'https://y' }],
    pitchStandard: 440,
    publishedAt: '2026-01-01T00:00:00.000Z', // published (19.6) → addToSonglist proceeds
    // Parasite fields: NOT part of a CatalogSong, but present here to prove the
    // explicit build never leaks personal/instrument data into the copy.
    userUid: 'someone-else', instrument: ['guitar'], capo: 3, notes: 'secret',
    lastPlayed: '2020-01-01T00:00:00.000Z', myInstrumentUid: 'inst-x',
  };

  test('addToSonglist copies intrinsic fields (deep-cloned), sets sourceCatalogUid, blanks personal fields -> 201', async () => {
    CatalogSong.findByPk.mockResolvedValue(CATALOG);
    Song.create.mockImplementation(async (data) => ({ ...data, uid: 'song-uid' }));
    const res = mockRes();
    const next = mockNext();

    await controller.addToSonglist({ params: { uid: UID }, session: { user: 'u1' } }, res, next);

    const arg = Song.create.mock.calls[0][0];
    expect(arg.userUid).toBe('u1');
    expect(arg.sourceCatalogUid).toBe(UID);
    expect(arg.title).toBe('Zombie');
    expect(arg.lastPlayed).toBeNull();
    // deep-clone: equal value, different reference (no shared JSON with the catalog entry)
    expect(arg.genre).toEqual(['Rock']);
    expect(arg.genre).not.toBe(CATALOG.genre);
    expect(arg.streamingLinks).not.toBe(CATALOG.streamingLinks);
    // no instrument/personal fields leaked, and userUid is the SESSION user (not the
    // parasite value on the fixture)
    expect(arg.instrument).toBeUndefined();
    expect(arg.capo).toBeUndefined();
    expect(arg.notes).toBeUndefined();
    expect(arg.myInstrumentUid).toBeUndefined();
    expect(arg.userUid).toBe('u1');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  test('addToSonglist on a per-user duplicate -> 409 duplicate_song with the existing song', async () => {
    CatalogSong.findByPk.mockResolvedValue(CATALOG);
    Song.create.mockRejectedValue({ name: 'SequelizeUniqueConstraintError' });
    Song.findOne.mockResolvedValue({ uid: 'existing-song', title: 'Zombie' });
    const res = mockRes();
    const next = mockNext();

    await controller.addToSonglist({ params: { uid: UID }, session: { user: 'u1' } }, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('duplicate_song');
    expect(body.song.uid).toBe('existing-song');
    expect(next).not.toHaveBeenCalled();
  });

  test('addToSonglist -> 404 when the catalog entry is absent, 401 without a session', async () => {
    CatalogSong.findByPk.mockResolvedValue(null);
    const n1 = mockNext();
    await controller.addToSonglist({ params: { uid: UID }, session: { user: 'u1' } }, mockRes(), n1);
    expect(n1.mock.calls[0][0].status).toBe(404);
    expect(Song.create).not.toHaveBeenCalled();

    const n2 = mockNext();
    await controller.addToSonglist({ params: { uid: UID }, session: {} }, mockRes(), n2);
    expect(n2.mock.calls[0][0].status).toBe(401);
  });

  // --- Draft / publish (story 19.6) ---

  const publishedNotNull = (c) => c.publishedAt && c.publishedAt[Op.not] === null;

  test('getCatalogList (browse) scopes to published only', async () => {
    CatalogSong.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    await controller.getCatalogList({ query: {}, session: { user: 'u1' } }, mockRes(), mockNext());
    const where = CatalogSong.findAndCountAll.mock.calls[0][0].where;
    expect(where[Op.and].some(publishedNotNull)).toBe(true);
  });

  test('getCatalogList ?includeDrafts=1 for a curator drops the published filter', async () => {
    User.findByPk.mockResolvedValue({ uid: 'u1', isCurator: true });
    CatalogSong.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    await controller.getCatalogList({ query: { includeDrafts: '1' }, session: { user: 'u1' } }, mockRes(), mockNext());
    expect(CatalogSong.findAndCountAll.mock.calls[0][0].where).toBeUndefined();
  });

  test('getCatalogList ?includeDrafts=1 from a NON-curator still scopes to published', async () => {
    User.findByPk.mockResolvedValue({ uid: 'u2', isCurator: false });
    CatalogSong.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    await controller.getCatalogList({ query: { includeDrafts: '1' }, session: { user: 'u2' } }, mockRes(), mockNext());
    const where = CatalogSong.findAndCountAll.mock.calls[0][0].where;
    expect(where[Op.and].some(publishedNotNull)).toBe(true);
  });

  test('getCatalogEntry: a draft is 404 for a non-curator, returned for a curator', async () => {
    CatalogSong.findByPk.mockResolvedValue({ uid: UID, title: 'Draft', publishedAt: null });
    User.findByPk.mockResolvedValue({ uid: 'u2', isCurator: false });
    const n1 = mockNext();
    await controller.getCatalogEntry({ params: { uid: UID }, session: { user: 'u2' } }, mockRes(), n1);
    expect(n1.mock.calls[0][0].status).toBe(404);

    User.findByPk.mockResolvedValue({ uid: 'u1', isCurator: true });
    const res = mockRes();
    await controller.getCatalogEntry({ params: { uid: UID }, session: { user: 'u1' } }, res, mockNext());
    expect(res.json.mock.calls[0][0].uid).toBe(UID);
  });

  test('addToSonglist -> 404 on a draft (not public)', async () => {
    CatalogSong.findByPk.mockResolvedValue({ uid: UID, title: 'Draft', publishedAt: null });
    const next = mockNext();
    await controller.addToSonglist({ params: { uid: UID }, session: { user: 'u1' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(404);
    expect(Song.create).not.toHaveBeenCalled();
  });

  test('publishCatalogEntry sets publishedAt (Date) and returns the entry', async () => {
    const entry = { uid: UID, title: 'Zombie', artist: 'X', publishedAt: null, update: jest.fn(async (u) => ({ uid: UID, ...u })) };
    CatalogSong.findByPk.mockResolvedValue(entry);
    const res = mockRes();
    await controller.publishCatalogEntry({ params: { uid: UID } }, res, mockNext());
    expect(entry.update.mock.calls[0][0].publishedAt).toBeInstanceOf(Date);
    expect(res.json).toHaveBeenCalled();
  });

  test('publishCatalogEntry -> 409 when a published entry owns the canonical key', async () => {
    const entry = { uid: UID, title: 'Zombie', artist: 'The Cranberries', publishedAt: null, update: jest.fn().mockRejectedValue({ name: 'SequelizeUniqueConstraintError' }) };
    CatalogSong.findByPk.mockResolvedValue(entry);
    CatalogSong.findOne.mockResolvedValue({ uid: 'published-dup', title: 'Zombie', artist: 'The Cranberries' });
    const res = mockRes();
    await controller.publishCatalogEntry({ params: { uid: UID } }, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error).toBe('duplicate_catalog_entry');
  });

  test('publishCatalogEntry -> 400 when the entry has no title', async () => {
    CatalogSong.findByPk.mockResolvedValue({ uid: UID, title: '', publishedAt: null, update: jest.fn() });
    const next = mockNext();
    await controller.publishCatalogEntry({ params: { uid: UID } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
  });

  test('getCatalogFacets scopes every query to published', async () => {
    CatalogSong.sequelize.query.mockResolvedValue([]);
    await controller.getCatalogFacets({}, mockRes(), mockNext());
    const allScoped = CatalogSong.sequelize.query.mock.calls.every(c => /published_at IS NOT NULL/.test(c[0]));
    expect(allScoped).toBe(true);
  });

  test('getCatalogFacets ?includeDrafts=1 for a curator drops the published filter', async () => {
    User.findByPk.mockResolvedValue({ uid: 'u1', isCurator: true });
    CatalogSong.sequelize.query.mockResolvedValue([]);
    await controller.getCatalogFacets({ query: { includeDrafts: '1' }, session: { user: 'u1' } }, mockRes(), mockNext());
    const anyScoped = CatalogSong.sequelize.query.mock.calls.some(c => /published_at IS NOT NULL/.test(c[0]));
    expect(anyScoped).toBe(false);
  });

  test('getCatalogFacets ?includeDrafts=1 from a NON-curator stays published-only', async () => {
    User.findByPk.mockResolvedValue({ uid: 'u2', isCurator: false });
    CatalogSong.sequelize.query.mockResolvedValue([]);
    await controller.getCatalogFacets({ query: { includeDrafts: '1' }, session: { user: 'u2' } }, mockRes(), mockNext());
    const allScoped = CatalogSong.sequelize.query.mock.calls.every(c => /published_at IS NOT NULL/.test(c[0]));
    expect(allScoped).toBe(true);
  });

  // --- getCatalogExists (story 19.12) — EXACT (title, artist) dup-check ---

  test('getCatalogExists -> exists:true with the entry on a folded (title,artist) match', async () => {
    CatalogSong.findOne.mockResolvedValue({ uid: 'dup', title: 'Zombie', artist: 'The Cranberries', publishedAt: '2026-01-01' });
    const res = mockRes();
    await controller.getCatalogExists({ query: { title: '  zombie ', artist: 'the cranberries' } }, res, mockNext());
    expect(CatalogSong.findOne).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ exists: true, entry: expect.objectContaining({ uid: 'dup' }) });
  });

  test('getCatalogExists -> exists:true even when the match is a DRAFT (publishedAt null)', async () => {
    CatalogSong.findOne.mockResolvedValue({ uid: 'draft-dup', title: 'Zombie', artist: 'X', publishedAt: null });
    const res = mockRes();
    await controller.getCatalogExists({ query: { title: 'Zombie', artist: 'X' } }, res, mockNext());
    expect(res.json).toHaveBeenCalledWith({ exists: true, entry: expect.objectContaining({ uid: 'draft-dup' }) });
  });

  test('getCatalogExists -> exists:false when there is no match', async () => {
    CatalogSong.findOne.mockResolvedValue(null);
    const res = mockRes();
    await controller.getCatalogExists({ query: { title: 'Unique', artist: 'Nobody' } }, res, mockNext());
    expect(res.json).toHaveBeenCalledWith({ exists: false, entry: null });
  });

  test('getCatalogExists -> exists:false WITHOUT a DB lookup when no title', async () => {
    const res = mockRes();
    await controller.getCatalogExists({ query: { artist: 'Someone' } }, res, mockNext());
    expect(CatalogSong.findOne).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ exists: false, entry: null });
  });

  test('getCatalogExists passes a valid excludeUid to skip the row being edited (rename)', async () => {
    CatalogSong.findOne.mockResolvedValue(null);
    await controller.getCatalogExists({ query: { title: 'Zombie', excludeUid: UID } }, mockRes(), mockNext());
    const and = CatalogSong.findOne.mock.calls[0][0].where[Op.and];
    expect(and).toHaveLength(3); // foldedTitle + foldedArtist + uid != excludeUid
    expect(and[2]).toEqual({ uid: { [Op.ne]: UID } });
  });

  test('getCatalogExists ignores a non-uuid excludeUid (no exclude clause)', async () => {
    CatalogSong.findOne.mockResolvedValue(null);
    await controller.getCatalogExists({ query: { title: 'Zombie', excludeUid: 'not-a-uuid' } }, mockRes(), mockNext());
    const and = CatalogSong.findOne.mock.calls[0][0].where[Op.and];
    expect(and).toHaveLength(2); // no uid clause
  });

  test('getCatalogExists -> 500 when the lookup throws', async () => {
    CatalogSong.findOne.mockRejectedValue(new Error('db down'));
    const next = mockNext();
    await controller.getCatalogExists({ query: { title: 'Zombie' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(500);
  });
});
