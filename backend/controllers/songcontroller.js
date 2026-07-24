const { Song, SongPlay, PracticeSession, SessionItem, Instrument, CatalogSong, sequelize } = require('../models');
const { Op, fn, col, where: whereFn } = require('sequelize');
const createError = require('http-errors');
const logger = require('../logger');
const { fetchSongMetadata } = require('../services/songMetadataService');
// Shared FR19 day-validation helpers (same definition as the session controller)
const { DATE_PATTERN, MIN_DATE, isValidCalendarDate, maxAllowedDate } = require('../utils/sessionDates');
const { isUuid } = require('../utils/uuid');
// Story 19.8 — shared normalizers (reject-to-null; INTEGER columns can't 500 on a
// decimal / non-numeric / out-of-INT4 input). normalizeLanguage moved here too.
const { normalizeInt, normalizeDurationSeconds, normalizeLanguage, normalizeMode } = require('../utils/normalize');

const normalizeCapo = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) return null;
  return parsed;
};

// Trim a free-text field before persisting (title/artist/album). undefined =
// field absent from the payload -> leave it untouched on update. Whitespace-only
// collapses to null so a stray trailing space never becomes a distinct "empty"
// value in the suggestion/filter lists. Mirrors normalizeLanguage's contract.
const normalizeText = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  // Non-string (number/boolean/object/array): leave it as-is so the caller's
  // prior semantics hold (e.g. a numeric/falsy title still fails the required
  // check) instead of coercing it into "0"/"false"/"[object Object]".
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

// Story 17.1: look up the user's existing song that collides with (title, artist)
// on the SAME folded key as the unique index — lower(title) + COALESCE(lower(artist), '').
// Used to enrich the 409 body so the front (17.2) can point at the existing song.
// Scoped to userUid -> no cross-user existence oracle. title/artist passed in are
// already trimmed (normalizeText). excludeUid skips the row being edited (update).
function findExistingByTitleArtist(userUid, title, artist, excludeUid) {
  const foldedTitle = whereFn(fn('lower', col('title')), String(title).toLowerCase());
  const foldedArtist = whereFn(
    fn('coalesce', fn('lower', col('artist')), ''),
    artist ? String(artist).toLowerCase() : ''
  );
  const and = [{ userUid }, foldedTitle, foldedArtist];
  if (excludeUid) and.push({ uid: { [Op.ne]: excludeUid } });
  return Song.findOne({ where: { [Op.and]: and } });
}

// Story 17.1: map a unique-constraint violation (23505 -> SequelizeUniqueConstraintError,
// from the functional index songs_user_uid_title_artist_ci) to a typed 409 the front
// can parse, best-effort attaching the existing song. Never throws (a failed lookup
// still yields the 409 with song: null). Returns true if it handled the error.
async function respondDuplicateSong(res, error, userUid, title, artist, excludeUid) {
  if (!error || error.name !== 'SequelizeUniqueConstraintError') return false;
  const existing = await findExistingByTitleArtist(userUid, title, artist, excludeUid).catch(() => null);
  res.status(409).json({
    error: 'duplicate_song',
    message: 'A song with this title and artist already exists',
    song: existing,
  });
  return true;
}

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
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    // Scoped lookup (story 7.5): another user's uid and an unknown uid get the
    // same 404 — closes the IDOR and the existence oracle.
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Song not found'));
    }
    const song = await Song.findOne({ where: { uid: req.params.uid, userUid: userId } });
    if (!song) {
      return next(createError(404, 'Song not found'));
    }
    // Story 21.1: enrich with the Catalog source link + drift flag when this Song is a
    // Catalog copy AND the source is still PUBLISHED. Read is NON-scoped by userUid (§3:
    // a Catalog entry is shared). A draft/absent source yields no `sourceCatalog` (do not
    // leak a draft's existence, and offer no dead link/refresh).
    if (song.sourceCatalogUid) {
      // Graceful degradation: a failed source lookup omits the sourceCatalog block rather
      // than 500-ing the whole read — but it must NOT be silent (else a DB fault looks
      // exactly like "no source"). Log it.
      const catalog = await CatalogSong.findByPk(song.sourceCatalogUid)
        .catch((e) => { logger.error('getSong: catalog source lookup failed', e); return null; });
      if (catalog && catalog.publishedAt != null) {
        const drift = song.sourceCatalogSyncedAt == null
          || new Date(catalog.updatedAt) > new Date(song.sourceCatalogSyncedAt);
        return res.json({ ...song.toJSON(), sourceCatalog: { uid: catalog.uid, updatedAt: catalog.updatedAt, drift } });
      }
    }
    res.json(song);
  } catch (error) {
    logger.error('Error fetching song:', error);
    next(createError(500, 'Error fetching song'));
  }
};

