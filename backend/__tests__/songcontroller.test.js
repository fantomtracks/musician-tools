const httpErrors = require('http-errors');

jest.mock('../models', () => {
  return {
    Song: {
      create: jest.fn(async (data) => ({ ...data, uid: 'test-uid' })),
      findByPk: jest.fn()
    },
    SongPlay: {
      create: jest.fn(async (data) => ({ ...data, uid: 'play-uid' }))
    },
    PracticeSession: {
      findOne: jest.fn(async () => null),
      create: jest.fn(async (data) => ({ ...data, uid: 'session-uid' }))
    },
    SessionItem: {
      findOne: jest.fn(async () => null),
      create: jest.fn(async (data) => ({ ...data, uid: 'item-uid' })),
      count: jest.fn(async () => 0)
    },
    sequelize: {
      transaction: jest.fn(async (callback) => callback({ id: 'tx' }))
    }
  };
});

const { Song, SongPlay, PracticeSession, SessionItem } = require('../models');
const controller = require('../controllers/songcontroller');

// A played song the user owns, with a server-side title for the FR4 label snapshot
function ownedSong(overrides = {}) {
  return { uid: 'song-1', userUid: 'user-1', title: 'Sweet Child', update: jest.fn(), ...overrides };
}

const TODAY = (() => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
})();

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

function mockNext() {
  return jest.fn();
}

