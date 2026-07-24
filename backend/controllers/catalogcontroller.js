// Catalog = SHARED data, read NOT scoped by userUid (architecture §3: a Catalog
// entry's existence is not confidential — it is readable by every logged-in user).
// Do NOT rescope reads by userUid, and do NOT turn the write 403 into a 404
// anti-oracle. Both are named, deliberate exceptions documented in project-context.md.
//
// Story 19.1 scope: curator write CRUD on catalog entries. Read (list/detail)
// endpoints land in story 19.3; "Add to my songlist" in story 19.4.
const { CatalogSong, Song, User, CatalogCollection, CatalogCollectionSong, Playlist, PlaylistSong } = require('../models');
const { Op, fn, col, where: whereFn } = require('sequelize');
const createError = require('http-errors');
const logger = require('../logger');
const { isUuid } = require('../utils/uuid');
// Story 19.8 — shared normalizers (bpm/pitchStandard reject-to-null on the INTEGER
// columns ; language title-cased like the Song form ; durationSeconds factored out).
const { normalizeInt, normalizeDurationSeconds, normalizeLanguage, normalizeMode } = require('../utils/normalize');

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
  if (out.bpm !== undefined) out.bpm = normalizeInt(out.bpm, { min: 1, max: 1000 });
  if (out.pitchStandard !== undefined) out.pitchStandard = normalizeInt(out.pitchStandard, { min: 380, max: 500 });
  if (out.language !== undefined) out.language = normalizeLanguage(out.language); // title-case parity with Song (19.8)
  if (out.mode !== undefined) out.mode = normalizeMode(out.mode); // canonical casing so copies' Mode select matches (21.x)
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
// Story 20.1: deleting an entry also removes it from every Collection — the
// CatalogCollectionSongs.catalog_song_uid FK is ON DELETE CASCADE, so entry.destroy()
// cascades the membership cleanup at the DB level (no code needed here). Hard cleanup,
// the opposite of Songs.sourceCatalogUid (soft, no FK).
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

