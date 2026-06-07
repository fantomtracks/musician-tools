const { PracticeSession, SessionItem, Song, SongPlay, Topic, sequelize } = require('../models');
const { fn, col, literal, Op } = require('sequelize');
const createError = require('http-errors');
const logger = require('../logger');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_DATE = '1900-01-01'; // guards against year typos like 0205-06-07
const MAX_DURATION_MINUTES = 1440; // 24 hours
const MAX_NOTE_LENGTH = 5000;
const MAX_ITEMS = 50;
const MAX_ITEM_NOTE_LENGTH = 1000;
// Reject malformed uids before they reach Postgres (invalid uuid input throws a DB error)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The calendar day of a historical play (FR22 retro-import). playedAt was
// stamped with the SERVER clock, so the UTC day is the best available truth —
// a 00:30 Paris play lands on the PREVIOUS UTC day, and a late-evening play
// in a UTC- zone can land on the next day, possibly the next year (known,
// accepted limitation; story 4.1 fixes the source going forward). This
// expression defines the day in the heatmap SELECT/GROUP, and the range
// filters below are its exact sargable equivalent — if either side diverged,
// a lit cell could open onto an empty panel.
// SongPlays columns are camelCase IN DB (historical exception) — the double
// quotes are mandatory or Postgres downcases the identifier.
const PLAY_DAY_EXPR = 'DATE("SongPlay"."playedAt" AT TIME ZONE \'UTC\')';

