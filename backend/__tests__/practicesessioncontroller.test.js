jest.mock('../models', () => {
  return {
    PracticeSession: {
      create: jest.fn(async (data) => ({ ...data, uid: 'session-uid' })),
    },
    SessionItem: {
      bulkCreate: jest.fn(async (rows) => rows.map((row, i) => ({ ...row, uid: `item-${i}` }))),
    },
    Song: {
      findAll: jest.fn(),
    },
    Topic: {
      findAll: jest.fn(),
    },
    sequelize: {
      transaction: jest.fn(async (callback) => callback({ id: 'tx' })),
    },
  };
});

const { PracticeSession, SessionItem, Song, Topic, sequelize } = require('../models');
const controller = require('../controllers/practicesessioncontroller');

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

function mockNext() {
  return jest.fn();
}

// Local helpers to build relative YYYY-MM-DD dates (UTC-based, mirrors server tolerance)
function utcDateString(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

describe('practicesessioncontroller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPracticeSession', () => {
    test('creates a session with date and instrument only', async () => {
      const req = {
        session: { user: 'user-1' },
        body: { date: utcDateString(0), instrumentType: 'Bass' },
      };
      const res = mockRes();
      const next = mockNext();

      await controller.createPracticeSession(req, res, next);

      expect(PracticeSession.create).toHaveBeenCalled();
      const arg = PracticeSession.create.mock.calls[0][0];
      expect(arg.userUid).toBe('user-1');
      expect(arg.date).toBe(utcDateString(0)); // stored exactly as sent — never re-stamped server-side (FR19)
      expect(arg.instrumentType).toBe('Bass');
      expect(arg.durationMinutes).toBeNull();
      expect(arg.note).toBeNull();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('creates a full session with duration and note', async () => {
      const req = {
        session: { user: 'user-1' },
        body: { date: utcDateString(0), instrumentType: 'Bass', durationMinutes: 40, note: '  bridge still rough  ' },
      };
      const res = mockRes();
      const next = mockNext();

      await controller.createPracticeSession(req, res, next);

      const arg = PracticeSession.create.mock.calls[0][0];
      expect(arg.durationMinutes).toBe(40);
      expect(arg.note).toBe('bridge still rough');
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('accepts retroactive past dates without special treatment', async () => {
      for (const date of [utcDateString(-1), '2024-01-15']) {
        PracticeSession.create.mockClear();
        const req = { session: { user: 'user-1' }, body: { date, instrumentType: 'Guitar' } };
        const res = mockRes();
        const next = mockNext();

        await controller.createPracticeSession(req, res, next);

        expect(PracticeSession.create.mock.calls[0][0].date).toBe(date);
        expect(res.status).toHaveBeenCalledWith(201);
      }
    });

    test('accepts tiny durations — no minimum (FR6)', async () => {
      for (const durationMinutes of [2, 1]) {
        PracticeSession.create.mockClear();
        const req = { session: { user: 'user-1' }, body: { date: utcDateString(0), instrumentType: 'Bass', durationMinutes } };
        const res = mockRes();
        const next = mockNext();

        await controller.createPracticeSession(req, res, next);

        expect(PracticeSession.create.mock.calls[0][0].durationMinutes).toBe(durationMinutes);
        expect(res.status).toHaveBeenCalledWith(201);
      }
    });

    test('rejects missing or malformed dates with 400', async () => {
      for (const body of [
        { instrumentType: 'Bass' },
        { date: '07/06/2026', instrumentType: 'Bass' },
        { date: '2026-13-45', instrumentType: 'Bass' },
        { date: 20260607, instrumentType: 'Bass' },
      ]) {
        const req = { session: { user: 'user-1' }, body };
        const res = mockRes();
        const next = mockNext();

        await controller.createPracticeSession(req, res, next);

        expect(PracticeSession.create).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0].status).toBe(400);
      }
    });

    test('rejects future dates beyond the timezone tolerance with 400', async () => {
      const req = { session: { user: 'user-1' }, body: { date: utcDateString(2), instrumentType: 'Bass' } };
      const res = mockRes();
      const next = mockNext();

      await controller.createPracticeSession(req, res, next);

      expect(PracticeSession.create).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(400);
    });

    test('tolerates UTC+1-day dates (client ahead of server timezone, FR19)', async () => {
      const req = { session: { user: 'user-1' }, body: { date: utcDateString(1), instrumentType: 'Bass' } };
      const res = mockRes();
      const next = mockNext();

      await controller.createPracticeSession(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('rejects missing or blank instrument with 400', async () => {
      for (const body of [
        { date: utcDateString(0) },
        { date: utcDateString(0), instrumentType: '' },
        { date: utcDateString(0), instrumentType: '   ' },
        { date: utcDateString(0), instrumentType: 42 },
      ]) {
        const req = { session: { user: 'user-1' }, body };
        const res = mockRes();
        const next = mockNext();

        await controller.createPracticeSession(req, res, next);

        expect(PracticeSession.create).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0].status).toBe(400);
      }
    });

    test('rejects invalid durations with 400', async () => {
      for (const durationMinutes of [0, -5, 1.5, 'abc', 1441]) {
        const req = { session: { user: 'user-1' }, body: { date: utcDateString(0), instrumentType: 'Bass', durationMinutes } };
        const res = mockRes();
        const next = mockNext();

        await controller.createPracticeSession(req, res, next);

        expect(PracticeSession.create).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0].status).toBe(400);
      }
    });

    test('stores blank note as null and rejects non-string notes', async () => {
      const okReq = { session: { user: 'user-1' }, body: { date: utcDateString(0), instrumentType: 'Bass', note: '   ' } };
      const okRes = mockRes();
      await controller.createPracticeSession(okReq, okRes, mockNext());
      expect(PracticeSession.create.mock.calls[0][0].note).toBeNull();

      PracticeSession.create.mockClear();
      const badReq = { session: { user: 'user-1' }, body: { date: utcDateString(0), instrumentType: 'Bass', note: 42 } };
      const badNext = mockNext();
      await controller.createPracticeSession(badReq, mockRes(), badNext);
      expect(PracticeSession.create).not.toHaveBeenCalled();
      expect(badNext.mock.calls[0][0].status).toBe(400);
    });

    test('rejects far-past dates (year typos) with 400 and accepts the minimum', async () => {
      for (const date of ['0205-06-07', '1899-12-31']) {
        const req = { session: { user: 'user-1' }, body: { date, instrumentType: 'Bass' } };
        const next = mockNext();
        await controller.createPracticeSession(req, mockRes(), next);
        expect(PracticeSession.create).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0].status).toBe(400);
      }

      const okReq = { session: { user: 'user-1' }, body: { date: '1900-01-01', instrumentType: 'Bass' } };
      const okRes = mockRes();
      await controller.createPracticeSession(okReq, okRes, mockNext());
      expect(okRes.status).toHaveBeenCalledWith(201);
    });

    test('handles missing req.body (non-JSON content type) as 400, not 500', async () => {
      const req = { session: { user: 'user-1' }, body: undefined };
      const next = mockNext();

      await controller.createPracticeSession(req, mockRes(), next);

      expect(PracticeSession.create).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(400);
    });

    test('rejects null bytes in instrument or note with 400', async () => {
      for (const body of [
        { date: utcDateString(0), instrumentType: 'Bass\u0000x' },
        { date: utcDateString(0), instrumentType: 'Bass', note: 'abc\u0000def' },
      ]) {
        const req = { session: { user: 'user-1' }, body };
        const next = mockNext();
        await controller.createPracticeSession(req, mockRes(), next);
        expect(PracticeSession.create).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0].status).toBe(400);
      }
    });

    test('enforces exact length boundaries (instrument 255/256, note 5000/5001)', async () => {
      const ok = [
        { date: utcDateString(0), instrumentType: 'a'.repeat(255) },
        { date: utcDateString(0), instrumentType: 'Bass', note: 'n'.repeat(5000) },
      ];
      for (const body of ok) {
        PracticeSession.create.mockClear();
        const res = mockRes();
        await controller.createPracticeSession({ session: { user: 'user-1' }, body }, res, mockNext());
        expect(res.status).toHaveBeenCalledWith(201);
      }

      const bad = [
        { date: utcDateString(0), instrumentType: 'a'.repeat(256) },
        { date: utcDateString(0), instrumentType: 'Bass', note: 'n'.repeat(5001) },
      ];
      for (const body of bad) {
        PracticeSession.create.mockClear();
        const next = mockNext();
        await controller.createPracticeSession({ session: { user: 'user-1' }, body }, mockRes(), next);
        expect(PracticeSession.create).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0].status).toBe(400);
      }
    });

    test('maps unexpected create failures to 500', async () => {
      PracticeSession.create.mockRejectedValueOnce(new Error('db down'));

      const req = { session: { user: 'user-1' }, body: { date: utcDateString(0), instrumentType: 'Bass' } };
      const next = mockNext();

      await controller.createPracticeSession(req, mockRes(), next);

      expect(next.mock.calls[0][0].status).toBe(500);
    });

    test('rejects unauthenticated requests with 401', async () => {
      const req = { session: {}, body: { date: utcDateString(0), instrumentType: 'Bass' } };
      const res = mockRes();
      const next = mockNext();

      await controller.createPracticeSession(req, res, next);

      expect(PracticeSession.create).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(401);
    });
  });

  describe('createPracticeSession with items', () => {
    const SONG_UID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const TOPIC_UID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    function baseBody(items) {
      return { date: utcDateString(0), instrumentType: 'Bass', items };
    }

    beforeEach(() => {
      Song.findAll.mockResolvedValue([{ uid: SONG_UID, userUid: 'user-1', title: 'Sweet Child' }]);
      Topic.findAll.mockResolvedValue([{ uid: TOPIC_UID, userUid: 'user-1', name: 'Pentatonic scale' }]);
    });

    test('creates a session with song and topic items, labels snapshotted server-side', async () => {
      const req = {
        session: { user: 'user-1' },
        body: baseBody([
          { songUid: SONG_UID, minutes: 15 },
          { topicUid: TOPIC_UID, minutes: 25, note: '  at 30 BPM  ' },
        ]),
      };
      const res = mockRes();
      const next = mockNext();

      await controller.createPracticeSession(req, res, next);

      // Ownership-scoped BATCH resolution (two queries, not one per item)
      expect(Song.findAll).toHaveBeenCalledTimes(1);
      expect(Song.findAll).toHaveBeenCalledWith({ where: { uid: [SONG_UID], userUid: 'user-1' } });
      expect(Topic.findAll).toHaveBeenCalledTimes(1);
      expect(Topic.findAll).toHaveBeenCalledWith({ where: { uid: [TOPIC_UID], userUid: 'user-1' } });

      // Session and items created inside a transaction — assert the option is
      // ACTUALLY passed (atomicity must not silently break)
      expect(sequelize.transaction).toHaveBeenCalled();
      expect(PracticeSession.create).toHaveBeenCalledWith(expect.any(Object), { transaction: { id: 'tx' } });
      expect(SessionItem.bulkCreate).toHaveBeenCalledWith(expect.any(Array), { transaction: { id: 'tx' } });
      const rows = SessionItem.bulkCreate.mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ sessionUid: 'session-uid', songUid: SONG_UID, topicUid: null, label: 'Sweet Child', minutes: 15, note: null });
      expect(rows[1]).toMatchObject({ sessionUid: 'session-uid', songUid: null, topicUid: TOPIC_UID, label: 'Pentatonic scale', minutes: 25, note: 'at 30 BPM' });

      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];
      expect(payload.items).toHaveLength(2);
      expect(next).not.toHaveBeenCalled();
    });

    test('a session with zero items stays valid and skips the transaction', async () => {
      const req = { session: { user: 'user-1' }, body: baseBody(undefined) };
      const res = mockRes();

      await controller.createPracticeSession(req, res, mockNext());

      expect(sequelize.transaction).not.toHaveBeenCalled();
      expect(SessionItem.bulkCreate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json.mock.calls[0][0].items).toEqual([]);
    });

    test('rejects malformed items payloads with 400', async () => {
      for (const items of ['not-an-array', [{}], [{ songUid: SONG_UID, topicUid: TOPIC_UID }], [{ songUid: 'not-a-uuid' }], [null]]) {
        const req = { session: { user: 'user-1' }, body: baseBody(items) };
        const res = mockRes();
        const next = mockNext();

        await controller.createPracticeSession(req, res, next);

        expect(PracticeSession.create).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0].status).toBe(400);
      }
    });

    test('rejects more than 50 items with 400', async () => {
      const items = Array.from({ length: 51 }, () => ({ songUid: SONG_UID }));
      const next = mockNext();

      await controller.createPracticeSession({ session: { user: 'user-1' }, body: baseBody(items) }, mockRes(), next);

      expect(PracticeSession.create).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(400);
    });

    test('rejects references that do not belong to the user with 400 (no enumeration oracle)', async () => {
      Song.findAll.mockResolvedValue([]);
      const next = mockNext();

      await controller.createPracticeSession(
        { session: { user: 'user-1' }, body: baseBody([{ songUid: SONG_UID }]) },
        mockRes(),
        next
      );

      expect(PracticeSession.create).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('Invalid entry reference');
    });

    test('rejects invalid item minutes and notes with 400', async () => {
      for (const item of [
        { songUid: SONG_UID, minutes: 0 },
        { songUid: SONG_UID, minutes: 1.5 },
        { songUid: SONG_UID, minutes: 'abc' },
        { songUid: SONG_UID, minutes: 1441 },
        { songUid: SONG_UID, note: 42 },
        { songUid: SONG_UID, note: 'n'.repeat(1001) },
        { songUid: SONG_UID, note: 'abc' + String.fromCharCode(0) + 'def' },
      ]) {
        const next = mockNext();

        await controller.createPracticeSession({ session: { user: 'user-1' }, body: baseBody([item]) }, mockRes(), next);

        expect(PracticeSession.create).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0].status).toBe(400);
      }
    });

    test('no session is created when any item is invalid (validation before transaction)', async () => {
      const next = mockNext();

      await controller.createPracticeSession(
        { session: { user: 'user-1' }, body: baseBody([{ songUid: SONG_UID, minutes: 10 }, { songUid: 'bad' }]) },
        mockRes(),
        next
      );

      expect(PracticeSession.create).not.toHaveBeenCalled();
      expect(sequelize.transaction).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(400);
    });

    test('maps a TOCTOU FK violation during insert to 400, not 500', async () => {
      const fkError = new Error('violates foreign key constraint');
      fkError.name = 'SequelizeForeignKeyConstraintError';
      SessionItem.bulkCreate.mockRejectedValueOnce(fkError);

      const next = mockNext();
      await controller.createPracticeSession(
        { session: { user: 'user-1' }, body: baseBody([{ songUid: SONG_UID }]) },
        mockRes(),
        next
      );

      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('Invalid entry reference');
    });
  });
});