// POST /api/catalog/:uid/publish (curator) — flip a draft to published (19.6).
// Idempotent (re-publishing keeps the original publishedAt). Uniqueness is GLOBAL (any
// duplicate is already rejected at create/rename time), so this update cannot introduce
// a collision — the 23505→409 handler below is a harmless backstop, effectively unreachable.
const publishCatalogEntry = async (req, res, next) => {
  let entry;
  try {
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Catalog entry not found'));
    }
    entry = await CatalogSong.findByPk(req.params.uid);
    if (!entry) {
      return next(createError(404, 'Catalog entry not found'));
    }
    if (!normalizeText(entry.title)) {
      return next(createError(400, 'Title is required'));
    }
    const updated = await entry.update({ publishedAt: entry.publishedAt || new Date() });
    res.json(updated);
  } catch (error) {
    if (await respondDuplicateCatalogEntry(res, error, entry && entry.title, entry && entry.artist, req.params.uid).catch(() => false)) {
      return;
    }
    logger.error('Error publishing catalog entry:', error);
    next(createError(500, 'Error publishing catalog entry'));
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

// Is the requester a curator? Looks up the session user's isCurator. Called LAZILY —
// only on the draft-aware paths (?includeDrafts, or accessing a draft by uid) — so
// normal public reads pay no extra query. Story 19.6.
async function isRequestCurator(req) {
  const userId = req.session && req.session.user;
  if (!userId) return false;
  const user = await User.findByPk(userId).catch(() => null);
  return !!(user && user.isCurator === true);
}

const getCatalogList = async (req, res, next) => {
  try {
    const q = req.query || {};
    const limit = clampInt(q.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
    const page = clampInt(q.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const offset = (page - 1) * limit;
    const order = SORT_WHITELIST[q.sort] || SORT_WHITELIST.artist;

    const and = [];
    // Intrinsic filters (facet multi-select), combined with AND across dimensions.
    // Each param is a comma-separated list of EXACT values (chosen from the facet
    // endpoint → no case mismatch). No instrument filters (DL-17).
    const parseList = (v) => (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : []);
    const keys = parseList(q.key);
    if (keys.length) and.push({ key: { [Op.in]: keys } });
    const modes = parseList(q.mode);
    if (modes.length) and.push({ mode: { [Op.in]: modes } });
    const times = parseList(q.timeSignature);
    if (times.length) and.push({ timeSignature: { [Op.in]: times } });
    const genres = parseList(q.genre);
    // Multi-genre = match ANY selected genre (OR of JSONB @> single-element).
    if (genres.length) and.push({ [Op.or]: genres.map(g => ({ genre: { [Op.contains]: [g] } })) });
    const search = typeof q.search === 'string' ? q.search.trim() : '';
    if (search) {
      // Escape LIKE metacharacters so a user typing %/_/\ searches for them LITERALLY
      // (Postgres' default LIKE escape is backslash). Prevents "50%" from matching
      // everything or "a_c" from matching "abc".
      const escaped = search.replace(/[\\%_]/g, '\\$&');
      const pattern = `%${escaped}%`;
      and.push({ [Op.or]: [foldedLike('title', pattern), foldedLike('artist', pattern)] });
    }
    // Draft/publish scoping (19.6): browse shows PUBLISHED only. A curator may pass
    // ?includeDrafts=1 (the manage hub) to also see drafts — honoured only if the
    // requester really is a curator, so a crafted query never leaks a draft.
    const includeDrafts = q.includeDrafts === '1' && (await isRequestCurator(req));
    if (!includeDrafts) and.push({ publishedAt: { [Op.not]: null } });
    const where = and.length ? { [Op.and]: and } : undefined;

    // findAndCountAll: `count` is the FILTERED total (what the client paginates over).
    const { rows, count } = await CatalogSong.findAndCountAll({ where, order, limit, offset });
    res.json({ items: rows, total: count, page, limit });
  } catch (error) {
    logger.error('Error listing catalog:', error);
    next(createError(500, 'Error listing catalog'));
  }
};

// GET /api/catalog/facets — the distinct filterable values PRESENT in the whole
// Catalog, to populate the browse facet pills. Server-side because the client is
// paginated (it never holds all entries). Non-scoped (shared data, §3), auth only.
const getCatalogFacets = async (req, res, next) => {
  try {
    const sequelize = CatalogSong.sequelize;
    // A curator form may pass ?includeDrafts=1 so the artist/album autocomplete offers
    // DRAFT values too; the public browse never passes it → published-only. Gated on
    // isCurator so a crafted query never surfaces a draft's values. `pub` is a literal
    // (no user input) → no injection.
    const includeDrafts = (req.query || {}).includeDrafts === '1' && (await isRequestCurator(req));
    const pub = includeDrafts ? '' : 'AND published_at IS NOT NULL';
    const scalar = async (column) => {
      const rows = await sequelize.query(
        `SELECT DISTINCT "${column}" AS v FROM "CatalogSongs" WHERE "${column}" IS NOT NULL AND "${column}" <> '' ${pub} ORDER BY v`,
        { type: sequelize.QueryTypes.SELECT }
      );
      return rows.map(r => r.v);
    };
    const genreRows = await sequelize.query(
      `SELECT DISTINCT jsonb_array_elements_text(genre) AS v FROM "CatalogSongs" WHERE genre IS NOT NULL AND jsonb_typeof(genre) = 'array' ${pub} ORDER BY v`,
      { type: sequelize.QueryTypes.SELECT }
    );
    // artist/album distinct values feed the curator form's autocomplete (19.6 QA).
    const [key, mode, timeSignature, artist, album] = await Promise.all([
      scalar('key'), scalar('mode'), scalar('time_signature'), scalar('artist'), scalar('album'),
    ]);
    res.json({ genre: genreRows.map(r => r.v), key, mode, timeSignature, artist, album });
  } catch (error) {
    logger.error('Error building catalog facets:', error);
    next(createError(500, 'Error building catalog facets'));
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
    // Draft (19.6): a curator sees it (to edit via /catalog/admin/:uid); anyone else
    // gets the same calm 404 — a draft must not be discoverable by guessing its uid.
    if (entry.publishedAt == null && !(await isRequestCurator(req))) {
      return next(createError(404, 'Catalog entry not found'));
    }
    res.json(entry); // entité brute (convention normale ; l'enveloppe est réservée à la liste)
  } catch (error) {
    logger.error('Error fetching catalog entry:', error);
    next(createError(500, 'Error fetching catalog entry'));
  }
};

// ---- Story 19.4: Add to my songlist (snapshot + provenance) ----

// The intrinsic columns copied 1:1 from a CatalogSong into a personal Song. The
// JSON ones (language/genre/streamingLinks) are DEEP-CLONED so the shared entry
// and the personal copy never share a reference. Personal/instrument fields are
// left at their defaults (blank).
function buildSongFromCatalog(catalog, userUid) {
  return {
    userUid,
    sourceCatalogUid: catalog.uid, // soft provenance pointer (no FK)
    sourceCatalogSyncedAt: catalog.updatedAt, // story 21.1: version stamp for drift detection
    title: catalog.title,
    artist: catalog.artist ?? null,
    album: catalog.album ?? null,
    key: catalog.key ?? null,
    bpm: catalog.bpm ?? null,
    mode: catalog.mode ?? null,
    timeSignature: catalog.timeSignature ?? null,
    durationSeconds: catalog.durationSeconds ?? null,
    language: structuredClone(catalog.language ?? null),
    genre: structuredClone(catalog.genre ?? null),
    streamingLinks: structuredClone(catalog.streamingLinks ?? null),
    pitchStandard: catalog.pitchStandard ?? null,
    lastPlayed: null, // never copied — a copy has no practice history
  };
}

// Per-user existing song on the SAME folded key as the Epic 17 unique index
// (user_uid, lower(title), COALESCE(lower(artist), '')). Scoped by userUid → no
// cross-user existence oracle. Replicated from songcontroller (additive strict).
function findExistingUserSong(userUid, title, artist) {
  const foldedTitle = whereFn(fn('lower', col('title')), String(title == null ? '' : title).toLowerCase());
  const foldedArtist = whereFn(fn('coalesce', fn('lower', col('artist')), ''), artist ? String(artist).toLowerCase() : '');
  return Song.findOne({ where: { [Op.and]: [{ userUid }, foldedTitle, foldedArtist] } });
}

// POST /api/catalog/:uid/add-to-songlist — copy a Catalog entry into the user's
// Songlist. Auth only (it writes the USER's own songlist, not the Catalog).
const addToSonglist = async (req, res, next) => {
  // Hoisted so the 409 catch reuses the already-fetched entry (no refetch) and can
  // look up the existing Song by its title/artist even under a concurrent delete.
  let catalog = null;
  try {
    const userId = req.session && req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Catalog entry not found'));
    }
    catalog = await CatalogSong.findByPk(req.params.uid);
    if (!catalog || catalog.publishedAt == null) {
      // Drafts are not public (19.6) → can't be copied, even by guessing the uid.
      return next(createError(404, 'Catalog entry not found'));
    }

    const song = await Song.create(buildSongFromCatalog(catalog, userId));
    res.status(201).json(song);
  } catch (error) {
    // Per-user duplicate (Epic 17 index, 23505) → typed 409 the front reads as
    // "Already in your songlist" + points at the existing Song. Same shape as
    // songcontroller.createSong. Uses the hoisted `catalog` (folded lookup matches
    // the index that just fired, so `existing` is found → the badge stays clickable).
    if (error && error.name === 'SequelizeUniqueConstraintError' && catalog) {
      const existing = await findExistingUserSong(req.session.user, catalog.title, catalog.artist).catch(() => null);
      return res.status(409).json({
        error: 'duplicate_song',
        message: 'A song with this title and artist already exists',
        song: existing,
      });
    }
    logger.error('Error adding catalog entry to songlist:', error);
    next(createError(500, 'Error adding to songlist'));
  }
};

// GET /api/catalog/exists?title=&artist=&excludeUid= (curator, story 19.12) — EXACT
// folded (title, artist) existence check, reusing the SAME lookup as the 409
// (findExistingByTitleArtist: no publishedAt scope → sees drafts AND published). It
// replaces the front's best-effort substring+limit-10 dup-check (19.6). Curator-only:
// it reveals whether a (possibly draft) entry exists. `excludeUid` skips the row being
// edited (rename). Never a mutation → fail-open on the front; the GLOBAL unique index
// 409 stays the real backstop at save time.
const getCatalogExists = async (req, res, next) => {
  try {
    const title = normalizeText(req.query.title);
    if (!title) {
      return res.json({ exists: false, entry: null }); // uniform shape (review 19.12)
    }
    const artist = normalizeText(req.query.artist);
    const excludeUid = req.query.excludeUid && isUuid(req.query.excludeUid) ? req.query.excludeUid : undefined;
    const entry = await findExistingByTitleArtist(title, artist, excludeUid);
    res.json({ exists: Boolean(entry), entry: entry || null });
  } catch (error) {
    logger.error('Error checking catalog existence:', error);
    next(createError(500, 'Error checking catalog existence'));
  }
};

// ---- Story 20.1: Catalog Collections (curated themed groupings) ----
// SHARED data like catalog entries (§3): reads are non-scoped (auth only); writes are
// curator-only (requireCurator -> 403, wired on the routes). A Collection groups catalog
// entries via the CatalogCollectionSongs join; the front browse/import lands in 20.3/20.4.

// Filter applied to a Collection's member entries so a DRAFT entry (publishedAt IS NULL,
// story 19.6) never leaks through a Collection to a non-curator. Curators see drafts too.
// Returned as an include-where; paired with required:false so a Collection whose only
// members are drafts still returns (with an empty songs list) instead of vanishing.
function memberSongInclude(includeDrafts, extra = {}) {
  const include = {
    model: CatalogSong,
    as: 'songs',
    through: { attributes: [] }, // hide the join row from the payload
    required: false,
    ...extra, // e.g. { attributes: ['uid'] } when we only need to count members
  };
  if (!includeDrafts) include.where = { publishedAt: { [Op.not]: null } };
  return include;
}

// POST /api/catalog/collections (curator) — create a Collection.
const createCollection = async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = normalizeText(body.name);
    if (!name) {
      return next(createError(400, 'Name is required'));
    }
    const description = normalizeText(body.description);
    const collection = await CatalogCollection.create({
      name,
      description: description !== undefined ? description : null,
    });
    res.status(201).json(collection);
  } catch (error) {
    logger.error('Error creating collection:', error);
    next(createError(500, 'Error creating collection'));
  }
};

