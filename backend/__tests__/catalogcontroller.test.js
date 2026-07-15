jest.mock('../models', () => ({
  CatalogSong: {
    create: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
  },
}));

const { CatalogSong } = require('../models');
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
});
