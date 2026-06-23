jest.mock('../models', () => {
  return {
    PracticeSession: {
      create: jest.fn(async (data) => ({ ...data, uid: 'session-uid' })),
      findAll: jest.fn(async () => []),
      findOne: jest.fn(),
    },
    SessionItem: {
      bulkCreate: jest.fn(async (rows) => rows.map((row, i) => ({ ...row, uid: `item-${i}` }))),
      create: jest.fn(async (data) => ({ ...data, uid: 'new-item-uid' })),
      destroy: jest.fn(),
      findAll: jest.fn(async () => []),
    },
    Song: {
      findAll: jest.fn(),
    },
    SongPlay: {
      findAll: jest.fn(async () => []),
      create: jest.fn(async (data) => ({ ...data, uid: 'play-uid' })),
      bulkCreate: jest.fn(async (rows) => rows.map((row, i) => ({ ...row, uid: `play-${i}` }))),
      update: jest.fn(async () => [0]),
      destroy: jest.fn(async () => 0),
    },
    Topic: {
      findAll: jest.fn(),
    },
    sequelize: {
      transaction: jest.fn(async (callback) => callback({ id: 'tx' })),
    },
  };
});

const { PracticeSession, SessionItem, Song, SongPlay, Topic, sequelize } = require('../models');
const { fn, col, literal, Op } = require('sequelize');
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
      expect(arg.note).toBeNull();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    // Epic 8: the global duration is gone — a legacy body still carrying it is
    // tolerated (no 400) but never written to the session.
    test('ignores a legacy durationMinutes in the body and still stores the note', async () => {
      const req = {
        session: { user: 'user-1' },
        body: { date: utcDateString(0), instrumentType: 'Bass', durationMinutes: 40, note: '  bridge still rough  ' },
      };
      const res = mockRes();
      const next = mockNext();

      await controller.createPracticeSession(req, res, next);

      const arg = PracticeSession.create.mock.calls[0][0];
      expect(arg.durationMinutes).toBeUndefined();
      expect(arg.note).toBe('bridge still rough');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(next).not.toHaveBeenCalled();
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

  describe('getAllPracticeSessions', () => {
    test('returns the user sessions with items, anti-chronologically ordered', async () => {
      const sessions = [{ uid: 's1', date: '2026-06-07', items: [] }];
      PracticeSession.findAll.mockResolvedValue(sessions);

      const req = { session: { user: 'user-1' } };
      const res = mockRes();
      const next = mockNext();

      await controller.getAllPracticeSessions(req, res, next);

      expect(PracticeSession.findAll).toHaveBeenCalledWith({
        where: { userUid: 'user-1' },
        include: [{ model: SessionItem, as: 'items' }],
        order: [
          ['date', 'DESC'],
          ['createdAt', 'DESC'],
          ['uid', 'DESC'],
          [{ model: SessionItem, as: 'items' }, 'position', 'ASC'],
          [{ model: SessionItem, as: 'items' }, 'uid', 'ASC'],
        ],
      });
      expect(res.json).toHaveBeenCalledWith(sessions);
      expect(next).not.toHaveBeenCalled();
    });

    test('rejects unauthenticated requests with 401', async () => {
      const req = { session: {} };
      const next = mockNext();

      await controller.getAllPracticeSessions(req, mockRes(), next);

      expect(PracticeSession.findAll).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(401);
    });

    test('filters by day when a valid date query param is provided (3.2 day detail)', async () => {
      PracticeSession.findAll.mockResolvedValueOnce([]);

      await controller.getAllPracticeSessions(
        { session: { user: 'user-1' }, query: { date: '2026-03-10' } },
        mockRes(),
        mockNext()
      );

      expect(PracticeSession.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userUid: 'user-1', date: '2026-03-10' } })
      );
    });

    test('rejects an invalid date query param with 400', async () => {
      for (const date of ['10/03/2026', '2026-13-45', 'abc']) {
        const next = mockNext();
        await controller.getAllPracticeSessions(
          { session: { user: 'user-1' }, query: { date } },
          mockRes(),
          next
        );

        expect(PracticeSession.findAll).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0].status).toBe(400);
      }
    });

    test('maps unexpected findAll failures to 500', async () => {
      PracticeSession.findAll.mockRejectedValueOnce(new Error('db down'));

      const req = { session: { user: 'user-1' } };
      const next = mockNext();

      await controller.getAllPracticeSessions(req, mockRes(), next);

      expect(next.mock.calls[0][0].status).toBe(500);
    });
  });

  describe('getHeatmap', () => {
    test('aggregates by client-entered date with the exact query shape (FR19, NFR2)', async () => {
      PracticeSession.findAll.mockResolvedValueOnce([]);

      const req = { session: { user: 'user-1' }, query: { year: '2026' } };
      const res = mockRes();
      const next = mockNext();

      await controller.getHeatmap(req, res, next);

      // Epic 8: a day's minutes now sum the entries' minutes (LEFT JOIN on
      // SessionItems), and sessionCount is COUNT(DISTINCT session uid).
      expect(PracticeSession.findAll).toHaveBeenCalledWith({
        attributes: [
          'date',
          [fn('SUM', col('items.minutes')), 'totalMinutes'],
          [fn('COUNT', literal('DISTINCT "PracticeSession"."uid"')), 'sessionCount'],
        ],
        include: [{ model: SessionItem, as: 'items', attributes: [], required: false }],
        where: { userUid: 'user-1', date: { [Op.between]: ['2026-01-01', '2026-12-31'] } },
        group: ['date'],
        order: [['date', 'ASC']],
        raw: true,
      });
      expect(res.json).toHaveBeenCalledWith([]);
      expect(next).not.toHaveBeenCalled();
    });

    test('casts pg string aggregates to numbers and nulls SUM to 0', async () => {
      PracticeSession.findAll.mockResolvedValueOnce([
        { date: '2026-03-10', totalMinutes: '120', sessionCount: '3' },
        { date: '2026-03-11', totalMinutes: null, sessionCount: '1' },
      ]);

      const res = mockRes();
      await controller.getHeatmap({ session: { user: 'user-1' }, query: { year: 2026 } }, res, mockNext());

      expect(res.json).toHaveBeenCalledWith([
        { date: '2026-03-10', totalMinutes: 120, sessionCount: 3, playCount: 0 },
        { date: '2026-03-11', totalMinutes: 0, sessionCount: 1, playCount: 0 },
      ]);
    });

    test('projects play-only days as presence rows (FR22 retro-import)', async () => {
      PracticeSession.findAll.mockResolvedValueOnce([]);
      SongPlay.findAll.mockResolvedValueOnce([
        { date: '2026-02-01', playCount: '2' },
      ]);

      const res = mockRes();
      await controller.getHeatmap({ session: { user: 'user-1' }, query: { year: '2026' } }, res, mockNext());

      // Presence only: zero minutes, zero sessions — the client lights level 1
      expect(res.json).toHaveBeenCalledWith([
        { date: '2026-02-01', totalMinutes: 0, sessionCount: 0, playCount: 2 },
      ]);
    });

    test('a mixed day keeps the session aggregates untouched — no double counting (FR22)', async () => {
      PracticeSession.findAll.mockResolvedValueOnce([
        { date: '2026-03-10', totalMinutes: '120', sessionCount: '3' },
      ]);
      SongPlay.findAll.mockResolvedValueOnce([
        { date: '2026-03-10', playCount: '5' },
        { date: '2026-03-09', playCount: '2' },
      ]);

      const res = mockRes();
      await controller.getHeatmap({ session: { user: 'user-1' }, query: { year: '2026' } }, res, mockNext());

      // Sorted by date; minutes come from sessions only, plays add presence
      expect(res.json).toHaveBeenCalledWith([
        { date: '2026-03-09', totalMinutes: 0, sessionCount: 0, playCount: 2 },
        { date: '2026-03-10', totalMinutes: 120, sessionCount: 3, playCount: 5 },
      ]);
    });

    test('scopes plays to the user through the Song join, by UTC day, year-bounded (no userUid on SongPlay)', async () => {
      PracticeSession.findAll.mockResolvedValueOnce([]);

      await controller.getHeatmap({ session: { user: 'user-1' }, query: { year: '2026' } }, mockRes(), mockNext());

      const PLAY_DAY = 'DATE("SongPlay"."playedAt" AT TIME ZONE \'UTC\')';
      expect(SongPlay.findAll).toHaveBeenCalledTimes(1);
      const arg = SongPlay.findAll.mock.calls[0][0];
      expect(arg.include).toEqual([
        expect.objectContaining({ attributes: [], where: { userUid: 'user-1' }, required: true }),
      ]);
      // The day expression IS the contract with the day-detail endpoint —
      // pin it in SELECT and GROUP so the two queries cannot silently diverge
      expect(arg.attributes).toEqual([
        [literal(PLAY_DAY), 'date'],
        [fn('COUNT', col('SongPlay.uid')), 'playCount'],
      ]);
      expect(arg.group).toEqual([literal(PLAY_DAY)]);
      // Sargable year bounds on playedAt (index-friendly), equivalent to the
      // day expression between Jan 1 and Dec 31
      expect(arg.where).toEqual({
        playedAt: { [Op.gte]: '2026-01-01T00:00:00.000Z', [Op.lt]: '2027-01-01T00:00:00.000Z' },
      });
      expect(arg.raw).toBe(true);
    });

    test('maps a plays query failure to 500', async () => {
      PracticeSession.findAll.mockResolvedValueOnce([]);
      SongPlay.findAll.mockRejectedValueOnce(new Error('db down'));

      const failNext = mockNext();
      await controller.getHeatmap({ session: { user: 'user-1' }, query: { year: '2026' } }, mockRes(), failNext);
      expect(failNext.mock.calls[0][0].status).toBe(500);
    });

    test('rejects invalid years with 400', async () => {
      for (const year of [undefined, 'abc', '1800', '2200', '2026.5']) {
        const next = mockNext();
        await controller.getHeatmap({ session: { user: 'user-1' }, query: { year } }, mockRes(), next);

        expect(PracticeSession.findAll).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0].status).toBe(400);
      }
    });

    test('rejects unauthenticated requests with 401 and maps failures to 500', async () => {
      const anonNext = mockNext();
      await controller.getHeatmap({ session: {}, query: { year: '2026' } }, mockRes(), anonNext);
      expect(anonNext.mock.calls[0][0].status).toBe(401);

      PracticeSession.findAll.mockRejectedValueOnce(new Error('db down'));
      const failNext = mockNext();
      await controller.getHeatmap({ session: { user: 'user-1' }, query: { year: '2026' } }, mockRes(), failNext);
      expect(failNext.mock.calls[0][0].status).toBe(500);
    });
  });

  describe('getDayPlays', () => {
    test('returns the day plays joined with the song title, oldest first (FR22/AC4)', async () => {
      SongPlay.findAll.mockResolvedValueOnce([
        {
          uid: 'play-1', songUid: 'song-1', instrumentType: 'Guitar',
          playedAt: '2026-03-10T09:00:00.000Z', 'Song.title': 'Sweet Child',
        },
        {
          uid: 'play-2', songUid: 'song-2', instrumentType: null,
          playedAt: '2026-03-10T21:30:00.000Z', 'Song.title': 'Money',
        },
      ]);

      const res = mockRes();
      const next = mockNext();
      await controller.getDayPlays({ session: { user: 'user-1' }, query: { date: '2026-03-10' } }, res, next);

      // Plays are presence, not sessions: no duration anywhere in the payload
      expect(res.json).toHaveBeenCalledWith([
        { uid: 'play-1', songUid: 'song-1', title: 'Sweet Child', instrumentType: 'Guitar', playedAt: '2026-03-10T09:00:00.000Z' },
        { uid: 'play-2', songUid: 'song-2', title: 'Money', instrumentType: null, playedAt: '2026-03-10T21:30:00.000Z' },
      ]);
      expect(next).not.toHaveBeenCalled();

      const arg = SongPlay.findAll.mock.calls[0][0];
      expect(arg.include).toEqual([
        expect.objectContaining({ attributes: ['title'], where: { userUid: 'user-1' }, required: true }),
      ]);
      // Same UTC day as the heatmap aggregation, as a sargable range;
      // uid tiebreak keeps same-timestamp plays stable across requests
      expect(arg.where).toEqual({
        playedAt: { [Op.gte]: '2026-03-10T00:00:00.000Z', [Op.lt]: '2026-03-11T00:00:00.000Z' },
      });
      expect(arg.order).toEqual([['playedAt', 'ASC'], ['uid', 'ASC']]);
      expect(arg.raw).toBe(true);
    });

    test('rejects a missing or invalid date with 400', async () => {
      for (const date of [undefined, '', 'garbage', '2026-02-31', '03/10/2026']) {
        const next = mockNext();
        await controller.getDayPlays({ session: { user: 'user-1' }, query: { date } }, mockRes(), next);

        expect(SongPlay.findAll).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0].status).toBe(400);
        expect(next.mock.calls[0][0].message).toBe('Date must be a valid YYYY-MM-DD date');
      }
    });

    test('rejects far-past dates (year typos) with 400, like the rest of the controller', async () => {
      const next = mockNext();
      await controller.getDayPlays({ session: { user: 'user-1' }, query: { date: '0205-06-07' } }, mockRes(), next);

      expect(SongPlay.findAll).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('Date must be 1900-01-01 or later');
    });

    test('rejects unauthenticated requests with 401 and maps failures to 500', async () => {
      const anonNext = mockNext();
      await controller.getDayPlays({ session: {}, query: { date: '2026-03-10' } }, mockRes(), anonNext);
      expect(anonNext.mock.calls[0][0].status).toBe(401);

      SongPlay.findAll.mockRejectedValueOnce(new Error('db down'));
      const failNext = mockNext();
      await controller.getDayPlays({ session: { user: 'user-1' }, query: { date: '2026-03-10' } }, mockRes(), failNext);
      expect(failNext.mock.calls[0][0].status).toBe(500);
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
      expect(rows[0]).toMatchObject({ sessionUid: 'session-uid', songUid: SONG_UID, topicUid: null, label: 'Sweet Child', minutes: 15, note: null, position: 0 });
      expect(rows[1]).toMatchObject({ sessionUid: 'session-uid', songUid: null, topicUid: TOPIC_UID, label: 'Pentatonic scale', minutes: 25, note: 'at 30 BPM', position: 1 });

      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];
      expect(payload.items).toHaveLength(2);
      expect(next).not.toHaveBeenCalled();
    });

    test('4.2: a linked SongPlay is created for each SONG entry, none for topics', async () => {
      const req = {
        session: { user: 'user-1' },
        body: { date: '2026-03-10', instrumentType: 'Bass', items: [
          { songUid: SONG_UID, minutes: 15 },
          { topicUid: TOPIC_UID },
        ] },
      };

      await controller.createPracticeSession(req, mockRes(), mockNext());

      expect(SongPlay.bulkCreate).toHaveBeenCalledTimes(1);
      const playRows = SongPlay.bulkCreate.mock.calls[0][0];
      // Only the song entry yields a play, linked to its item, dated on the
      // session day at noon UTC, carrying the session instrument
      expect(playRows).toHaveLength(1);
      expect(playRows[0]).toMatchObject({ songUid: SONG_UID, instrumentType: 'Bass', instrumentUid: null, sessionItemUid: 'item-0' });
      expect(playRows[0].playedAt.toISOString()).toBe('2026-03-10T12:00:00.000Z');
      // Inside the same transaction (atomic with the session + items)
      expect(SongPlay.bulkCreate).toHaveBeenCalledWith(expect.any(Array), { transaction: { id: 'tx' } });
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

  describe('updatePracticeSession', () => {
    const SESSION_UID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const ITEM_UID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const ITEM_UID_2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const SONG_UID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const TOPIC_UID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    function mockItem(overrides = {}) {
      return {
        uid: ITEM_UID,
        songUid: SONG_UID,
        topicUid: null,
        label: 'Sweet Child',
        minutes: 15,
        note: null,
        update: jest.fn(),
        ...overrides,
      };
    }

    function mockExistingSession(overrides = {}) {
      return {
        uid: SESSION_UID,
        userUid: 'user-1',
        date: '2026-06-01',
        instrumentType: 'Bass',
        durationMinutes: 30,
        note: 'old note',
        items: [],
        update: jest.fn(),
        toJSON() {
          return { uid: this.uid, date: this.date, instrumentType: this.instrumentType };
        },
        ...overrides,
      };
    }

    beforeEach(() => {
      Song.findAll.mockResolvedValue([{ uid: SONG_UID, userUid: 'user-1', title: 'Sweet Child' }]);
      Topic.findAll.mockResolvedValue([{ uid: TOPIC_UID, userUid: 'user-1', name: 'Pentatonic scale' }]);
    });

    test('partial update keeps absent fields and passes the transaction option', async () => {
      const session = mockExistingSession();
      PracticeSession.findOne.mockResolvedValue(session);

      const req = { params: { uid: SESSION_UID }, session: { user: 'user-1' }, body: { date: '2026-05-01' } };
      const res = mockRes();
      const next = mockNext();

      await controller.updatePracticeSession(req, res, next);

      // Epic 8: durationMinutes is no longer written — the update carries only
      // date / instrumentType / note.
      expect(session.update).toHaveBeenCalledWith(
        { date: '2026-05-01', instrumentType: 'Bass', note: 'old note' },
        { transaction: { id: 'tx' } }
      );
      expect(res.json).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('explicit null clears the note (and a legacy durationMinutes is ignored)', async () => {
      const session = mockExistingSession();
      PracticeSession.findOne.mockResolvedValue(session);

      const req = { params: { uid: SESSION_UID }, session: { user: 'user-1' }, body: { durationMinutes: null, note: null } };

      await controller.updatePracticeSession(req, mockRes(), mockNext());

      const arg = session.update.mock.calls[0][0];
      expect(arg).not.toHaveProperty('durationMinutes');
      expect(arg.note).toBeNull();
    });

    test('rejects invalid or future dates with 400', async () => {
      for (const date of ['07/06/2026', utcDateString(2), '1899-12-31']) {
        const session = mockExistingSession();
        PracticeSession.findOne.mockResolvedValue(session);
        const next = mockNext();

        await controller.updatePracticeSession(
          { params: { uid: SESSION_UID }, session: { user: 'user-1' }, body: { date } },
          mockRes(),
          next
        );

        expect(session.update).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0].status).toBe(400);
      }
    });

    test('404 on malformed, unknown, and foreign session; 401 unauthenticated (story 7.5)', async () => {
      const badNext = mockNext();
      await controller.updatePracticeSession({ params: { uid: 'nope' }, session: { user: 'user-1' }, body: {} }, mockRes(), badNext);
      expect(PracticeSession.findOne).not.toHaveBeenCalled();
      expect(badNext.mock.calls[0][0].status).toBe(404);

      PracticeSession.findOne.mockResolvedValue(null);
      const missingNext = mockNext();
      await controller.updatePracticeSession({ params: { uid: SESSION_UID }, session: { user: 'user-1' }, body: {} }, mockRes(), missingNext);
      expect(missingNext.mock.calls[0][0].status).toBe(404);

      // Story 7.5: a foreign session is scoped out → null → 404 (no 403 oracle).
      PracticeSession.findOne.mockResolvedValue(null);
      const foreignNext = mockNext();
      await controller.updatePracticeSession({ params: { uid: SESSION_UID }, session: { user: 'user-1' }, body: {} }, mockRes(), foreignNext);
      expect(foreignNext.mock.calls[0][0].status).toBe(404);

      const anonNext = mockNext();
      await controller.updatePracticeSession({ params: { uid: SESSION_UID }, session: {}, body: {} }, mockRes(), anonNext);
      expect(anonNext.mock.calls[0][0].status).toBe(401);
    });

    test('items diff: updates an existing row in place, label preserved without a new ref', async () => {
      const item = mockItem();
      const session = mockExistingSession({ items: [item] });
      PracticeSession.findOne.mockResolvedValue(session);

      const req = {
        params: { uid: SESSION_UID },
        session: { user: 'user-1' },
        body: { items: [{ uid: ITEM_UID, minutes: 20, note: 'cleaner now' }] },
      };

      await controller.updatePracticeSession(req, mockRes(), mockNext());

      expect(item.update).toHaveBeenCalledWith(
        { songUid: SONG_UID, topicUid: null, label: 'Sweet Child', minutes: 20, note: 'cleaner now', position: 0 },
        { transaction: { id: 'tx' } }
      );
      expect(SessionItem.destroy).not.toHaveBeenCalled();
      expect(SessionItem.create).not.toHaveBeenCalled();
    });

    test('items diff: reclassifying re-resolves the label (FR4)', async () => {
      const orphan = mockItem({ songUid: null, topicUid: null, label: 'Ghost topic' });
      const session = mockExistingSession({ items: [orphan] });
      PracticeSession.findOne.mockResolvedValue(session);

      const req = {
        params: { uid: SESSION_UID },
        session: { user: 'user-1' },
        body: { items: [{ uid: ITEM_UID, topicUid: TOPIC_UID }] },
      };

      await controller.updatePracticeSession(req, mockRes(), mockNext());

      expect(orphan.update).toHaveBeenCalledWith(
        { songUid: null, topicUid: TOPIC_UID, label: 'Pentatonic scale', minutes: null, note: null, position: 0 },
        { transaction: { id: 'tx' } }
      );
    });

    test('items diff: an orphan sent back without a ref keeps its snapshot label (FR4)', async () => {
      const orphan = mockItem({ songUid: null, topicUid: null, label: 'Ghost topic', minutes: 10 });
      const session = mockExistingSession({ items: [orphan] });
      PracticeSession.findOne.mockResolvedValue(session);

      const req = {
        params: { uid: SESSION_UID },
        session: { user: 'user-1' },
        body: { items: [{ uid: ITEM_UID, minutes: 10 }] },
      };

      await controller.updatePracticeSession(req, mockRes(), mockNext());

      const arg = orphan.update.mock.calls[0][0];
      expect(arg.label).toBe('Ghost topic');
      expect(arg.songUid).toBeNull();
      expect(arg.topicUid).toBeNull();
    });

    test('items diff: rows absent from the payload are deleted, new rows created with their position', async () => {
      const kept = mockItem();
      const removed = mockItem({ uid: ITEM_UID_2, label: 'To remove' });
      const session = mockExistingSession({ items: [kept, removed] });
      PracticeSession.findOne.mockResolvedValue(session);

      const req = {
        params: { uid: SESSION_UID },
        session: { user: 'user-1' },
        body: { items: [{ uid: ITEM_UID, minutes: 15 }, { topicUid: TOPIC_UID, minutes: 5 }] },
      };

      await controller.updatePracticeSession(req, mockRes(), mockNext());

      expect(SessionItem.destroy).toHaveBeenCalledWith({ where: { uid: [ITEM_UID_2] }, transaction: { id: 'tx' } });
      expect(SessionItem.create).toHaveBeenCalledWith(
        expect.objectContaining({ sessionUid: SESSION_UID, topicUid: TOPIC_UID, label: 'Pentatonic scale', position: 1 }),
        { transaction: { id: 'tx' } }
      );
      expect(kept.update).toHaveBeenCalledWith(expect.objectContaining({ position: 0 }), expect.anything());
    });

    test("items diff: a uid that is not one of this session's items is rejected with 400", async () => {
      const session = mockExistingSession({ items: [mockItem()] });
      PracticeSession.findOne.mockResolvedValue(session);
      const next = mockNext();

      await controller.updatePracticeSession(
        { params: { uid: SESSION_UID }, session: { user: 'user-1' }, body: { items: [{ uid: ITEM_UID_2, minutes: 5 }] } },
        mockRes(),
        next
      );

      expect(session.update).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('Invalid entry reference');
    });

    test('rejects real NUL characters in instrument, note and entry note with 400', async () => {
      const NUL = String.fromCharCode(0);
      const bodies = [
        { instrumentType: 'Bass' + NUL },
        { note: 'abc' + NUL + 'def' },
        { items: [{ uid: ITEM_UID, note: 'x' + NUL }] },
      ];
      for (const body of bodies) {
        const session = mockExistingSession({ items: [mockItem()] });
        PracticeSession.findOne.mockResolvedValue(session);
        const next = mockNext();

        await controller.updatePracticeSession({ params: { uid: SESSION_UID }, session: { user: 'user-1' }, body }, mockRes(), next);

        expect(session.update).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0].status).toBe(400);
      }
    });

    test('rejects a duplicate item uid in the payload with 400', async () => {
      const session = mockExistingSession({ items: [mockItem()] });
      PracticeSession.findOne.mockResolvedValue(session);
      const next = mockNext();

      await controller.updatePracticeSession(
        { params: { uid: SESSION_UID }, session: { user: 'user-1' }, body: { items: [{ uid: ITEM_UID, minutes: 5 }, { uid: ITEM_UID, minutes: 10 }] } },
        mockRes(),
        next
      );

      expect(session.update).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].status).toBe(400);
      expect(next.mock.calls[0][0].message).toBe('Duplicate entry reference');
    });

    test('response re-reads items ordered by position', async () => {
      const session = mockExistingSession();
      PracticeSession.findOne.mockResolvedValue(session);

      await controller.updatePracticeSession(
        { params: { uid: SESSION_UID }, session: { user: 'user-1' }, body: { note: 'updated' } },
        mockRes(),
        mockNext()
      );

      expect(SessionItem.findAll).toHaveBeenCalledWith({
        where: { sessionUid: SESSION_UID },
        order: [['position', 'ASC'], ['uid', 'ASC']],
      });
    });

    test('4.2: changing the date moves the linked plays to the new day (AC3)', async () => {
      const session = mockExistingSession({ date: '2026-06-01', items: [mockItem()] });
      PracticeSession.findOne.mockResolvedValue(session);
      SessionItem.findAll.mockResolvedValue([{ uid: ITEM_UID }]);

      await controller.updatePracticeSession(
        { params: { uid: SESSION_UID }, session: { user: 'user-1' }, body: { date: '2026-05-15' } },
        mockRes(), mockNext()
      );

      expect(SongPlay.update).toHaveBeenCalledWith(
        expect.objectContaining({ playedAt: expect.any(Date) }),
        expect.objectContaining({ where: { sessionItemUid: [ITEM_UID] } })
      );
      expect(SongPlay.update.mock.calls[0][0].playedAt.toISOString()).toBe('2026-05-15T12:00:00.000Z');
    });

    test('4.2: changing the instrument re-labels the linked plays (FR7)', async () => {
      const session = mockExistingSession({ instrumentType: 'Bass', items: [mockItem()] });
      PracticeSession.findOne.mockResolvedValue(session);
      SessionItem.findAll.mockResolvedValue([{ uid: ITEM_UID }]);

      await controller.updatePracticeSession(
        { params: { uid: SESSION_UID }, session: { user: 'user-1' }, body: { instrumentType: 'Guitar' } },
        mockRes(), mockNext()
      );

      expect(SongPlay.update).toHaveBeenCalledWith(
        // instrumentUid cleared: the session carries only a TYPE, a stale
        // instrumentUid would point at the old instrument
        { instrumentType: 'Guitar', instrumentUid: null },
        expect.objectContaining({ where: { sessionItemUid: [ITEM_UID] } })
      );
    });

    test('4.2: a note/duration-only edit does NOT touch the linked plays', async () => {
      const session = mockExistingSession({ items: [mockItem()] });
      PracticeSession.findOne.mockResolvedValue(session);

      await controller.updatePracticeSession(
        { params: { uid: SESSION_UID }, session: { user: 'user-1' }, body: { note: 'just a note', durationMinutes: 45 } },
        mockRes(), mockNext()
      );

      // No date/instrument change → the realign must not run (mark-as-played
      // real-time playedAt must not be flattened on an unrelated edit)
      expect(SongPlay.update).not.toHaveBeenCalled();
      expect(SongPlay.destroy).not.toHaveBeenCalled();
      expect(SongPlay.bulkCreate).not.toHaveBeenCalled();
    });

    test('4.2: the realign covers EVERY linked play of a multi-entry session', async () => {
      const item2 = mockItem({ uid: ITEM_UID_2, songUid: TOPIC_UID });
      const session = mockExistingSession({ date: '2026-06-01', items: [mockItem(), item2] });
      PracticeSession.findOne.mockResolvedValue(session);
      SessionItem.findAll.mockResolvedValue([{ uid: ITEM_UID }, { uid: ITEM_UID_2 }]);

      await controller.updatePracticeSession(
        { params: { uid: SESSION_UID }, session: { user: 'user-1' }, body: { date: '2026-05-10' } },
        mockRes(), mockNext()
      );

      expect(SongPlay.update).toHaveBeenCalledWith(
        expect.objectContaining({ playedAt: expect.any(Date) }),
        expect.objectContaining({ where: { sessionItemUid: [ITEM_UID, ITEM_UID_2] } })
      );
    });

    test('4.2: adding a song entry creates a linked play (AC1)', async () => {
      const session = mockExistingSession({ items: [] });
      PracticeSession.findOne.mockResolvedValue(session);

      await controller.updatePracticeSession(
        { params: { uid: SESSION_UID }, session: { user: 'user-1' }, body: { items: [{ songUid: SONG_UID }] } },
        mockRes(), mockNext()
      );

      expect(SongPlay.bulkCreate).toHaveBeenCalledTimes(1);
      expect(SongPlay.bulkCreate.mock.calls[0][0][0]).toMatchObject({ songUid: SONG_UID, sessionItemUid: 'new-item-uid', instrumentType: 'Bass' });
    });

    test('4.2: removing an entry deletes the entry (its plays cascade)', async () => {
      const session = mockExistingSession({ items: [mockItem()] });
      PracticeSession.findOne.mockResolvedValue(session);

      await controller.updatePracticeSession(
        { params: { uid: SESSION_UID }, session: { user: 'user-1' }, body: { items: [] } },
        mockRes(), mockNext()
      );

      expect(SessionItem.destroy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { uid: [ITEM_UID] } })
      );
    });

    test('4.2: re-pointing an entry from a song to a topic drops its play', async () => {
      const item = mockItem({ update: jest.fn(function (vals) { Object.assign(this, vals); }) });
      const session = mockExistingSession({ items: [item] });
      PracticeSession.findOne.mockResolvedValue(session);

      await controller.updatePracticeSession(
        { params: { uid: SESSION_UID }, session: { user: 'user-1' }, body: { items: [{ uid: ITEM_UID, topicUid: TOPIC_UID }] } },
        mockRes(), mockNext()
      );

      expect(SongPlay.destroy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sessionItemUid: ITEM_UID } })
      );
    });
  });

  describe('deletePracticeSession', () => {
    const SESSION_UID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    test('deletes an owned session and returns a message', async () => {
      const session = { uid: SESSION_UID, userUid: 'user-1', destroy: jest.fn() };
      PracticeSession.findOne.mockResolvedValue(session);

      const res = mockRes();
      await controller.deletePracticeSession({ params: { uid: SESSION_UID }, session: { user: 'user-1' } }, res, mockNext());

      expect(session.destroy).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Session deleted successfully' });
    });

    test('4.2/AC3: deleting a session destroys it so its items — and their linked plays — cascade', async () => {
      // The controller only destroys the session; SessionItems cascade from the
      // session FK and their linked SongPlays cascade from sessionItemUid (both
      // ON DELETE CASCADE, declared in the model + migration). The actual DB
      // cascade is exercised by the migration + the manual/DB pass; here we pin
      // that the delete path fires and never hand-deletes plays in the controller.
      const session = { uid: SESSION_UID, userUid: 'user-1', destroy: jest.fn() };
      PracticeSession.findOne.mockResolvedValue(session);

      await controller.deletePracticeSession({ params: { uid: SESSION_UID }, session: { user: 'user-1' } }, mockRes(), mockNext());

      expect(session.destroy).toHaveBeenCalledTimes(1);
      expect(SongPlay.destroy).not.toHaveBeenCalled(); // plays vanish by FK, not by code
    });

    test('404 malformed/unknown/foreign, 401 unauthenticated (story 7.5)', async () => {
      const badNext = mockNext();
      await controller.deletePracticeSession({ params: { uid: 'nope' }, session: { user: 'user-1' } }, mockRes(), badNext);
      expect(badNext.mock.calls[0][0].status).toBe(404);

      PracticeSession.findOne.mockResolvedValue(null);
      const missingNext = mockNext();
      await controller.deletePracticeSession({ params: { uid: SESSION_UID }, session: { user: 'user-1' } }, mockRes(), missingNext);
      expect(missingNext.mock.calls[0][0].status).toBe(404);

      // Story 7.5: a foreign session is scoped out → null → 404 (no 403 oracle).
      PracticeSession.findOne.mockResolvedValue(null);
      const foreignNext = mockNext();
      await controller.deletePracticeSession({ params: { uid: SESSION_UID }, session: { user: 'user-1' } }, mockRes(), foreignNext);
      expect(foreignNext.mock.calls[0][0].status).toBe(404);

      const anonNext = mockNext();
      await controller.deletePracticeSession({ params: { uid: SESSION_UID }, session: {} }, mockRes(), anonNext);
      expect(anonNext.mock.calls[0][0].status).toBe(401);
    });
  });
});