// PUT /api/catalog/collections/:uid (curator) — rename / re-describe.
const updateCollection = async (req, res, next) => {
  try {
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Collection not found'));
    }
    const collection = await CatalogCollection.findByPk(req.params.uid);
    if (!collection) {
      return next(createError(404, 'Collection not found'));
    }
    const body = req.body || {};
    const updates = {};
    const name = normalizeText(body.name);
    if (name !== undefined) {
      if (!name) {
        return next(createError(400, 'Name is required'));
      }
      updates.name = name;
    }
    const description = normalizeText(body.description);
    if (description !== undefined) updates.description = description;
    const updated = await collection.update(updates);
    res.json(updated);
  } catch (error) {
    logger.error('Error updating collection:', error);
    next(createError(500, 'Error updating collection'));
  }
};

// DELETE /api/catalog/collections/:uid (curator). FK CASCADE on collection_uid removes
// the membership rows; the referenced catalog entries are untouched.
const deleteCollection = async (req, res, next) => {
  try {
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Collection not found'));
    }
    const collection = await CatalogCollection.findByPk(req.params.uid);
    if (!collection) {
      return next(createError(404, 'Collection not found'));
    }
    await collection.destroy();
    res.json({ message: 'Collection deleted' });
  } catch (error) {
    logger.error('Error deleting collection:', error);
    next(createError(500, 'Error deleting collection'));
  }
};