// POST /api/songs/:uid/refresh-from-catalog (story 21.1) — pull the current Catalog
// version into this copy: overwrite the INTRINSIC fields, PRESERVE personal + identity.
const INTRINSIC_REFRESH_FIELDS = ['key', 'bpm', 'mode', 'timeSignature', 'durationSeconds', 'pitchStandard'];
const refreshSongFromCatalog = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Song not found'));
    }
    // Scoped (7.5): not-yours and unknown both 404.
    const song = await Song.findOne({ where: { uid: req.params.uid, userUid: userId } });
    if (!song) {
      return next(createError(404, 'Song not found'));
    }
    if (!song.sourceCatalogUid) {
      return res.status(409).json({ error: 'not_from_catalog', message: 'This song was not added from the Catalog' });
    }
    const catalog = await CatalogSong.findByPk(song.sourceCatalogUid);
    if (!catalog || catalog.publishedAt == null) {
      // Source deleted or unpublished → cannot refresh; the copy is left untouched.
      return res.status(409).json({ error: 'source_unavailable', message: 'The source is no longer available in the Catalog' });
    }
    // Overwrite ONLY the intrinsic fields (identity title/artist/album and all personal
    // fields are left untouched). JSON fields are deep-cloned so the copy never shares a
    // reference with the shared Catalog entry (mirror buildSongFromCatalog).
    const updates = { sourceCatalogSyncedAt: catalog.updatedAt };
    for (const f of INTRINSIC_REFRESH_FIELDS) updates[f] = catalog[f] ?? null;
    updates.language = structuredClone(catalog.language ?? null);
    updates.genre = structuredClone(catalog.genre ?? null);
    updates.streamingLinks = structuredClone(catalog.streamingLinks ?? null);

    const updated = await song.update(updates);
    res.json(updated);
  } catch (error) {
    logger.error('Error refreshing song from catalog:', error);
    next(createError(500, 'Error refreshing from catalog'));
  }
};

// POST create new song
const createSong = async (req, res, next) => {
  // Hoisted so the catch can map a duplicate-key error to a typed 409 (story 17.1).
  let normalizedTitle;
  let normalizedArtist;
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const { title, bpm, durationSeconds, key, capo, notes, instrument, artist, album, language, genre, pitchStandard, instrumentTuning, technique, instrumentLinks, instrumentDifficulty, myInstrumentUid, lastPlayed, streamingLinks, timeSignature, mode } = req.body || {};

    normalizedTitle = normalizeText(title);

    // Trim before the required check so a whitespace-only title is a 400, not a
    // song stored with a stray-space title (title is NOT NULL).
    if (!normalizedTitle) {
      return next(createError(400, 'Title is required'));
    }

    normalizedArtist = normalizeText(artist);
    const normalizedAlbum = normalizeText(album);

    const normalizedCapo = normalizeCapo(capo);

    const normalizedDuration = normalizeDurationSeconds(durationSeconds);

    const normalizedLanguage = normalizeLanguage(language);
    const normalizedBpm = normalizeInt(bpm, { min: 1, max: 1000 });
    const normalizedPitch = normalizeInt(pitchStandard, { min: 380, max: 500 });

    const song = await Song.create({
      userUid: userId,
      title: normalizedTitle,
      bpm: normalizedBpm !== undefined ? normalizedBpm : null,
      durationSeconds: normalizedDuration !== undefined ? normalizedDuration : null,
      key,
      capo: normalizedCapo !== undefined ? normalizedCapo : null,
      notes,
      instrument,
      instrumentLinks,
      instrumentDifficulty,
      instrumentTuning,
      artist: normalizedArtist !== undefined ? normalizedArtist : null,
      album: normalizedAlbum !== undefined ? normalizedAlbum : null,
      language: normalizedLanguage !== undefined ? normalizedLanguage : null,
      genre,
      // undefined (absent) -> the column default (440); a present-but-invalid value
      // folds to null (reject-to-null); a valid value is kept. Mirrors the old bare
      // `pitchStandard` shorthand, now normalized (story 19.8).
      pitchStandard: normalizedPitch,
      technique,
      myInstrumentUid,
      lastPlayed: lastPlayed ? new Date(lastPlayed) : null,
      streamingLinks,
      timeSignature,
      mode: normalizeMode(mode) ?? null // canonical casing so the Mode select matches (21.x)
    });

    res.status(201).json(song);
  } catch (error) {
    // Story 17.1: a duplicate (title, artist) for this user -> typed 409, not 500.
    if (await respondDuplicateSong(res, error, req.session.user, normalizedTitle, normalizedArtist).catch(() => false)) {
      return;
    }
    logger.error('Error creating song:', error);
    next(createError(500, 'Error creating song'));
  }
};

