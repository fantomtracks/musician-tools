// Catalog = SHARED data, read NOT scoped by userUid (architecture §3: a Catalog
// entry's existence is not confidential — it is readable by every logged-in user).
// Do NOT rescope reads by userUid, and do NOT turn the write 403 into a 404
// anti-oracle. Both are named, deliberate exceptions documented in project-context.md.
//
// Story 19.1 scope: curator write CRUD on catalog entries. Read (list/detail)
// endpoints land in story 19.3; "Add to my songlist" in story 19.4.
const { CatalogSong } = require('../models');
const { Op, fn, col, where: whereFn } = require('sequelize');
const createError = require('http-errors');
const logger = require('../logger');
const { isUuid } = require('../utils/uuid');

// Trim a free-text field before persisting (title/artist/album). undefined = field
// absent from the payload -> leave it untouched on update. Whitespace-only -> null.
// Non-string left as-is so the required-title check still fails on a falsy title.
// Replicated from songcontroller (additive strict: we do not import/modify it).
const normalizeText = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

// Story 19.1 review: coerce durationSeconds like songcontroller.normalizeDurationSeconds
// (whole seconds, 1..86400). undefined = field absent (leave untouched on update);
// out-of-range / non-integer -> cleared (null) rather than a 500 from the INTEGER
// column or a negative duration silently copied 1:1 into personal songlists (19.4).
const normalizeDurationSeconds = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 86400) return null;
  return parsed;
};

// The intrinsic subset copied 1:1 from CatalogSong to a personal Song (story 19.4).
// Instrument/personal fields are NOT part of the Catalog (decision DL-17).
const INTRINSIC_FIELDS = [
  'key', 'bpm', 'mode', 'timeSignature', 'durationSeconds',
  'language', 'genre', 'streamingLinks', 'pitchStandard'
];

// Look up the existing catalog entry that collides with (title, artist) on the
// SAME folded key as the GLOBAL unique index — lower(title) + COALESCE(lower(artist), '').
// No userUid (the Catalog is global). title/artist are already trimmed. excludeUid
// skips the row being edited (update/rename).
function findExistingByTitleArtist(title, artist, excludeUid) {
  const foldedTitle = whereFn(fn('lower', col('title')), String(title == null ? '' : title).toLowerCase());
  const foldedArtist = whereFn(
    fn('coalesce', fn('lower', col('artist')), ''),
    artist ? String(artist).toLowerCase() : ''
  );
  const and = [foldedTitle, foldedArtist];
  if (excludeUid) and.push({ uid: { [Op.ne]: excludeUid } });
  return CatalogSong.findOne({ where: { [Op.and]: and } });
}

// Map a unique-constraint violation (23505 -> SequelizeUniqueConstraintError, from
// the GLOBAL functional index catalog_songs_title_artist_ci) to a typed 409 the
// front can parse, best-effort attaching the existing entry. Never throws (a failed
// lookup still yields the 409 with entry: null). Returns true if it handled it.
// Mirror of songcontroller.respondDuplicateSong but GLOBAL (no userUid).
async function respondDuplicateCatalogEntry(res, error, title, artist, excludeUid) {
  if (!error || error.name !== 'SequelizeUniqueConstraintError') return false;
  const entry = await findExistingByTitleArtist(title, artist, excludeUid).catch(() => null);
  res.status(409).json({
    error: 'duplicate_catalog_entry',
    message: 'A catalog entry with this title and artist already exists',
    entry,
  });
  return true;
}

// Pick the intrinsic fields present in the payload into a create/update object.
function pickIntrinsic(body) {
  const out = {};
  for (const f of INTRINSIC_FIELDS) {
    if (body[f] !== undefined) out[f] = body[f];
  }
  if (out.durationSeconds !== undefined) out.durationSeconds = normalizeDurationSeconds(out.durationSeconds);
  return out;
}

// POST /api/catalog (curator) — create a catalog entry.
const createCatalogEntry = async (req, res, next) => {
  let normalizedTitle;
  let normalizedArtist;
  try {
    const body = req.body || {};
    normalizedTitle = normalizeText(body.title);
    if (!normalizedTitle) {
      return next(createError(400, 'Title is required'));
    }
    normalizedArtist = normalizeText(body.artist);
    const normalizedAlbum = normalizeText(body.album);

    const entry = await CatalogSong.create({
      title: normalizedTitle,
      artist: normalizedArtist !== undefined ? normalizedArtist : null,
      album: normalizedAlbum !== undefined ? normalizedAlbum : null,
      ...pickIntrinsic(body),
    });

    res.status(201).json(entry);
  } catch (error) {
    if (await respondDuplicateCatalogEntry(res, error, normalizedTitle, normalizedArtist).catch(() => false)) {
      return;
    }
    logger.error('Error creating catalog entry:', error);
    next(createError(500, 'Error creating catalog entry'));
  }
};