// POST /api/catalog/collections/:uid/songs (curator) — add an entry to the Collection.
// Body: { catalogSongUid }. Idempotent via findOrCreate against the composite unique
// (collection_uid, catalog_song_uid): re-adding is a 200 no-op, never a 500. An entry
// may belong to many Collections (multi-appartenance, FR-12).
const addSongToCollection = async (req, res, next) => {
  try {
    const collectionUid = req.params.uid;
    const catalogSongUid = (req.body || {}).catalogSongUid;
    if (!isUuid(collectionUid) || !isUuid(catalogSongUid)) {
      return next(createError(404, 'Collection or catalog entry not found'));
    }
    const collection = await CatalogCollection.findByPk(collectionUid);
    if (!collection) {
      return next(createError(404, 'Collection not found'));
    }
    const song = await CatalogSong.findByPk(catalogSongUid);
    if (!song) {
      return next(createError(404, 'Catalog entry not found'));
    }
    const [, created] = await CatalogCollectionSong.findOrCreate({
      where: { collectionUid, catalogSongUid },
      defaults: { collectionUid, catalogSongUid },
    });
    res.status(created ? 201 : 200).json({
      message: created ? 'Added to collection' : 'Already in collection',
    });
  } catch (error) {
    logger.error('Error adding entry to collection:', error);
    next(createError(500, 'Error adding to collection'));
  }
};