describe('songcontroller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createSong persists timeSignature and mode', async () => {
    const req = {
      session: { user: 'user-1' },
      body: {
        title: 'Test Song',
        bpm: 120,
        key: 'C',
        timeSignature: '4/4',
        mode: 'Major'
      }
    };
    const res = mockRes();
    const next = mockNext();

    await controller.createSong(req, res, next);

    expect(Song.create).toHaveBeenCalled();
    const arg = Song.create.mock.calls[0][0];
    expect(arg.timeSignature).toBe('4/4');
    expect(arg.mode).toBe('Major');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalled();
  });

  test('updateSong updates timeSignature and mode', async () => {
    const update = jest.fn();
    Song.findByPk.mockResolvedValue({
      userUid: 'user-1',
      update,
    });

    const req = {
      params: { uid: 'song-1' },
      session: { user: 'user-1' },
      body: {
        timeSignature: '3/4',
        mode: 'Minor'
      }
    };
    const res = mockRes();
    const next = mockNext();

    await controller.updateSong(req, res, next);

    expect(update).toHaveBeenCalled();
    const arg = update.mock.calls[0][0];
    expect(arg.timeSignature).toBe('3/4');
    expect(arg.mode).toBe('Minor');
    expect(res.json).toHaveBeenCalled();
  });

  describe('markSongPlayed (4.1 — feeds the journal)', () => {
    function markReq(body) {
      return { params: { uid: 'song-1' }, session: { user: 'user-1' }, body };
    }

    test('AC1: with no session that day creates the day session and adds the song as a no-minutes entry', async () => {
      Song.findByPk.mockResolvedValue(ownedSong());
      PracticeSession.findOne.mockResolvedValue(null);

      const res = mockRes();
      const next = mockNext();
      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), res, next);

      expect(PracticeSession.create).toHaveBeenCalledTimes(1);
      const sessionArg = PracticeSession.create.mock.calls[0][0];
      expect(sessionArg).toMatchObject({ userUid: 'user-1', date: TODAY, instrumentType: 'Guitar', durationMinutes: null });

      expect(SessionItem.create).toHaveBeenCalledTimes(1);
      const itemArg = SessionItem.create.mock.calls[0][0];
      // FR4: label is the server-side snapshot of the song title; no minutes (FR21)
      expect(itemArg).toMatchObject({ sessionUid: 'session-uid', songUid: 'song-1', label: 'Sweet Child', minutes: null });

      // 4.2: the play is LINKED to the created entry (cascade target)
      const playArg = SongPlay.create.mock.calls[0][0];
      expect(playArg.sessionItemUid).toBe('item-uid');

      expect(res.status).toHaveBeenCalledWith(201);
      expect(next).not.toHaveBeenCalled();
    });

    test('AC2: reuses an existing same-instrument session that day instead of creating a new one', async () => {
      Song.findByPk.mockResolvedValue(ownedSong());
      PracticeSession.findOne.mockResolvedValue({ uid: 'existing-session', instrumentType: 'Guitar' });
      SessionItem.count.mockResolvedValue(2);

      const res = mockRes();
      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), res, mockNext());

      expect(PracticeSession.create).not.toHaveBeenCalled();
      expect(SessionItem.create).toHaveBeenCalledTimes(1);
      const itemArg = SessionItem.create.mock.calls[0][0];
      expect(itemArg.sessionUid).toBe('existing-session');
      expect(itemArg.position).toBe(2); // appended after the existing entries
    });

    test('AC3: a bass session exists but not guitar — a distinct guitar session is created (one per instrument)', async () => {
      Song.findByPk.mockResolvedValue(ownedSong());
      // findOne is scoped to the instrument, so the guitar lookup returns null
      PracticeSession.findOne.mockResolvedValue(null);

      const res = mockRes();
      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), res, mockNext());

      expect(PracticeSession.findOne).toHaveBeenCalledTimes(1);
      const where = PracticeSession.findOne.mock.calls[0][0].where;
      expect(where).toMatchObject({ userUid: 'user-1', date: TODAY, instrumentType: 'Guitar' });
      expect(PracticeSession.create).toHaveBeenCalledTimes(1);
    });

    test('AC4: re-marking a song already in the day session adds no duplicate entry', async () => {
      Song.findByPk.mockResolvedValue(ownedSong());
      PracticeSession.findOne.mockResolvedValue({ uid: 'existing-session', instrumentType: 'Guitar' });
      SessionItem.findOne.mockResolvedValue({ uid: 'already-there', songUid: 'song-1' });

      const res = mockRes();
      const next = mockNext();
      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), res, next);

      expect(SessionItem.create).not.toHaveBeenCalled();
      // 4.2: the play links to the EXISTING entry, not a new one
      expect(SongPlay.create.mock.calls[0][0].sessionItemUid).toBe('already-there');
      expect(res.status).toHaveBeenCalledWith(201); // still a success, just idempotent
      expect(next).not.toHaveBeenCalled();
    });

    test('AC5 (timestamp): the SongPlay is stamped on the client day (UTC day == playedOn), not the server day', async () => {
      Song.findByPk.mockResolvedValue(ownedSong());

      const res = mockRes();
      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: '2026-03-10' }), res, mockNext());

      expect(SongPlay.create).toHaveBeenCalledTimes(1);
      const playArg = SongPlay.create.mock.calls[0][0];
      // The UTC calendar day is the client day — that is what the heatmap derives
      expect(playArg.playedAt.toISOString().slice(0, 10)).toBe('2026-03-10');
    });

    test('two marks the same day get distinct, orderable playedAt values (last-played sort)', async () => {
      Song.findByPk.mockResolvedValue(ownedSong());

      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: '2026-03-10' }), mockRes(), mockNext());
      // Advance a tick so the time-of-day differs
      await new Promise(resolve => setTimeout(resolve, 5));
      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: '2026-03-10' }), mockRes(), mockNext());

      const first = SongPlay.create.mock.calls[0][0].playedAt.getTime();
      const second = SongPlay.create.mock.calls[1][0].playedAt.getTime();
      expect(second).toBeGreaterThan(first); // distinct → orderable
    });

    test('AC5 (validation): a missing, malformed, future or pre-1900 playedOn is rejected with 400', async () => {
      Song.findByPk.mockResolvedValue(ownedSong());

      for (const playedOn of [undefined, '', 'garbage', '2026-02-31', '0205-06-07', '2999-01-01']) {
        const next = mockNext();
        await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn }), mockRes(), next);
        expect(next.mock.calls[0][0].status).toBe(400);
      }
      expect(SongPlay.create).not.toHaveBeenCalled();
      expect(PracticeSession.create).not.toHaveBeenCalled();
    });

    test('AC6: the SongPlay record is always created (per-instrument history preserved)', async () => {
      Song.findByPk.mockResolvedValue(ownedSong());

      const res = mockRes();
      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', instrumentUid: 'inst-1', playedOn: TODAY }), res, mockNext());

      expect(SongPlay.create).toHaveBeenCalledTimes(1);
      const playArg = SongPlay.create.mock.calls[0][0];
      expect(playArg).toMatchObject({ songUid: 'song-1', instrumentUid: 'inst-1', instrumentType: 'Guitar' });
    });

    test('without an instrument the play is recorded but no session is created (FR7 needs an instrument)', async () => {
      Song.findByPk.mockResolvedValue(ownedSong());

      const res = mockRes();
      await controller.markSongPlayed(markReq({ playedOn: TODAY }), res, mockNext());

      expect(SongPlay.create).toHaveBeenCalledTimes(1);
      // A standalone play (no journal entry) is not linked to anything (4.2)
      expect(SongPlay.create.mock.calls[0][0].sessionItemUid).toBeNull();
      expect(PracticeSession.findOne).not.toHaveBeenCalled();
      expect(PracticeSession.create).not.toHaveBeenCalled();
      expect(SessionItem.create).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('an out-of-range instrument records the play but skips the session (play stays durable)', async () => {
      Song.findByPk.mockResolvedValue(ownedSong());
      const longInstrument = 'x'.repeat(256);

      const res = mockRes();
      const next = mockNext();
      await controller.markSongPlayed(markReq({ instrumentType: longInstrument, playedOn: TODAY }), res, next);

      // The play is recorded (not lost to a rollback) with a null instrument...
      expect(SongPlay.create).toHaveBeenCalledTimes(1);
      expect(SongPlay.create.mock.calls[0][0].instrumentType).toBeNull();
      // ...and no session is created from an invalid instrument
      expect(PracticeSession.findOne).not.toHaveBeenCalled();
      expect(PracticeSession.create).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(next).not.toHaveBeenCalled();
    });

    test('a NUL byte in the instrument is treated as invalid — play kept, session skipped', async () => {
      Song.findByPk.mockResolvedValue(ownedSong());

      const res = mockRes();
      await controller.markSongPlayed(markReq({ instrumentType: `Gui${String.fromCharCode(0)}tar`, playedOn: TODAY }), res, mockNext());

      expect(SongPlay.create).toHaveBeenCalledTimes(1);
      expect(PracticeSession.create).not.toHaveBeenCalled();
    });

    test('a failure inside the transaction rolls back and maps to 500', async () => {
      Song.findByPk.mockResolvedValue(ownedSong());
      PracticeSession.findOne.mockResolvedValue(null); // reach the create step
      // The session step throws inside the transaction
      PracticeSession.create.mockRejectedValueOnce(new Error('insert failed'));

      const res = mockRes();
      const next = mockNext();
      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), res, next);

      expect(next.mock.calls[0][0].status).toBe(500);
      expect(res.status).not.toHaveBeenCalledWith(201);
    });

    test('rejects unauthenticated (401), unknown song (404) and another user\'s song (403)', async () => {
      const anon = mockNext();
      await controller.markSongPlayed({ params: { uid: 'song-1' }, session: {}, body: { playedOn: TODAY } }, mockRes(), anon);
      expect(anon.mock.calls[0][0].status).toBe(401);

      Song.findByPk.mockResolvedValue(null);
      const missing = mockNext();
      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), mockRes(), missing);
      expect(missing.mock.calls[0][0].status).toBe(404);

      Song.findByPk.mockResolvedValue(ownedSong({ userUid: 'someone-else' }));
      const forbidden = mockNext();
      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), mockRes(), forbidden);
      expect(forbidden.mock.calls[0][0].status).toBe(403);

      expect(SongPlay.create).not.toHaveBeenCalled();
    });
  });
});