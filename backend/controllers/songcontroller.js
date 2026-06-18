const { Song, SongPlay, PracticeSession, SessionItem, sequelize } = require('../models');
const createError = require('http-errors');
const logger = require('../logger');
const { fetchSongMetadata } = require('../services/songMetadataService');
// Shared FR19 day-validation helpers (same definition as the session controller)
const { DATE_PATTERN, MIN_DATE, isValidCalendarDate, maxAllowedDate } = require('../utils/sessionDates');

// FR24: an optional song duration in whole seconds (the client sends seconds,
// parsed from m:ss or decimal-minutes input). Nullable for backward
// compatibility (a song without a duration stays valid). undefined means "field
// absent from the payload" (leave it untouched on update); anything out of range
// is treated as cleared (null) rather than rejected, mirroring normalizeCapo.
const normalizeDurationSeconds = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 86400) return null;
  return parsed;
};

const normalizeCapo = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) return null;
  return parsed;
};

const normalizeLanguage = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  
  // Handle array of languages
  if (Array.isArray(value)) {
    const normalized = value
      .map(lang => {
        if (!lang) return null;
        const trimmed = String(lang).trim();
        if (!trimmed) return null;
        return trimmed
          .split(/\s+/)
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join(' ');
      })
      .filter(lang => lang !== null);
    return normalized.length > 0 ? normalized : null;
  }
  
  // Handle single language string
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

// GET all songs for logged-in user
const getAllSongs = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const songs = await Song.findAll({
      where: { userUid: userId },
      order: [['createdAt', 'DESC']]
    });
    res.json(songs);
  } catch (error) {
    logger.error('Error fetching songs:', error);
    next(createError(500, 'Error fetching songs'));
  }
};

// GET single song by uid
const getSong = async (req, res, next) => {
  try {
    const song = await Song.findByPk(req.params.uid);
    if (!song) {
      return next(createError(404, 'Song not found'));
    }
    res.json(song);
  } catch (error) {
    logger.error('Error fetching song:', error);
    next(createError(500, 'Error fetching song'));
  }
};

// POST create new song
const createSong = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const { title, bpm, durationSeconds, key, capo, notes, instrument, artist, album, language, genre, pitchStandard, instrumentTuning, technique, instrumentLinks, instrumentDifficulty, myInstrumentUid, lastPlayed, streamingLinks, timeSignature, mode } = req.body;

    if (!title) {
      return next(createError(400, 'Title is required'));
    }

    const normalizedCapo = normalizeCapo(capo);

    const normalizedDuration = normalizeDurationSeconds(durationSeconds);

    const normalizedLanguage = normalizeLanguage(language);

    const song = await Song.create({
      userUid: userId,
      title,
      bpm: bpm !== undefined ? bpm : null,
      durationSeconds: normalizedDuration !== undefined ? normalizedDuration : null,
      key,
      capo: normalizedCapo !== undefined ? normalizedCapo : null,
      notes,
      instrument,
      instrumentLinks,
      instrumentDifficulty,
      instrumentTuning,
      artist,
      album,
      language: normalizedLanguage !== undefined ? normalizedLanguage : null,
      genre,
      pitchStandard,
      technique,
      myInstrumentUid,
      lastPlayed: lastPlayed ? new Date(lastPlayed) : null,
      streamingLinks,
      timeSignature,
      mode
    });

    res.status(201).json(song);
  } catch (error) {
    logger.error('Error creating song:', error);
    next(createError(500, 'Error creating song'));
  }
};

// PUT update song
const updateSong = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const song = await Song.findByPk(req.params.uid);
    if (!song) {
      return next(createError(404, 'Song not found'));
    }

    // Check ownership
    if (song.userUid !== userId) {
      return next(createError(403, 'Forbidden'));
    }

    const { title, bpm, durationSeconds, key, capo, notes, instrument, artist, album, language, genre, pitchStandard, instrumentTuning, technique, instrumentLinks, instrumentDifficulty, myInstrumentUid, lastPlayed, streamingLinks, timeSignature, mode } = req.body;

    const normalizedCapo = normalizeCapo(capo);

    const normalizedDuration = normalizeDurationSeconds(durationSeconds);

    const normalizedLanguage = normalizeLanguage(language);

    await song.update({
      title: title || song.title,
      bpm: bpm !== undefined ? bpm : song.bpm,
      durationSeconds: normalizedDuration !== undefined ? normalizedDuration : song.durationSeconds,
      key: key !== undefined ? key : song.key,
      capo: normalizedCapo !== undefined ? normalizedCapo : song.capo,
      notes: notes !== undefined ? notes : song.notes,
      instrument: instrument !== undefined ? instrument : song.instrument,
      artist: artist !== undefined ? artist : song.artist,
      album: album !== undefined ? album : song.album,
      language: normalizedLanguage !== undefined ? normalizedLanguage : song.language,
      genre: genre !== undefined ? genre : song.genre,
      pitchStandard: pitchStandard !== undefined ? pitchStandard : song.pitchStandard,
      instrumentTuning: instrumentTuning !== undefined ? instrumentTuning : song.instrumentTuning,
      technique: technique !== undefined ? technique : song.technique,
      instrumentLinks: instrumentLinks !== undefined ? instrumentLinks : song.instrumentLinks,
      instrumentDifficulty: instrumentDifficulty !== undefined ? instrumentDifficulty : song.instrumentDifficulty,
      lastPlayed: lastPlayed ? new Date(lastPlayed) : song.lastPlayed,
      myInstrumentUid: myInstrumentUid !== undefined ? myInstrumentUid : song.myInstrumentUid,
      streamingLinks: streamingLinks !== undefined ? streamingLinks : song.streamingLinks,
      timeSignature: timeSignature !== undefined ? timeSignature : song.timeSignature,
      mode: mode !== undefined ? mode : song.mode
    });

    res.json(song);
  } catch (error) {
    logger.error('Error updating song:', error);
    next(createError(500, 'Error updating song'));
  }
};