// DELETE /api/catalog/collections/:uid/songs/:catalogSongUid (curator) — remove an
// entry from the Collection. Idempotent (removing an absent link is not an error).
const removeSongFromCollection = async (req, res, next) => {
  try {
    const collectionUid = req.params.uid;
    const catalogSongUid = req.params.catalogSongUid;
    if (!isUuid(collectionUid) || !isUuid(catalogSongUid)) {
      return next(createError(404, 'Collection or catalog entry not found'));
    }
    await CatalogCollectionSong.destroy({ where: { collectionUid, catalogSongUid } });
    res.json({ message: 'Removed from collection' });
  } catch (error) {
    logger.error('Error removing entry from collection:', error);
    next(createError(500, 'Error removing from collection'));
  }
};

// GET /api/catalog/collections — list { uid, name, description, songCount }. Non-scoped
// (§3, auth only). songCount reflects PUBLISHED members only for non-curators (draft
// safety, AC #7); a curator sees the full count.
const getCollections = async (req, res, next) => {
  try {
    const includeDrafts = await isRequestCurator(req);
    // Only the member COUNT is needed here -> load just uid (not the full rows).
    const collections = await CatalogCollection.findAll({
      include: [memberSongInclude(includeDrafts, { attributes: ['uid'] })],
      order: [['name', 'ASC'], ['uid', 'ASC']],
    });
    res.json(collections.map((c) => ({
      uid: c.uid,
      name: c.name,
      description: c.description,
      songCount: (c.songs || []).length,
    })));
  } catch (error) {
    logger.error('Error listing collections:', error);
    next(createError(500, 'Error listing collections'));
  }
};

// GET /api/catalog/collections/:uid — detail + member entries. Unknown/invalid uid ->
// calm 404 (same posture as getCatalogEntry). Draft members hidden from non-curators.
const getCollection = async (req, res, next) => {
  try {
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Collection not found'));
    }
    const includeDrafts = await isRequestCurator(req);
    const collection = await CatalogCollection.findByPk(req.params.uid, {
      include: [memberSongInclude(includeDrafts)],
    });
    if (!collection) {
      return next(createError(404, 'Collection not found'));
    }
    res.json(collection);
  } catch (error) {
    logger.error('Error fetching collection:', error);
    next(createError(500, 'Error fetching collection'));
  }
};

// ---- Story 20.3: Import a Collection into the Songlist (best-effort, non-atomic) ----

// Create the mirror Playlist named after the Collection, or reuse the user's existing
// one with that name (case-insensitive lower(name), Epic 10 index
// playlists_user_uid_name_ci). Mirror of playlistcontroller.createPlaylist's 23505 path.
async function resolveMirrorPlaylist(userId, name) {
  try {
    return await Playlist.create({ userUid: userId, name, description: null });
  } catch (error) {
    if (error && error.name === 'SequelizeUniqueConstraintError') {
      const foldedName = whereFn(fn('lower', col('name')), String(name == null ? '' : name).trim().toLowerCase());
      const existing = await Playlist.findOne({ where: { [Op.and]: [{ userUid: userId }, foldedName] } });
      if (existing) return existing;
    }
    throw error; // non-unique failure, or a conflict we somehow can't resolve
  }
}