// PUT update song
const updateSong = async (req, res, next) => {
  // Hoisted so the catch can map a duplicate-key error to a typed 409 (story 17.1),
  // using the values that WOULD have been persisted (trimmed, with the existing
  // song as fallback when a field is absent from the payload).
  let song;
  let normalizedTitle;
  let normalizedArtist;
  let userId;
  try {
    userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    // Scoped lookup (story 7.5): not-found and not-yours both 404 — no ownership 403.
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Song not found'));
    }
    song = await Song.findOne({ where: { uid: req.params.uid, userUid: userId } });
    if (!song) {
      return next(createError(404, 'Song not found'));
    }

    const { title, bpm, durationSeconds, key, capo, notes, instrument, artist, album, language, genre, pitchStandard, instrumentTuning, technique, instrumentLinks, instrumentDifficulty, myInstrumentUid, lastPlayed, streamingLinks, timeSignature, mode } = req.body || {};

    normalizedTitle = normalizeText(title);
    normalizedArtist = normalizeText(artist);
    const normalizedAlbum = normalizeText(album);

    const normalizedCapo = normalizeCapo(capo);

    const normalizedDuration = normalizeDurationSeconds(durationSeconds);

    const normalizedLanguage = normalizeLanguage(language);
    const normalizedBpm = normalizeInt(bpm, { min: 1, max: 1000 });
    const normalizedPitch = normalizeInt(pitchStandard, { min: 380, max: 500 });
    const normalizedMode = normalizeMode(mode); // undefined = absent (partial PUT) → keep existing

    await song.update({
      // normalizeText -> undefined (absent) / null (whitespace-only) / trimmed
      // string. `||` keeps the existing title for both undefined and null,
      // preserving the old `title || song.title` semantics on the trimmed value.
      title: normalizedTitle || song.title,
      bpm: normalizedBpm !== undefined ? normalizedBpm : song.bpm,
      durationSeconds: normalizedDuration !== undefined ? normalizedDuration : song.durationSeconds,
      key: key !== undefined ? key : song.key,
      capo: normalizedCapo !== undefined ? normalizedCapo : song.capo,
      notes: notes !== undefined ? notes : song.notes,
      instrument: instrument !== undefined ? instrument : song.instrument,
      artist: normalizedArtist !== undefined ? normalizedArtist : song.artist,
      album: normalizedAlbum !== undefined ? normalizedAlbum : song.album,
      language: normalizedLanguage !== undefined ? normalizedLanguage : song.language,
      genre: genre !== undefined ? genre : song.genre,
      pitchStandard: normalizedPitch !== undefined ? normalizedPitch : song.pitchStandard,
      instrumentTuning: instrumentTuning !== undefined ? instrumentTuning : song.instrumentTuning,
      technique: technique !== undefined ? technique : song.technique,
      instrumentLinks: instrumentLinks !== undefined ? instrumentLinks : song.instrumentLinks,
      instrumentDifficulty: instrumentDifficulty !== undefined ? instrumentDifficulty : song.instrumentDifficulty,
      lastPlayed: lastPlayed ? new Date(lastPlayed) : song.lastPlayed,
      myInstrumentUid: myInstrumentUid !== undefined ? myInstrumentUid : song.myInstrumentUid,
      streamingLinks: streamingLinks !== undefined ? streamingLinks : song.streamingLinks,
      timeSignature: timeSignature !== undefined ? timeSignature : song.timeSignature,
      mode: normalizedMode !== undefined ? normalizedMode : song.mode
    });

    res.json(song);
  } catch (error) {
    // Story 17.1: an edit that collides with another of the user's songs on
    // (title, artist) -> typed 409, not 500. The effective values mirror the
    // update payload (trimmed, existing song as fallback), excluding this row.
    const effectiveTitle = normalizedTitle || (song && song.title);
    const effectiveArtist = normalizedArtist !== undefined ? normalizedArtist : (song && song.artist);
    if (
      effectiveTitle &&
      (await respondDuplicateSong(res, error, userId, effectiveTitle, effectiveArtist, req.params.uid).catch(() => false))
    ) {
      return;
    }
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

    // Scoped lookup (story 7.5): not-found and not-yours both 404 — no ownership 403.
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Song not found'));
    }
    const song = await Song.findOne({ where: { uid: req.params.uid, userUid: userId } });
    if (!song) {
      return next(createError(404, 'Song not found'));
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

    // Scoped lookup (story 7.5): not-found and not-yours both 404 — no ownership 403.
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Song not found'));
    }
    const song = await Song.findOne({ where: { uid: req.params.uid, userUid: userId } });
    if (!song) {
      return next(createError(404, 'Song not found'));
    }

    // A provided instrument reference must belong to the user (story 7.5): an
    // unowned/unknown instrumentUid is a 404, not silently persisted on the play.
    if (instrumentUid) {
      const ownedInstrument = await Instrument.findOne({ where: { uid: instrumentUid, userUid: userId } });
      if (!ownedInstrument) {
        return next(createError(404, 'Instrument not found'));
      }
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
            note: null,
          }, { transaction });
        }

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
        // Epic 8: the session total is no longer a stored field — it derives
        // from the entries' minutes (heatmap sums SessionItem.minutes). The
        // entry created/accrued above is all that's needed; nothing else to sync.
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

    // Scoped lookup (story 7.5): not-found and not-yours both 404 — no ownership 403.
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Song not found'));
    }
    const song = await Song.findOne({ where: { uid: req.params.uid, userUid: userId } });
    if (!song) {
      return next(createError(404, 'Song not found'));
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
  refreshSongFromCatalog,
  createSong,
  updateSong,
  deleteSong,
  markSongPlayed,
  getSongPlays,
  lookupSongMetadata,
};