// Half-open UTC bounds equivalent to PLAY_DAY_EXPR = day — kept as plain
// comparisons on "playedAt" so the existing index can serve them (a WHERE on
// the DATE() expression would force a full scan of the joined plays)
function utcDayBounds(isoDay) {
  const start = new Date(`${isoDay}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { [Op.gte]: start.toISOString(), [Op.lt]: end.toISOString() };
}

// pg can hand a raw DATE() back as a string or a Date depending on the type
// parser — normalize to the YYYY-MM-DD string the heatmap contract uses.
// A pg-parsed DATE materializes at LOCAL midnight, so the calendar day lives
// in the LOCAL components — toISOString() would shift it back a day on any
// UTC+ server (the very mismatch PLAY_DAY_EXPR exists to prevent).
function playDayString(value) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

function isValidCalendarDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

// The client's local date is the source of truth for the session day (FR19).
// The server only sanity-checks against "UTC today + 1 day": a client ahead of
// the server's timezone can legitimately already be on "tomorrow".
function maxAllowedDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// GET all practice sessions for logged-in user, anti-chronological.
// Primary sort on the FR19 client-local date (a retroactive session belongs at
// its real day), createdAt breaks same-day ties. No pagination at this stage.
const getAllPracticeSessions = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    // Optional day filter (3.2 heatmap day detail): same list, one day
    const dateFilter = req.query?.date;
    if (dateFilter !== undefined) {
      if (typeof dateFilter !== 'string' || !DATE_PATTERN.test(dateFilter) || !isValidCalendarDate(dateFilter)) {
        return next(createError(400, 'Date must be a valid YYYY-MM-DD date'));
      }
    }
    const where = { userUid: userId };
    if (dateFilter) {
      where.date = dateFilter;
    }

    const sessions = await PracticeSession.findAll({
      where,
      include: [{ model: SessionItem, as: 'items' }],
      order: [
        ['date', 'DESC'],
        ['createdAt', 'DESC'],
        // uid tiebreaks: bulkCreate stamps identical timestamps on a batch,
        // and same-ms session inserts are possible — order must be stable
        ['uid', 'DESC'],
        [{ model: SessionItem, as: 'items' }, 'position', 'ASC'],
        [{ model: SessionItem, as: 'items' }, 'uid', 'ASC']
      ]
    });
    res.json(sessions);
  } catch (error) {
    logger.error('Error fetching practice sessions:', error);
    next(createError(500, 'Error fetching practice sessions'));
  }
};

// GET heatmap aggregates: total minutes and session count per day for one
// year, plus the projected play history (FR22 retro-import). Two GROUP BY
// queries (sessions, plays), merged in JS — a PROJECTION at read time, never
// materialized: nothing is written, so replays are idempotent by construction
// (NFR5). Session dates are the client-entered DATEONLY, grouped verbatim —
// no server timezone conversion (FR19). Only active days are returned; empty
// days are derived client-side.
const getHeatmap = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const yearRaw = req.query?.year;
    const year = Number(yearRaw);
    if (yearRaw === undefined || yearRaw === '' || !Number.isInteger(year) || year < 1900 || year > 2100) {
      return next(createError(400, 'Year must be a valid year'));
    }

    // Independent queries — run them concurrently.
    // SongPlay has no userUid: ownership goes through the Song parent.
    // The year filter is a sargable range on "playedAt" (UTC), strictly
    // equivalent to PLAY_DAY_EXPR BETWEEN Jan 1 and Dec 31 of the year.
    const [rows, playRows] = await Promise.all([
      PracticeSession.findAll({
        attributes: [
          'date',
          [fn('SUM', col('duration_minutes')), 'totalMinutes'],
          [fn('COUNT', col('uid')), 'sessionCount']
        ],
        where: { userUid: userId, date: { [Op.between]: [`${year}-01-01`, `${year}-12-31`] } },
        group: ['date'],
        order: [['date', 'ASC']],
        raw: true
      }),
      SongPlay.findAll({
        attributes: [
          [literal(PLAY_DAY_EXPR), 'date'],
          [fn('COUNT', col('SongPlay.uid')), 'playCount']
        ],
        include: [{ model: Song, attributes: [], where: { userUid: userId }, required: true }],
        where: { playedAt: { [Op.gte]: `${year}-01-01T00:00:00.000Z`, [Op.lt]: `${year + 1}-01-01T00:00:00.000Z` } },
        group: [literal(PLAY_DAY_EXPR)],
        raw: true
      })
    ]);

    // pg returns SUM (numeric) and COUNT (bigint) as STRINGS in raw mode;
    // a SUM over all-NULL durations is NULL
    const byDate = new Map(rows.map(row => [row.date, {
      date: row.date,
      totalMinutes: Number(row.totalMinutes ?? 0),
      sessionCount: Number(row.sessionCount),
      playCount: 0
    }]));

    // Merge rule (FR22, no double counting): a day with sessions keeps its
    // aggregates untouched — plays only annotate; a play-only day is pure
    // presence (zero minutes, zero sessions → minimal level client-side)
    for (const play of playRows) {
      const date = playDayString(play.date);
      const playCount = Number(play.playCount);
      const existing = byDate.get(date);
      if (existing) {
        existing.playCount = playCount;
      } else {
        byDate.set(date, { date, totalMinutes: 0, sessionCount: 0, playCount });
      }
    }

    // The merge breaks the SQL ordering — re-sort by date
    res.json([...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)));
  } catch (error) {
    logger.error('Error fetching heatmap:', error);
    next(createError(500, 'Error fetching heatmap'));
  }
};

// GET the raw plays of one day (FR22/AC4) — the day-detail companion of the
// heatmap projection. Same PLAY_DAY_EXPR as the aggregation: a lit cell must
// always open onto its plays. Plays are presence, not sessions: no duration.
const getDayPlays = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const date = req.query?.date;
    if (typeof date !== 'string' || !DATE_PATTERN.test(date) || !isValidCalendarDate(date)) {
      return next(createError(400, 'Date must be a valid YYYY-MM-DD date'));
    }
    if (date < MIN_DATE) {
      return next(createError(400, 'Date must be 1900-01-01 or later'));
    }

    const rows = await SongPlay.findAll({
      attributes: ['uid', 'songUid', 'instrumentType', 'playedAt'],
      include: [{ model: Song, attributes: ['title'], where: { userUid: userId }, required: true }],
      // Sargable equivalent of PLAY_DAY_EXPR = date (same UTC day as the grid)
      where: { playedAt: utcDayBounds(date) },
      // uid tiebreak: same-timestamp plays (rapid double-marks) need a stable order
      order: [['playedAt', 'ASC'], ['uid', 'ASC']],
      raw: true
    });

    // raw mode flattens the join as 'Song.title'
    res.json(rows.map(row => ({
      uid: row.uid,
      songUid: row.songUid,
      title: row['Song.title'],
      instrumentType: row.instrumentType,
      playedAt: row.playedAt
    })));
  } catch (error) {
    logger.error('Error fetching day plays:', error);
    next(createError(500, 'Error fetching day plays'));
  }
};

// POST create new practice session
const createPracticeSession = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    // req.body is undefined when the request body is not JSON — treat as empty
    const { date, instrumentType, durationMinutes, note, items } = req.body || {};

    if (typeof date !== 'string' || !DATE_PATTERN.test(date) || !isValidCalendarDate(date)) {
      return next(createError(400, 'Date must be a valid YYYY-MM-DD date'));
    }
    if (date < MIN_DATE) {
      return next(createError(400, 'Date must be 1900-01-01 or later'));
    }
    if (date > maxAllowedDate()) {
      return next(createError(400, 'Date cannot be in the future'));
    }

    const trimmedInstrument = typeof instrumentType === 'string' ? instrumentType.trim() : '';
    if (!trimmedInstrument) {
      return next(createError(400, 'Instrument is required'));
    }
    if (trimmedInstrument.length > 255) {
      return next(createError(400, 'Instrument must be at most 255 characters'));
    }
    if (trimmedInstrument.includes('\u0000')) {
      return next(createError(400, 'Instrument contains invalid characters'));
    }

    if (durationMinutes !== undefined && durationMinutes !== null) {
      if (typeof durationMinutes !== 'number' || !Number.isInteger(durationMinutes)
        || durationMinutes < 1 || durationMinutes > MAX_DURATION_MINUTES) {
        return next(createError(400, 'Duration must be a whole number of minutes between 1 and 1440'));
      }
    }

    let trimmedNote = null;
    if (note !== undefined && note !== null) {
      if (typeof note !== 'string') {
        return next(createError(400, 'Note must be a string'));
      }
      if (note.length > MAX_NOTE_LENGTH) {
        return next(createError(400, 'Note must be at most 5000 characters'));
      }
      if (note.includes('\u0000')) {
        return next(createError(400, 'Note contains invalid characters'));
      }
      trimmedNote = note.trim() || null;
    }

    // Validate and resolve every entry BEFORE creating anything: a validation
    // failure must never leave a half-created session behind.
    const pendingItems = [];
    const songUids = new Set();
    const topicUids = new Set();
    if (items !== undefined && items !== null) {
      if (!Array.isArray(items)) {
        return next(createError(400, 'Items must be an array'));
      }
      if (items.length > MAX_ITEMS) {
        return next(createError(400, 'Too many items'));
      }

      for (const item of items) {
        if (!item || typeof item !== 'object') {
          return next(createError(400, 'Each item must reference a song or a topic'));
        }
        const { songUid, topicUid, minutes, note: itemNote } = item;
        const hasSong = songUid !== undefined && songUid !== null;
        const hasTopic = topicUid !== undefined && topicUid !== null;
        if (hasSong && hasTopic) {
          return next(createError(400, 'Each item must reference a song or a topic, not both'));
        }
        if (!hasSong && !hasTopic) {
          return next(createError(400, 'Each item must reference a song or a topic'));
        }
        const refUid = hasSong ? songUid : topicUid;
        if (typeof refUid !== 'string' || !UUID_PATTERN.test(refUid)) {
          return next(createError(400, 'Invalid entry reference'));
        }

        if (minutes !== undefined && minutes !== null) {
          if (typeof minutes !== 'number' || !Number.isInteger(minutes)
            || minutes < 1 || minutes > MAX_DURATION_MINUTES) {
            return next(createError(400, 'Entry minutes must be a whole number of minutes between 1 and 1440'));
          }
        }

        let trimmedItemNote = null;
        if (itemNote !== undefined && itemNote !== null) {
          if (typeof itemNote !== 'string') {
            return next(createError(400, 'Entry note must be a string'));
          }
          if (itemNote.length > MAX_ITEM_NOTE_LENGTH) {
            return next(createError(400, 'Entry note must be at most 1000 characters'));
          }
          if (itemNote.includes('\u0000')) {
            return next(createError(400, 'Entry note contains invalid characters'));
          }
          trimmedItemNote = itemNote.trim() || null;
        }

        if (hasSong) {
          songUids.add(refUid);
        } else {
          topicUids.add(refUid);
        }
        pendingItems.push({
          songUid: hasSong ? refUid : null,
          topicUid: hasTopic ? refUid : null,
          minutes: minutes ?? null,
          note: trimmedItemNote
        });
      }
    }

    // Ownership-scoped batch resolution (NFR4): two queries total, not one per
    // item. An unknown uid and another user's uid get the same answer — no
    // enumeration oracle. Labels are snapshotted server-side so history
    // survives deletions (FR4).
    const songTitleByUid = new Map();
    const topicNameByUid = new Map();
    if (songUids.size > 0) {
      const songs = await Song.findAll({ where: { uid: [...songUids], userUid: userId } });
      songs.forEach(song => songTitleByUid.set(song.uid, song.title));
    }
    if (topicUids.size > 0) {
      const topics = await Topic.findAll({ where: { uid: [...topicUids], userUid: userId } });
      topics.forEach(topic => topicNameByUid.set(topic.uid, topic.name));
    }

    const resolvedItems = [];
    for (const item of pendingItems) {
      const label = item.songUid !== null
        ? songTitleByUid.get(item.songUid)
        : topicNameByUid.get(item.topicUid);
      if (label === undefined) {
        return next(createError(400, 'Invalid entry reference'));
      }
      resolvedItems.push({ ...item, label });
    }

    const sessionValues = {
      userUid: userId,
      date,
      instrumentType: trimmedInstrument,
      durationMinutes: durationMinutes ?? null,
      note: trimmedNote
    };

    let practiceSession;
    let createdItems = [];
    if (resolvedItems.length > 0) {
      await sequelize.transaction(async (transaction) => {
        practiceSession = await PracticeSession.create(sessionValues, { transaction });
        createdItems = await SessionItem.bulkCreate(
          resolvedItems.map((item, index) => ({ ...item, sessionUid: practiceSession.uid, position: index })),
          { transaction }
        );
      });
    } else {
      practiceSession = await PracticeSession.create(sessionValues);
    }

    const sessionJson = typeof practiceSession.toJSON === 'function' ? practiceSession.toJSON() : practiceSession;
    const itemsJson = createdItems.map(item => (typeof item.toJSON === 'function' ? item.toJSON() : item));
    res.status(201).json({ ...sessionJson, items: itemsJson });
  } catch (error) {
    // TOCTOU: a referenced song/topic deleted between resolution and insert
    // violates the FK inside the transaction — same answer as a bad reference
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return next(createError(400, 'Invalid entry reference'));
    }
    logger.error('Error creating practice session:', error);
    next(createError(500, 'Error creating practice session'));
  }
};

// PUT update practice session. Session fields are partial (absent = unchanged,
// explicit null clears duration/note). Items use DIFF-by-uid semantics: a row
// with a uid is updated in place (its FR4 snapshot label survives unless a new
// ref triggers re-resolution), a row without uid is created, existing rows
// absent from the payload are deleted. Positions follow the payload order.
const updatePracticeSession = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }
    if (!UUID_PATTERN.test(req.params.uid)) {
      return next(createError(404, 'Session not found'));
    }

    const practiceSession = await PracticeSession.findByPk(req.params.uid, {
      include: [{ model: SessionItem, as: 'items' }]
    });
    if (!practiceSession) {
      return next(createError(404, 'Session not found'));
    }
    if (practiceSession.userUid !== userId) {
      return next(createError(403, 'Forbidden'));
    }

    const { date, instrumentType, durationMinutes, note, items } = req.body || {};

    let nextDate = practiceSession.date;
    if (date !== undefined) {
      if (typeof date !== 'string' || !DATE_PATTERN.test(date) || !isValidCalendarDate(date)) {
        return next(createError(400, 'Date must be a valid YYYY-MM-DD date'));
      }
      if (date < MIN_DATE) {
        return next(createError(400, 'Date must be 1900-01-01 or later'));
      }
      if (date > maxAllowedDate()) {
        return next(createError(400, 'Date cannot be in the future'));
      }
      nextDate = date;
    }

    let nextInstrument = practiceSession.instrumentType;
    if (instrumentType !== undefined) {
      const trimmedInstrument = typeof instrumentType === 'string' ? instrumentType.trim() : '';
      if (!trimmedInstrument) {
        return next(createError(400, 'Instrument is required'));
      }
      if (trimmedInstrument.length > 255) {
        return next(createError(400, 'Instrument must be at most 255 characters'));
      }
      if (trimmedInstrument.includes('\u0000')) {
        return next(createError(400, 'Instrument contains invalid characters'));
      }
      nextInstrument = trimmedInstrument;
    }

    let nextDuration = practiceSession.durationMinutes;
    if (durationMinutes !== undefined) {
      if (durationMinutes === null) {
        nextDuration = null;
      } else {
        if (typeof durationMinutes !== 'number' || !Number.isInteger(durationMinutes)
          || durationMinutes < 1 || durationMinutes > MAX_DURATION_MINUTES) {
          return next(createError(400, 'Duration must be a whole number of minutes between 1 and 1440'));
        }
        nextDuration = durationMinutes;
      }
    }

    let nextNote = practiceSession.note;
    if (note !== undefined) {
      if (note === null) {
        nextNote = null;
      } else {
        if (typeof note !== 'string') {
          return next(createError(400, 'Note must be a string'));
        }
        if (note.length > MAX_NOTE_LENGTH) {
          return next(createError(400, 'Note must be at most 5000 characters'));
        }
        if (note.includes('\u0000')) {
          return next(createError(400, 'Note contains invalid characters'));
        }
        nextNote = note.trim() || null;
      }
    }

    // Items diff — validate and resolve everything BEFORE the transaction
    let itemOps = null;
    if (items !== undefined && items !== null) {
      if (!Array.isArray(items)) {
        return next(createError(400, 'Items must be an array'));
      }
      if (items.length > MAX_ITEMS) {
        return next(createError(400, 'Too many items'));
      }

      const existingByUid = new Map(practiceSession.items.map(item => [item.uid, item]));
      const songUids = new Set();
      const topicUids = new Set();
      const keptUids = new Set();
      const pendingRows = [];

      for (const item of items) {
        if (!item || typeof item !== 'object') {
          return next(createError(400, 'Each item must reference a song or a topic'));
        }
        const { uid, songUid, topicUid, minutes, note: itemNote } = item;
        const hasSong = songUid !== undefined && songUid !== null;
        const hasTopic = topicUid !== undefined && topicUid !== null;
        if (hasSong && hasTopic) {
          return next(createError(400, 'Each item must reference a song or a topic, not both'));
        }

        let existing = null;
        if (uid !== undefined && uid !== null) {
          if (typeof uid !== 'string' || !UUID_PATTERN.test(uid) || !existingByUid.has(uid)) {
            return next(createError(400, 'Invalid entry reference'));
          }
          if (keptUids.has(uid)) {
            // The same row twice would silently collapse into one (last write
            // wins) and leave a position hole
            return next(createError(400, 'Duplicate entry reference'));
          }
          existing = existingByUid.get(uid);
          keptUids.add(uid);
        } else if (!hasSong && !hasTopic) {
          return next(createError(400, 'Each item must reference a song or a topic'));
        }

        if (hasSong || hasTopic) {
          const refUid = hasSong ? songUid : topicUid;
          if (typeof refUid !== 'string' || !UUID_PATTERN.test(refUid)) {
            return next(createError(400, 'Invalid entry reference'));
          }
          if (hasSong) songUids.add(refUid);
          else topicUids.add(refUid);
        }

        if (minutes !== undefined && minutes !== null) {
          if (typeof minutes !== 'number' || !Number.isInteger(minutes)
            || minutes < 1 || minutes > MAX_DURATION_MINUTES) {
            return next(createError(400, 'Entry minutes must be a whole number of minutes between 1 and 1440'));
          }
        }

        let trimmedItemNote = null;
        if (itemNote !== undefined && itemNote !== null) {
          if (typeof itemNote !== 'string') {
            return next(createError(400, 'Entry note must be a string'));
          }
          if (itemNote.length > MAX_ITEM_NOTE_LENGTH) {
            return next(createError(400, 'Entry note must be at most 1000 characters'));
          }
          if (itemNote.includes('\u0000')) {
            return next(createError(400, 'Entry note contains invalid characters'));
          }
          trimmedItemNote = itemNote.trim() || null;
        }

        pendingRows.push({ existing, hasSong, hasTopic, songUid, topicUid, minutes: minutes ?? null, note: trimmedItemNote });
      }

      const songTitleByUid = new Map();
      const topicNameByUid = new Map();
      if (songUids.size > 0) {
        const songs = await Song.findAll({ where: { uid: [...songUids], userUid: userId } });
        songs.forEach(song => songTitleByUid.set(song.uid, song.title));
      }
      if (topicUids.size > 0) {
        const topics = await Topic.findAll({ where: { uid: [...topicUids], userUid: userId } });
        topics.forEach(topic => topicNameByUid.set(topic.uid, topic.name));
      }

      const rows = [];
      for (let index = 0; index < pendingRows.length; index += 1) {
        const pending = pendingRows[index];
        let label;
        let songUidValue;
        let topicUidValue;
        if (pending.hasSong || pending.hasTopic) {
          label = pending.hasSong
            ? songTitleByUid.get(pending.songUid)
            : topicNameByUid.get(pending.topicUid);
          if (label === undefined) {
            return next(createError(400, 'Invalid entry reference'));
          }
          songUidValue = pending.hasSong ? pending.songUid : null;
          topicUidValue = pending.hasTopic ? pending.topicUid : null;
        } else {
          // No new ref: keep the existing refs and FR4 snapshot label
          label = pending.existing.label;
          songUidValue = pending.existing.songUid;
          topicUidValue = pending.existing.topicUid;
        }
        rows.push({
          existing: pending.existing,
          values: {
            songUid: songUidValue,
            topicUid: topicUidValue,
            label,
            minutes: pending.minutes,
            note: pending.note,
            position: index
          }
        });
      }

      const toDelete = practiceSession.items
        .filter(item => !keptUids.has(item.uid))
        .map(item => item.uid);
      itemOps = { rows, toDelete };
    }

    await sequelize.transaction(async (transaction) => {
      await practiceSession.update({
        date: nextDate,
        instrumentType: nextInstrument,
        durationMinutes: nextDuration,
        note: nextNote
      }, { transaction });

      if (itemOps) {
        if (itemOps.toDelete.length > 0) {
          await SessionItem.destroy({ where: { uid: itemOps.toDelete }, transaction });
        }
        for (const row of itemOps.rows) {
          if (row.existing) {
            await row.existing.update(row.values, { transaction });
          } else {
            await SessionItem.create({ ...row.values, sessionUid: practiceSession.uid }, { transaction });
          }
        }
      }
    });

    const itemsAfter = await SessionItem.findAll({
      where: { sessionUid: practiceSession.uid },
      order: [['position', 'ASC'], ['uid', 'ASC']]
    });
    const sessionJson = typeof practiceSession.toJSON === 'function' ? practiceSession.toJSON() : practiceSession;
    res.json({ ...sessionJson, items: itemsAfter.map(item => (typeof item.toJSON === 'function' ? item.toJSON() : item)) });
  } catch (error) {
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return next(createError(400, 'Invalid entry reference'));
    }
    logger.error('Error updating practice session:', error);
    next(createError(500, 'Error updating practice session'));
  }
};

// DELETE practice session (items removed by the FK CASCADE)
const deletePracticeSession = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }
    if (!UUID_PATTERN.test(req.params.uid)) {
      return next(createError(404, 'Session not found'));
    }

    const practiceSession = await PracticeSession.findByPk(req.params.uid);
    if (!practiceSession) {
      return next(createError(404, 'Session not found'));
    }
    if (practiceSession.userUid !== userId) {
      return next(createError(403, 'Forbidden'));
    }

    await practiceSession.destroy();
    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    logger.error('Error deleting practice session:', error);
    next(createError(500, 'Error deleting practice session'));
  }
};

module.exports = {
  getAllPracticeSessions,
  getHeatmap,
  getDayPlays,
  createPracticeSession,
  updatePracticeSession,
  deletePracticeSession,
};
