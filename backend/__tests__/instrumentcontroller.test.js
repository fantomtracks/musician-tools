jest.mock('../models', () => ({
  Instrument: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(async (data) => ({ ...data, uid: 'instr-uid' })),
  },
}));

const { Instrument } = require('../models');
const controller = require('../controllers/instrumentcontroller');

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}
const mockNext = () => jest.fn();

describe('instrumentcontroller (story 7.5)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createInstrument', () => {
    test('creates an owned instrument (201)', async () => {
      const res = mockRes();
      await controller.createInstrument({ session: { user: 'user-1' }, body: { name: 'Strat' } }, res, mockNext());
      expect(Instrument.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('without a JSON body → 400, not a 500 (req.body guard)', async () => {
      const next = mockNext();
      await controller.createInstrument({ session: { user: 'user-1' } }, mockRes(), next); // req.body undefined
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(Instrument.create).not.toHaveBeenCalled();
    });

    test('401 when unauthenticated', async () => {
      const next = mockNext();
      await controller.createInstrument({ session: {}, body: { name: 'X' } }, mockRes(), next);
      expect(next.mock.calls[0][0].status).toBe(401);
    });
  });

  describe('updateInstrument — scoped ownership (no 403 oracle)', () => {
    test('updates an owned instrument', async () => {
      const update = jest.fn();
      Instrument.findOne.mockResolvedValue({ uid: '11111111-1111-4111-8111-111111111111', userUid: 'user-1', update });
      const res = mockRes();
      await controller.updateInstrument({ session: { user: 'user-1' }, params: { uid: '11111111-1111-4111-8111-111111111111' }, body: { name: 'New' } }, res, mockNext());
      expect(update).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
    });

    test('a foreign/unknown instrument → 404 (scoped out)', async () => {
      Instrument.findOne.mockResolvedValue(null);
      const next = mockNext();
      await controller.updateInstrument({ session: { user: 'user-1' }, params: { uid: '11111111-1111-4111-8111-111111111111' }, body: { name: 'New' } }, mockRes(), next);
      expect(next.mock.calls[0][0].status).toBe(404);
    });
  });

  describe('deleteInstrument — scoped ownership (no 403 oracle)', () => {
    test('deletes an owned instrument', async () => {
      const destroy = jest.fn();
      Instrument.findOne.mockResolvedValue({ uid: '11111111-1111-4111-8111-111111111111', userUid: 'user-1', destroy });
      const res = mockRes();
      await controller.deleteInstrument({ session: { user: 'user-1' }, params: { uid: '11111111-1111-4111-8111-111111111111' } }, res, mockNext());
      expect(destroy).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Instrument deleted successfully' });
    });

    test('a foreign/unknown instrument → 404 (scoped out)', async () => {
      Instrument.findOne.mockResolvedValue(null);
      const next = mockNext();
      await controller.deleteInstrument({ session: { user: 'user-1' }, params: { uid: '11111111-1111-4111-8111-111111111111' } }, mockRes(), next);
      expect(next.mock.calls[0][0].status).toBe(404);
    });
  });

  describe('malformed uid guard (404, not a 500)', () => {
    test('updateInstrument with a non-UUID uid → 404 without touching the DB', async () => {
      const next = mockNext();
      await controller.updateInstrument({ session: { user: 'user-1' }, params: { uid: 'not-a-uuid' }, body: { name: 'X' } }, mockRes(), next);
      expect(Instrument.findOne).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(404);
    });

    test('deleteInstrument with a non-UUID uid → 404 without touching the DB', async () => {
      const next = mockNext();
      await controller.deleteInstrument({ session: { user: 'user-1' }, params: { uid: 'not-a-uuid' } }, mockRes(), next);
      expect(Instrument.findOne).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(404);
    });
  });
});