// PUT /api/catalog/:uid (curator) — edit IN PLACE (uid preserved; never delete+recreate).
const updateCatalogEntry = async (req, res, next) => {
  let normalizedTitle;
  let normalizedArtist;
  // Hoisted so the catch can fall back to the current row's title/artist when the
  // PUT is partial (mirrors songcontroller's effectiveTitle) — else a rename that
  // keeps the title and only changes the artist folds the lookup to '' and loses
  // the conflicting entry in the 409 body.
  let entry;
  try {
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Catalog entry not found'));
    }
    entry = await CatalogSong.findByPk(req.params.uid);
    if (!entry) {
      return next(createError(404, 'Catalog entry not found'));
    }

    const body = req.body || {};
    const updates = pickIntrinsic(body);

    normalizedTitle = normalizeText(body.title);
    if (normalizedTitle !== undefined) {
      if (!normalizedTitle) {
        return next(createError(400, 'Title is required'));
      }
      updates.title = normalizedTitle;
    }
    normalizedArtist = normalizeText(body.artist);
    if (normalizedArtist !== undefined) updates.artist = normalizedArtist;
    const normalizedAlbum = normalizeText(body.album);
    if (normalizedAlbum !== undefined) updates.album = normalizedAlbum;

    const updated = await entry.update(updates);
    res.json(updated);
  } catch (error) {
    // On a rename collision the lookup uses the ATTEMPTED values, excluding self;
    // when a field is absent from the PUT, fall back to the CURRENT row (entry) so
    // a partial rename (e.g. artist only) still points at the conflicting entry.
    const lookupTitle = normalizedTitle !== undefined ? normalizedTitle : (entry && entry.title);
    const lookupArtist = normalizedArtist !== undefined ? normalizedArtist : (entry ? entry.artist : undefined);
    if (await respondDuplicateCatalogEntry(res, error, lookupTitle, lookupArtist, req.params.uid).catch(() => false)) {
      return;
    }
    logger.error('Error updating catalog entry:', error);
    next(createError(500, 'Error updating catalog entry'));
  }
};

// DELETE /api/catalog/:uid (curator).
const deleteCatalogEntry = async (req, res, next) => {
  try {
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Catalog entry not found'));
    }
    const entry = await CatalogSong.findByPk(req.params.uid);
    if (!entry) {
      return next(createError(404, 'Catalog entry not found'));
    }
    await entry.destroy();
    res.json({ message: 'Catalog entry deleted' });
  } catch (error) {
    logger.error('Error deleting catalog entry:', error);
    next(createError(500, 'Error deleting catalog entry'));
  }
};

// ---- Story 19.3: READ endpoints (list + detail) ----
// SHARED read — NOT scoped by userUid (principle §3, project-context.md). A Catalog
// entry is readable by every logged-in user; do NOT add userUid to the where.

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

// Whitelisted sort keys -> ORDER BY. Every option ends with `uid` (unique tiebreaker)
// so LIMIT/OFFSET pages never duplicate or skip a row. An unknown/absent sort falls
// back to artist->title (default). This closes the ORDER BY injection vector.
const SORT_WHITELIST = {
  artist: [['artist', 'ASC'], ['title', 'ASC'], ['uid', 'ASC']],
  title: [['title', 'ASC'], ['artist', 'ASC'], ['uid', 'ASC']],
  bpm: [['bpm', 'ASC'], ['artist', 'ASC'], ['title', 'ASC'], ['uid', 'ASC']],
  recent: [['createdAt', 'DESC'], ['artist', 'ASC'], ['title', 'ASC'], ['uid', 'ASC']],
};

function clampInt(value, def, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

// Accent- AND case-insensitive substring match on a text column, reusing the
// IMMUTABLE f_unaccent wrapper (topics migration 20260625, already in prod). This
// is a DIFFERENT normalization from the canonical key (case-only, accents kept).
function foldedLike(column, pattern) {
  return whereFn(
    fn('lower', fn('f_unaccent', col(column))),
    { [Op.like]: fn('lower', fn('f_unaccent', pattern)) }
  );
}

const getCatalogList = async (req, res, next) => {
  try {
    const q = req.query || {};
    const limit = clampInt(q.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
    const page = clampInt(q.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const offset = (page - 1) * limit;
    const order = SORT_WHITELIST[q.sort] || SORT_WHITELIST.artist;

    const and = [];
    // Intrinsic filters (equality), combined with AND. No instrument filters (DL-17).
    if (q.key) and.push({ key: q.key });
    if (q.mode) and.push({ mode: q.mode });
    if (q.timeSignature) and.push({ timeSignature: q.timeSignature });
    if (q.genre) and.push({ genre: { [Op.contains]: [q.genre] } }); // JSONB array @>
    const search = typeof q.search === 'string' ? q.search.trim() : '';
    if (search) {
      // Escape LIKE metacharacters so a user typing %/_/\ searches for them LITERALLY
      // (Postgres' default LIKE escape is backslash). Prevents "50%" from matching
      // everything or "a_c" from matching "abc".
      const escaped = search.replace(/[\\%_]/g, '\\$&');
      const pattern = `%${escaped}%`;
      and.push({ [Op.or]: [foldedLike('title', pattern), foldedLike('artist', pattern)] });
    }
    const where = and.length ? { [Op.and]: and } : undefined;

    // findAndCountAll: `count` is the FILTERED total (what the client paginates over).
    const { rows, count } = await CatalogSong.findAndCountAll({ where, order, limit, offset });
    res.json({ items: rows, total: count, page, limit });
  } catch (error) {
    logger.error('Error listing catalog:', error);
    next(createError(500, 'Error listing catalog'));
  }
};

const getCatalogEntry = async (req, res, next) => {
  try {
    // 404 calme (deep-link périmé) : uid inconnu OU invalide → même 404. Pas d'oracle
    // (la fiche est de toute façon publique-aux-connectés), juste un not-found propre.
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Catalog entry not found'));
    }
    const entry = await CatalogSong.findByPk(req.params.uid);
    if (!entry) {
      return next(createError(404, 'Catalog entry not found'));
    }
    res.json(entry); // entité brute (convention normale ; l'enveloppe est réservée à la liste)
  } catch (error) {
    logger.error('Error fetching catalog entry:', error);
    next(createError(500, 'Error fetching catalog entry'));
  }
};

module.exports = {
  createCatalogEntry,
  updateCatalogEntry,
  deleteCatalogEntry,
  getCatalogList,
  getCatalogEntry,
};