// DELETE song
const deleteSong = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const song = await Song.findByPk(req.params.uid);
    if (!song) {
      return next(createError(404, 'Song not found'));
    }

    // Check ownership
    if (song.userUid !== userId) {
      return next(createError(403, 'Forbidden'));
    }

    // Deleting the song cascades to its PlaylistSongs join rows via the FK
    // (Story 5.7) — no manual playlist cleanup needed anymore (was Story 5.6).
    await song.destroy();
    res.json({ message: 'Song deleted successfully' });
  } catch (error) {
    logger.error('Error deleting song:', error);
    next(createError(500, 'Error deleting song'));
  }
};

// POST mark song as played — also feeds the practice journal (story 4.1, FR21):
// the click creates or completes the day's session for the played instrument and
// adds the song as an entry. FR21 amended (story 6.1 / FR24): when the song has a
// duration, the entry is PRE-FILLED with it (in minutes) instead of being a
// no-minutes entry, and re-marking the same song accrues that duration onto the
// existing entry (AC4) — the pre-fill is only an initial value, still editable
// afterwards. A song without a duration keeps the original no-minutes behaviour.
// The day is the CLIENT's local date (FR19): the server no longer stamps the day
// from its own clock.
const markSongPlayed = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const { instrumentUid, instrumentType, playedOn } = req.body || {};

    // The client-local day is required and validated like a session date (FR19)
    if (typeof playedOn !== 'string' || !DATE_PATTERN.test(playedOn) || !isValidCalendarDate(playedOn)) {
      return next(createError(400, 'playedOn (local date) is required as a valid YYYY-MM-DD date'));
    }
    if (playedOn < MIN_DATE) {
      return next(createError(400, 'playedOn must be 1900-01-01 or later'));
    }
    if (playedOn > maxAllowedDate()) {
      return next(createError(400, 'playedOn cannot be in the future'));
    }

    const song = await Song.findByPk(req.params.uid);
    if (!song) {
      return next(createError(404, 'Song not found'));
    }

    // Check ownership
    if (song.userUid !== userId) {
      return next(createError(403, 'Forbidden'));
    }

    let trimmedInstrument = typeof instrumentType === 'string' ? instrumentType.trim() : '';
    // Defensive: an out-of-range instrument (length / NUL byte) would throw on
    // PracticeSession.create INSIDE the transaction and roll back the play too,
    // losing it (pre-4.1 the play was always recorded). Drop the session step
    // for such input rather than 500 — the play stays durable.
    if (trimmedInstrument.length > 255 || trimmedInstrument.includes(String.fromCharCode(0))) {
      trimmedInstrument = '';
    }

    // Atomicity: the session, its entry and the linked play move together.
    // Order (4.2): the session entry is created/found FIRST so the play can
    // link to it (sessionItemUid) — deleting the session/entry then cascades
    // the play away, keeping the derived "last played" honest (FR23).
    const songPlay = await sequelize.transaction(async (transaction) => {
      // Stamp the play on the CLIENT day (FR19/AC5) but keep the server's
      // current time-of-day so successive marks stay orderable — the per-
      // instrument "last played" sort relies on distinct playedAt values.
      // Using playedOn as the UTC date part guarantees the play's UTC day
      // (what the 3.3 heatmap projection derives) equals the session day, so
      // no cell is double-lit. The time-of-day never dates the day, only
      // breaks ties.
      const playedAt = new Date(`${playedOn}T${new Date().toISOString().slice(11)}`);

      // FR24: the song's duration pre-fills the journal entry. The duration is
      // stored in seconds but the journal entry carries whole minutes, so we
      // round to the nearest minute (3:30 → 4). Guard defensively — only a
      // positive integer of seconds counts; anything else (and durations that
      // round to 0, i.e. under 30s) falls back to the no-minutes behaviour.
      let playedDuration = null;
      if (Number.isInteger(song.durationSeconds) && song.durationSeconds > 0) {
        const rounded = Math.round(song.durationSeconds / 60);
        playedDuration = rounded > 0 ? rounded : null;
      }

      // A session carries exactly one instrument (FR7), so feeding the journal
      // requires one. A play without an instrument (bulk mark with no active
      // filter) is still recorded below, but creates no session/entry and stays
      // standalone (sessionItemUid null).
      let sessionItemUid = null;
      if (trimmedInstrument) {
        // Deterministic pick when several sessions share the day/instrument
        // (legitimate via manual entry): append to the most recently created.
        let session = await PracticeSession.findOne({
          where: { userUid: userId, date: playedOn, instrumentType: trimmedInstrument },
          order: [['createdAt', 'DESC']],
          transaction,
        });
        if (!session) {
          session = await PracticeSession.create({
            userUid: userId,
            date: playedOn,
            instrumentType: trimmedInstrument,
            durationMinutes: null,
            note: null,
          }, { transaction });
        }

        // FR13: the session total tracks the sum of its entries' minutes, so the
        // practice time shows in the journal AND counts on the heatmap (which
        // sums PracticeSession.durationMinutes). Capture the sum BEFORE this mark
        // and only keep managing the total while it still equals that sum (or is
        // unset) — a manual override (total ≠ entries' sum) is never clobbered.
        // Number(): pg returns SUM as a string in some paths — coerce so the
        // arithmetic below stays numeric (avoids '4' + 5 === '45').
        const priorTotal = Number(await SessionItem.sum('minutes', { where: { sessionUid: session.uid }, transaction })) || 0;
        const totalIsAuto = session.durationMinutes == null || session.durationMinutes === priorTotal;

        // No duplicate entry (AC4): reuse the entry if the song is already there
        let item = await SessionItem.findOne({
          where: { sessionUid: session.uid, songUid: song.uid },
          transaction,
        });
        if (!item) {
          const position = await SessionItem.count({ where: { sessionUid: session.uid }, transaction });
          item = await SessionItem.create({
            sessionUid: session.uid,
            songUid: song.uid,
            topicUid: null,
            label: song.title, // FR4: server-side snapshot, survives a song deletion
            minutes: playedDuration, // FR21 amended: pre-fill with the song's duration (null when it has none)
            note: null,
            position,
          }, { transaction });
        } else if (playedDuration !== null) {
          // AC4: same song re-marked — no duplicate entry, but accrue the song's
          // duration onto the existing entry (treat a missing value as 0).
          const current = Number.isInteger(item.minutes) ? item.minutes : 0;
          await item.update({ minutes: current + playedDuration }, { transaction });
        }
        sessionItemUid = item.uid;

        // Sync the managed total: a created entry adds its pre-fill, a re-mark
        // adds the accrued duration — both equal playedDuration (null → 0). Stay
        // within the 1..1440 server range; out of range, leave the total as-is.
        if (totalIsAuto) {
          const nextTotal = priorTotal + (playedDuration ?? 0);
          if (nextTotal >= 1 && nextTotal <= 1440 && nextTotal !== session.durationMinutes) {
            await session.update({ durationMinutes: nextTotal }, { transaction });
          }
        }
      }

      return SongPlay.create({
        songUid: song.uid,
        instrumentUid: instrumentUid || null,
        instrumentType: trimmedInstrument || null,
        playedAt,
        sessionItemUid, // link to the journal entry (4.2), null when standalone
      }, { transaction });
    });

    // lastPlayed coherence is story 4.2 — left as the existing fallback for now
    await song.update({ lastPlayed: new Date() });

    res.status(201).json(songPlay);
  } catch (error) {
    logger.error('Error marking song as played:', error);
    next(createError(500, 'Error marking song as played'));
  }
};

// GET song plays history
const getSongPlays = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const song = await Song.findByPk(req.params.uid);
    if (!song) {
      return next(createError(404, 'Song not found'));
    }

    // Check ownership
    if (song.userUid !== userId) {
      return next(createError(403, 'Forbidden'));
    }

    const plays = await SongPlay.findAll({
      where: { songUid: song.uid },
      order: [['playedAt', 'DESC']],
    });

    res.json(plays);
  } catch (error) {
    logger.error('Error fetching song plays:', error);
    next(createError(500, 'Error fetching song plays'));
  }
};

// GET lookup metadata for a song (bpm/key/genres/album)
const lookupSongMetadata = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const { title, artist } = req.query;
    if (!title || !artist) {
      return next(createError(400, 'title and artist are required'));
    }

    const metadata = await fetchSongMetadata({ title, artist });
    res.json(metadata);
  } catch (error) {
    logger.error('Error looking up song metadata:', error);
    next(createError(500, 'Error looking up song metadata'));
  }
};

module.exports = {
  getAllSongs,
  getSong,
  createSong,
  updateSong,
  deleteSong,
  markSongPlayed,
  getSongPlays,
  lookupSongMetadata,
};
