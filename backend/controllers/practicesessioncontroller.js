const { PracticeSession, SessionItem, Song, Topic, sequelize } = require('../models');
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

    const sessions = await PracticeSession.findAll({
      where: { userUid: userId },
      include: [{ model: SessionItem, as: 'items' }],
      order: [
        ['date', 'DESC'],
        ['createdAt', 'DESC'],
        // uid tiebreaks: bulkCreate stamps identical timestamps on a batch,
        // and same-ms session inserts are possible — order must be stable
        ['uid', 'DESC'],
        [{ model: SessionItem, as: 'items' }, 'createdAt', 'ASC'],
        [{ model: SessionItem, as: 'items' }, 'uid', 'ASC']
      ]
    });
    res.json(sessions);
  } catch (error) {
    logger.error('Error fetching practice sessions:', error);
    next(createError(500, 'Error fetching practice sessions'));
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
          resolvedItems.map(item => ({ ...item, sessionUid: practiceSession.uid })),
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

module.exports = {
  getAllPracticeSessions,
  createPracticeSession,
};
