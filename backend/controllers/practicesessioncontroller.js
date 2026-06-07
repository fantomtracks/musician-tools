const { PracticeSession } = require('../models');
const createError = require('http-errors');
const logger = require('../logger');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_DATE = '1900-01-01'; // guards against year typos like 0205-06-07
const MAX_DURATION_MINUTES = 1440; // 24 hours
const MAX_NOTE_LENGTH = 5000;

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

// POST create new practice session
const createPracticeSession = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    // req.body is undefined when the request body is not JSON — treat as empty
    const { date, instrumentType, durationMinutes, note } = req.body || {};

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

    const practiceSession = await PracticeSession.create({
      userUid: userId,
      date,
      instrumentType: trimmedInstrument,
      durationMinutes: durationMinutes ?? null,
      note: trimmedNote
    });

    res.status(201).json(practiceSession);
  } catch (error) {
    logger.error('Error creating practice session:', error);
    next(createError(500, 'Error creating practice session'));
  }
};

module.exports = {
  createPracticeSession,
};