// POST /api/catalog/collections/:uid/add-to-songlist — import a Collection's PUBLISHED
// entries into the user's Songlist + a mirror Playlist named after the Collection.
// Auth only (writes the USER's own songlist/playlist, NOT the Catalog). BEST-EFFORT,
// NON-ATOMIC by design (epics.md § Epic 20): each entry is an autonomous unit, there is
// deliberately NO enclosing transaction, and one entry failing must not abort the batch.
const importCollectionToSonglist = async (req, res, next) => {
  try {
    const userId = req.session && req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Collection not found'));
    }
    // Published members only — a draft is not public (19.6) and 19.4 refuses to copy it.
    // Full attributes (default) are needed for buildSongFromCatalog.
    const collection = await CatalogCollection.findByPk(req.params.uid, {
      include: [memberSongInclude(false)],
    });
    if (!collection) {
      return next(createError(404, 'Collection not found'));
    }
    const members = collection.songs || [];

    // Mirror personal Playlist named after the Collection (created or reused).
    const playlist = await resolveMirrorPlaylist(userId, collection.name);

    let added = 0;
    let skipped = 0;
    let failed = 0;
    const songUidsToAttach = [];

    // NO transaction here — best-effort. A per-entry failure increments `failed` and the
    // loop continues (the whole point of the story; do not "fix" by wrapping this).
    for (const entry of members) {
      try {
        const song = await Song.create(buildSongFromCatalog(entry, userId));
        songUidsToAttach.push(song.uid);
        added += 1;
      } catch (error) {
        if (error && error.name === 'SequelizeUniqueConstraintError') {
          // Already in the user's Songlist (Epic 17 index) — skip the insert but still
          // attach the existing Song to the mirror playlist.
          const existing = await findExistingUserSong(userId, entry.title, entry.artist).catch(() => null);
          if (existing) {
            songUidsToAttach.push(existing.uid);
            skipped += 1;
          } else {
            failed += 1; // 23505 but the existing row couldn't be resolved (concurrent delete)
          }
        } else {
          logger.error('Import: failed to copy a catalog entry', { collectionUid: collection.uid });
          failed += 1;
        }
      }
    }

    // Attach every copied/existing song to the mirror playlist, idempotently on the
    // composite unique (playlist_uid, song_uid). ADDITIVE — never wipes existing rows
    // (do NOT reuse playlistcontroller.syncPlaylistSongs: transactional destroy+rebuild).
    let position = await PlaylistSong.count({ where: { playlistUid: playlist.uid } });
    for (const songUid of songUidsToAttach) {
      try {
        const [, created] = await PlaylistSong.findOrCreate({
          where: { playlistUid: playlist.uid, songUid },
          defaults: { playlistUid: playlist.uid, songUid, position },
        });
        if (created) position += 1;
      } catch (attachError) {
        // Best-effort attach too: a transient error, or a findOrCreate unique race on
        // (playlist_uid, song_uid) under a concurrent import (double-click), must NOT
        // abort the whole import — the song is already in the Songlist. Log and continue;
        // a re-import is idempotent and will (re)attach it.
        logger.error('Import: failed to attach a song to the mirror playlist', { playlistUid: playlist.uid });
      }
    }

    res.json({ added, skipped, failed, playlistUid: playlist.uid });
  } catch (error) {
    logger.error('Error importing collection to songlist:', error);
    next(createError(500, 'Error importing collection'));
  }
};

module.exports = {
  createCatalogEntry,
  updateCatalogEntry,
  deleteCatalogEntry,
  publishCatalogEntry,
  getCatalogList,
  getCatalogFacets,
  getCatalogEntry,
  getCatalogExists,
  addToSonglist,
  // Story 20.1 — Collections
  createCollection,
  updateCollection,
  deleteCollection,
  addSongToCollection,
  removeSongFromCollection,
  getCollections,
  getCollection,
  // Story 20.3 — import
  importCollectionToSonglist,
};
