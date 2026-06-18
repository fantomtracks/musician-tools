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
      create: jest.fn(async (data) => ({ ...data, uid: 'session-uid', update: jest.fn() }))
    },
    SessionItem: {
      findOne: jest.fn(async () => null),
      create: jest.fn(async (data) => ({ ...data, uid: 'item-uid' })),
      count: jest.fn(async () => 0),
      sum: jest.fn(async () => 0)
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

  test('createSong persists durationSeconds (FR24)', async () => {
    const req = {
      session: { user: 'user-1' },
      body: { title: 'Test Song', durationSeconds: 210 }
    };
    await controller.createSong(req, mockRes(), mockNext());

    expect(Song.create.mock.calls[0][0].durationSeconds).toBe(210);
  });

  test('createSong defaults durationSeconds to null and clears out-of-range values', async () => {
    await controller.createSong({ session: { user: 'user-1' }, body: { title: 'No Duration' } }, mockRes(), mockNext());
    expect(Song.create.mock.calls[0][0].durationSeconds).toBeNull();

    await controller.createSong({ session: { user: 'user-1' }, body: { title: 'Bad', durationSeconds: 'abc' } }, mockRes(), mockNext());
    expect(Song.create.mock.calls[1][0].durationSeconds).toBeNull();
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

  test('updateSong updates durationSeconds; an absent field leaves it untouched (FR24)', async () => {
    const update = jest.fn();
    Song.findByPk.mockResolvedValue({ userUid: 'user-1', durationSeconds: 420, update });

    await controller.updateSong(
      { params: { uid: 'song-1' }, session: { user: 'user-1' }, body: { durationSeconds: 720 } },
      mockRes(),
      mockNext()
    );
    expect(update.mock.calls[0][0].durationSeconds).toBe(720);

    // Field absent from the payload → keep the song's current value
    const update2 = jest.fn();
    Song.findByPk.mockResolvedValue({ userUid: 'user-1', durationSeconds: 420, update: update2 });
    await controller.updateSong(
      { params: { uid: 'song-1' }, session: { user: 'user-1' }, body: { title: 'Renamed' } },
      mockRes(),
      mockNext()
    );
    expect(update2.mock.calls[0][0].durationSeconds).toBe(420);
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
      PracticeSession.findOne.mockResolvedValue({ uid: 'existing-session', instrumentType: 'Guitar', durationMinutes: null, update: jest.fn() });
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
      PracticeSession.findOne.mockResolvedValue({ uid: 'existing-session', instrumentType: 'Guitar', durationMinutes: null, update: jest.fn() });
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

    test('6.1 AC2 (pre-fill): a song duration (seconds) pre-fills the new entry minutes, rounded (FR21 amended)', async () => {
      Song.findByPk.mockResolvedValue(ownedSong({ durationSeconds: 240 })); // 4:00
      PracticeSession.findOne.mockResolvedValue(null);
      SessionItem.findOne.mockResolvedValue(null); // no existing entry → a new one is created

      const res = mockRes();
      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), res, mockNext());

      expect(SessionItem.create).toHaveBeenCalledTimes(1);
      expect(SessionItem.create.mock.calls[0][0].minutes).toBe(4);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('6.1 AC6 (session total): a new entry sets the session durationMinutes (heatmap + journal)', async () => {
      Song.findByPk.mockResolvedValue(ownedSong({ durationSeconds: 240 })); // 4 min
      const session = { uid: 'session-uid', instrumentType: 'Guitar', durationMinutes: null, update: jest.fn() };
      PracticeSession.findOne.mockResolvedValue(session);
      SessionItem.findOne.mockResolvedValue(null);
      SessionItem.sum.mockResolvedValue(0); // no prior minutes on the session

      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), mockRes(), mockNext());

      expect(session.update).toHaveBeenCalledTimes(1);
      expect(session.update.mock.calls[0][0]).toMatchObject({ durationMinutes: 4 });
    });

    test('6.1 AC6 (session total): a second played song grows the session total (4 + 5 = 9)', async () => {
      Song.findByPk.mockResolvedValue(ownedSong({ durationSeconds: 300 })); // +5 min
      const session = { uid: 'session-uid', instrumentType: 'Guitar', durationMinutes: 4, update: jest.fn() };
      PracticeSession.findOne.mockResolvedValue(session);
      SessionItem.findOne.mockResolvedValue(null); // a different song → new entry
      SessionItem.sum.mockResolvedValue(4); // the first song already contributed 4

      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), mockRes(), mockNext());

      expect(session.update.mock.calls[0][0]).toMatchObject({ durationMinutes: 9 });
    });

    test('6.1 AC6 (override preserved): a manual session total is never clobbered', async () => {
      Song.findByPk.mockResolvedValue(ownedSong({ durationSeconds: 240 })); // 4 min
      // Manual override (60) that does NOT equal the entries' sum (10) → keep it
      const session = { uid: 'session-uid', instrumentType: 'Guitar', durationMinutes: 60, update: jest.fn() };
      PracticeSession.findOne.mockResolvedValue(session);
      SessionItem.findOne.mockResolvedValue(null);
      SessionItem.sum.mockResolvedValue(10);

      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), mockRes(), mockNext());

      expect(session.update).not.toHaveBeenCalled();
    });

    test('6.1 AC6 (no duration): a no-duration mark leaves the session total untouched', async () => {
      Song.findByPk.mockResolvedValue(ownedSong()); // no duration
      const session = { uid: 'session-uid', instrumentType: 'Guitar', durationMinutes: null, update: jest.fn() };
      PracticeSession.findOne.mockResolvedValue(session);
      SessionItem.findOne.mockResolvedValue(null);
      SessionItem.sum.mockResolvedValue(0);

      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), mockRes(), mockNext());

      expect(session.update).not.toHaveBeenCalled(); // total stays null (no minutes)
    });

    test('6.1 AC2 (rounding): a 3:30 song (210s) rounds to 4 minutes on the entry', async () => {
      Song.findByPk.mockResolvedValue(ownedSong({ durationSeconds: 210 })); // 3:30 → round(3.5) = 4
      PracticeSession.findOne.mockResolvedValue(null);
      SessionItem.findOne.mockResolvedValue(null);

      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), mockRes(), mockNext());

      expect(SessionItem.create.mock.calls[0][0].minutes).toBe(4);
    });

    test('6.1 AC3 (no duration): a song without a duration keeps the no-minutes entry (FR21 original)', async () => {
      Song.findByPk.mockResolvedValue(ownedSong()); // no durationSeconds
      PracticeSession.findOne.mockResolvedValue(null);
      SessionItem.findOne.mockResolvedValue(null);

      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), mockRes(), mockNext());

      expect(SessionItem.create.mock.calls[0][0].minutes).toBeNull();
    });

    test('6.1 AC3 (sub-30s rounds to nothing): a 20s song adds a no-minutes entry', async () => {
      Song.findByPk.mockResolvedValue(ownedSong({ durationSeconds: 20 })); // round(0.33) = 0 → null
      PracticeSession.findOne.mockResolvedValue(null);
      SessionItem.findOne.mockResolvedValue(null);

      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), mockRes(), mockNext());

      expect(SessionItem.create.mock.calls[0][0].minutes).toBeNull();
    });

    test('6.1 AC4 (cumul): re-marking a song with a duration increments the existing entry minutes, no duplicate', async () => {
      Song.findByPk.mockResolvedValue(ownedSong({ durationSeconds: 240 })); // 4:00 → 4 min
      PracticeSession.findOne.mockResolvedValue({ uid: 'existing-session', instrumentType: 'Guitar', durationMinutes: null, update: jest.fn() });
      const existingItem = { uid: 'already-there', songUid: 'song-1', minutes: 10, update: jest.fn() };
      SessionItem.findOne.mockResolvedValue(existingItem);

      const res = mockRes();
      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), res, mockNext());

      expect(SessionItem.create).not.toHaveBeenCalled(); // no duplicate entry (AC4)
      expect(existingItem.update).toHaveBeenCalledTimes(1);
      expect(existingItem.update.mock.calls[0][0]).toMatchObject({ minutes: 14 }); // 10 + 4 accrued
      // The play still links to the same (now incremented) entry
      expect(SongPlay.create.mock.calls[0][0].sessionItemUid).toBe('already-there');
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('6.1 AC4 (cumul from no minutes): an existing no-minutes entry accrues the duration from zero', async () => {
      Song.findByPk.mockResolvedValue(ownedSong({ durationSeconds: 300 })); // 5:00 → 5 min
      PracticeSession.findOne.mockResolvedValue({ uid: 'existing-session', instrumentType: 'Guitar', durationMinutes: null, update: jest.fn() });
      const existingItem = { uid: 'already-there', songUid: 'song-1', minutes: null, update: jest.fn() };
      SessionItem.findOne.mockResolvedValue(existingItem);

      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), mockRes(), mockNext());

      expect(existingItem.update.mock.calls[0][0]).toMatchObject({ minutes: 5 });
    });

    test('6.1 AC4 (no duration): re-marking a song without a duration leaves the existing entry untouched', async () => {
      Song.findByPk.mockResolvedValue(ownedSong()); // no durationSeconds
      PracticeSession.findOne.mockResolvedValue({ uid: 'existing-session', instrumentType: 'Guitar', durationMinutes: null, update: jest.fn() });
      const existingItem = { uid: 'already-there', songUid: 'song-1', minutes: 8, update: jest.fn() };
      SessionItem.findOne.mockResolvedValue(existingItem);

      await controller.markSongPlayed(markReq({ instrumentType: 'Guitar', playedOn: TODAY }), mockRes(), mockNext());

      expect(existingItem.update).not.toHaveBeenCalled(); // no accrual without a duration
      expect(SessionItem.create).not.toHaveBeenCalled();
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
describe('deleteSong (Story 5.6: cleans playlists)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function deleteReq() {
    return { session: { user: 'user-1' }, params: { uid: 'song-1' } };
  }

  test('destroys the song; playlist cleanup is handled by the FK cascade (Story 5.7, no manual strip)', async () => {
    const song = ownedSong({ destroy: jest.fn() });
    Song.findByPk.mockResolvedValue(song);

    const res = mockRes();
    await controller.deleteSong(deleteReq(), res, mockNext());

    expect(song.destroy).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Song deleted successfully' });
  });

  test('401 when not authenticated', async () => {
    const next = mockNext();
    await controller.deleteSong({ session: {}, params: { uid: 'song-1' } }, mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(401);
  });

  test('404 when the song does not exist', async () => {
    Song.findByPk.mockResolvedValue(null);
    const next = mockNext();
    await controller.deleteSong(deleteReq(), mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(404);
  });

  test('403 for another user — no destroy', async () => {
    const song = ownedSong({ userUid: 'someone-else', destroy: jest.fn() });
    Song.findByPk.mockResolvedValue(song);
    const next = mockNext();
    await controller.deleteSong(deleteReq(), mockRes(), next);
    expect(next.mock.calls[0][0].status).toBe(403);
    expect(song.destroy).not.toHaveBeenCalled();
  });
});
