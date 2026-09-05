'use strict';

// MusicBrainz artist search + ListenBrainz popularity for Catalog browse.
// Official MB contract: https://musicbrainz.org/doc/MusicBrainz_API
// Popularity: https://listenbrainz.readthedocs.io/en/latest/users/api/popularity.html
// MB rate limit: 1 req/s/IP — faster traffic is all declined with 503.
// User-Agent must identify the app + a contact URL (anonymous agents are throttled).

const logger = require('../logger');
const pkg = require('../package.json');

const MB_ROOT = 'https://musicbrainz.org/ws/2';
const LB_ROOT = 'https://api.listenbrainz.org/1';
const SEARCH_LIMIT = 8;
const POPULAR_MAX = 100;
const CACHE_TTL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 20000;
const MIN_INTERVAL_MS = process.env.NODE_ENV === 'test' ? 0 : 1000;
const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const contact = String(process.env.APP_BASE_URL || 'https://northwood.dev').replace(/\/+$/, '');
const USER_AGENT = `MusicianTools/${pkg.version} ( ${contact} )`;

function isMbid(value) {
  return typeof value === 'string' && MBID_RE.test(value);
}

// Lucene specials (https://musicbrainz.org/doc/MusicBrainz_API/Search). Escaped
// in the user string BEFORE URL-encoding the whole query.
function escapeLucene(input) {
  return String(input).replace(/([+\-!(){}[\]^"~*?:\\/|&])/g, '\\$1');
}

function artistQuery(raw) {
  return `artist:(${escapeLucene(raw.trim())})`;
}

function recordingQuery(raw) {
  return `recording:(${escapeLucene(raw.trim())})`;
}

function artistFromCredit(credits) {
  if (!Array.isArray(credits) || credits.length === 0) return null;
  const joined = credits.map((c) => {
    const name = String((c && (c.name || (c.artist && c.artist.name))) || '').trim();
    const join = (c && c.joinphrase) ? String(c.joinphrase) : '';
    return name + join;
  }).join('').trim();
  return joined || null;
}

function albumFromReleases(releases) {
  if (!Array.isArray(releases) || releases.length === 0) return null;
  const official = releases.filter((r) => !r.status || r.status === 'Official');
  const pick = official[0] || releases[0];
  const title = pick && pick.title ? String(pick.title).trim() : '';
  return title || null;
}

function mapArtists(payload) {
  const list = payload && Array.isArray(payload.artists) ? payload.artists : [];
  const items = [];
  for (const a of list) {
    const name = a && a.name ? String(a.name).trim() : '';
    if (!name || !a.id) continue;
    items.push({ mbid: String(a.id), name });
  }
  return items;
}

// ListenBrainz already ranks by listen count. Keep that order, skip blanks,
// and fold duplicate title+artist rows (same song, different recording MBID).
function mapPopularRecordings(payload) {
  const list = Array.isArray(payload) ? payload
    : (payload && Array.isArray(payload.payload) ? payload.payload : []);
  const items = [];
  const seen = new Set();
  for (const row of list) {
    if (items.length >= POPULAR_MAX) break;
    const title = String((row && (row.recording_name || row.title)) || '').trim();
    const mbid = row && (row.recording_mbid || row.mbid);
    if (!title || !mbid) continue;
    const artist = String((row && (row.artist_name || row.artist)) || '').trim() || null;
    const album = String((row && (row.release_name || row.album)) || '').trim() || null;
    const key = `${title.toLowerCase()}\0${String(artist || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const length = row && typeof row.length === 'number' ? row.length : null;
    items.push({
      mbid: String(mbid),
      title,
      artist,
      album,
      durationSeconds: length != null ? Math.round(length / 1000) : null,
    });
  }
  return items;
}

function emptyPage(offset = 0) {
  return { items: [], total: 0, offset, limit: SEARCH_LIMIT };
}

function asPage(body, items, offset) {
  const total = body && Number.isFinite(Number(body.count)) ? Number(body.count) : items.length;
  return { items, total, offset, limit: SEARCH_LIMIT };
}

function mapRecordings(payload) {
  const list = payload && Array.isArray(payload.recordings) ? payload.recordings : [];
  const items = [];
  const seen = new Set();
  for (const rec of list) {
    if (!rec || rec.video === true) continue;
    const title = rec.title ? String(rec.title).trim() : '';
    if (!title || !rec.id) continue;
    const artist = artistFromCredit(rec['artist-credit']);
    const key = `${title.toLowerCase()}\0${String(artist || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const length = typeof rec.length === 'number' ? rec.length : null;
    items.push({
      mbid: String(rec.id),
      title,
      artist,
      album: albumFromReleases(rec.releases),
      durationSeconds: length != null ? Math.round(length / 1000) : null,
    });
  }
  return items;
}

const cache = new Map();
let lastCallAt = 0;
let chain = Promise.resolve();

function resetForTests() {
  cache.clear();
  lastCallAt = 0;
  chain = Promise.resolve();
}

async function waitTurn() {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

async function fetchJson(url, label) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      logger.warn('Music metadata request declined', { status: res.status, label });
      return null;
    }
    return await res.json();
  } catch (err) {
    logger.warn('Music metadata request failed', { error: err.message, label });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function queued(cacheKey, runFetch) {
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.items);

  const run = chain.then(async () => {
    const again = cache.get(cacheKey);
    if (again && again.expires > Date.now()) return again.items;
    await waitTurn();
    const items = await runFetch();
    // Failed outbound call returns null — do not cache that as an empty hit.
    if (items != null) cache.set(cacheKey, { items, expires: Date.now() + CACHE_TTL_MS });
    return items ?? [];
  }, async () => {
    await waitTurn();
    const items = await runFetch();
    if (items != null) cache.set(cacheKey, { items, expires: Date.now() + CACHE_TTL_MS });
    return items ?? [];
  });
  chain = run.then(() => undefined, () => undefined);
  return run;
}

async function searchArtists(query, offset = 0) {
  const q = typeof query === 'string' ? query.trim() : '';
  const off = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  if (!q) return emptyPage(off);
  const url = `${MB_ROOT}/artist?${new URLSearchParams({
    query: artistQuery(q),
    fmt: 'json',
    limit: String(SEARCH_LIMIT),
    offset: String(off),
  })}`;
  const page = await queued(`artist:${q}:${off}`, async () => {
    const body = await fetchJson(url, `artist ${q} @${off}`);
    return body == null ? null : asPage(body, mapArtists(body), off);
  });
  return page && Array.isArray(page.items) ? page : emptyPage(off);
}

async function searchRecordings(query, offset = 0) {
  const q = typeof query === 'string' ? query.trim() : '';
  const off = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  if (!q) return emptyPage(off);
  const url = `${MB_ROOT}/recording?${new URLSearchParams({
    query: recordingQuery(q),
    fmt: 'json',
    limit: String(SEARCH_LIMIT),
    offset: String(off),
  })}`;
  const page = await queued(`recording:${q}:${off}`, async () => {
    const body = await fetchJson(url, `recording ${q} @${off}`);
    return body == null ? null : asPage(body, mapRecordings(body), off);
  });
  return page && Array.isArray(page.items) ? page : emptyPage(off);
}

// Two sequential MB calls (shared 1 req/s queue) so one Catalog search does not
// stampede MusicBrainz with parallel artist+recording requests. First page only
// (offset 0); later pages use searchArtists / searchRecordings directly.
async function searchArtistsAndRecordings(query) {
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) return { artists: emptyPage(0), recordings: emptyPage(0) };
  const artists = await searchArtists(q, 0);
  const recordings = await searchRecordings(q, 0);
  return { artists, recordings };
}

// Clicked-artist drill-down: ListenBrainz listen-count ranking (not MusicBrainz
// releases). Same 1 req/s queue + UA so we never stampede either service.
// ListenBrainz has no offset on this endpoint — fetch once (cached), then
// slice SEARCH_LIMIT pages so the artist song list can lazy-load like search.
async function listPopularRecordingsByArtist(artistMbid, offset = 0) {
  const off = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  if (!isMbid(artistMbid)) return emptyPage(off);
  const url = `${LB_ROOT}/popularity/top-recordings-for-artist/${artistMbid}`;
  const all = await queued(`artist-popular:${artistMbid}`, async () => {
    const body = await fetchJson(url, `popular ${artistMbid}`);
    return body == null ? null : mapPopularRecordings(body);
  });
  const items = Array.isArray(all) ? all : [];
  return {
    items: items.slice(off, off + SEARCH_LIMIT),
    total: items.length,
    offset: off,
    limit: SEARCH_LIMIT,
  };
}

module.exports = {
  searchArtists,
  searchRecordings,
  searchArtistsAndRecordings,
  listPopularRecordingsByArtist,
  mapArtists,
  mapRecordings,
  mapPopularRecordings,
  artistQuery,
  recordingQuery,
  emptyPage,
  SEARCH_LIMIT,
  escapeLucene,
  isMbid,
  USER_AGENT,
  resetForTests,
};
