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

// Lucene phrase so "The Cranberries" does not become artist:The (every "The …" band).
function lucenePhrase(raw) {
  return `"${String(raw).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function artistQuery(raw) {
  const q = raw.trim();
  const phrase = `artist:${lucenePhrase(q)}`;
  const stripped = q.replace(/^(the|a|an)\s+/i, '').trim();
  // Bare token so "cranberries" still hits "The Cranberries". Multi-word keeps
  // the phrase as the primary clause so "The" cannot explode the result set.
  if (!q.includes(' ')) return `artist:${escapeLucene(q)}`;
  if (stripped && stripped.toLowerCase() !== q.toLowerCase()) {
    return `${phrase} OR artist:${escapeLucene(stripped)}`;
  }
  return phrase;
}

// Users type "Linger Cranberries" meaning title + artist. Locking the whole
// string to recording:(…) only matches titles that contain every word
// ("Linger (Bluegrass Rendition of the Cranberries)"), not Linger by The Cranberries.
function recordingQuery(raw) {
  const q = raw.trim();
  const parts = q.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return `recording:(${escapeLucene(parts[0])})`;
  const clauses = [];
  const title1 = parts.slice(0, -1).join(' ');
  clauses.push(`(recording:(${escapeLucene(title1)}) AND artist:${escapeLucene(parts[parts.length - 1])})`);
  if (parts.length >= 3) {
    const title2 = parts.slice(0, -2).join(' ');
    const artist2 = parts.slice(-2).join(' ');
    clauses.push(`(recording:(${escapeLucene(title2)}) AND artist:${lucenePhrase(artist2)})`);
  }
  clauses.push(`recording:(${escapeLucene(q)})`);
  return clauses.join(' OR ');
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

// Same vocabulary as songMetadataService / songFieldOptions — MB genre names
// (and tags) fold onto the Catalog/Songlist list, unknown names are dropped.
const GENRE_MAPPING = {
  rock: 'Rock', 'hard rock': 'Hard Rock', 'alternative rock': 'Alternative',
  alternative: 'Alternative', indie: 'Indie', 'indie rock': 'Indie', punk: 'Punk',
  'progressive rock': 'Progressive', progressive: 'Progressive', metal: 'Metal',
  rap: 'Rap', 'hip-hop': 'Hip-Hop', 'hip hop': 'Hip-Hop', trap: 'Trap',
  electronic: 'Electronic', edm: 'EDM', techno: 'Techno', house: 'House',
  'drum and bass': 'Drum & Bass', 'drum & bass': 'Drum & Bass', ambient: 'Ambient',
  disco: 'Disco', pop: 'Pop', folk: 'Folk', funk: 'Funk', jazz: 'Jazz',
  blues: 'Blues', country: 'Country', reggae: 'Reggae', ska: 'Ska',
  classical: 'Classical', gospel: 'Gospel', 'r&b': 'R&B / Soul', soul: 'R&B / Soul',
  latin: 'Latin', world: 'World', acoustic: 'Acoustic', soundtrack: 'Soundtrack',
  'k-pop': 'K-Pop', kpop: 'K-Pop', 'singer-songwriter': 'Singer-Songwriter',
};

function mapGenreNames(names) {
  if (!Array.isArray(names)) return null;
  const out = [];
  const seen = new Set();
  for (const raw of names) {
    const lower = String(raw || '').toLowerCase().trim();
    if (!lower) continue;
    let mapped = GENRE_MAPPING[lower];
    if (!mapped) {
      for (const [key, value] of Object.entries(GENRE_MAPPING)) {
        if (lower.includes(key)) { mapped = value; break; }
      }
    }
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    out.push(mapped);
    if (out.length >= 5) break;
  }
  return out.length ? out : null;
}

function collectGenreNames(payload) {
  const names = [];
  const add = (list) => {
    if (!Array.isArray(list)) return;
    const sorted = [...list].sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));
    for (const row of sorted) {
      const name = row && (row.name || row.tag);
      if (name) names.push(String(name));
    }
  };
  add(payload && payload.genres);
  if (names.length === 0 && payload && Array.isArray(payload['artist-credit'])) {
    for (const credit of payload['artist-credit']) add(credit && credit.artist && credit.artist.genres);
  }
  if (names.length === 0) add(payload && payload.tags);
  return names;
}

// ISO 639-3 (MusicBrainz work.languages) → Catalog/Songlist languageOptions.
const LANGUAGE_ISO = {
  afr: 'Afrikaans', sqi: 'Albanian', amh: 'Amharic', ara: 'Arabic', hye: 'Armenian',
  aze: 'Azerbaijani', eus: 'Basque', bel: 'Belarusian', ben: 'Bengali', bos: 'Bosnian',
  bul: 'Bulgarian', mya: 'Burmese', cat: 'Catalan', yue: 'Chinese (Cantonese)',
  cmn: 'Chinese (Mandarin)', zho: 'Chinese (Mandarin)', hrv: 'Croatian', ces: 'Czech',
  dan: 'Danish', nld: 'Dutch', eng: 'English', est: 'Estonian', fas: 'Farsi',
  fin: 'Finnish', fra: 'French', glg: 'Galician', kat: 'Georgian', deu: 'German',
  ell: 'Greek', guj: 'Gujarati', hat: 'Haitian Creole', hau: 'Hausa', heb: 'Hebrew',
  hin: 'Hindi', hun: 'Hungarian', isl: 'Icelandic', ibo: 'Igbo', ind: 'Indonesian',
  gle: 'Irish', ita: 'Italian', jpn: 'Japanese', jav: 'Javanese', kan: 'Kannada',
  kaz: 'Kazakh', khm: 'Khmer', kin: 'Kinyarwanda', kor: 'Korean', kur: 'Kurdish',
  lao: 'Lao', lav: 'Latvian', lit: 'Lithuanian', mkd: 'Macedonian', msa: 'Malay',
  mal: 'Malayalam', mlt: 'Maltese', mri: 'Maori', mar: 'Marathi', mon: 'Mongolian',
  nep: 'Nepali', nor: 'Norwegian', nob: 'Norwegian', nno: 'Norwegian', ori: 'Odia',
  pus: 'Pashto', pol: 'Polish', por: 'Portuguese', pan: 'Punjabi', que: 'Quechua',
  ron: 'Romanian', rus: 'Russian', srp: 'Serbian', sin: 'Sinhala', slk: 'Slovak',
  slv: 'Slovenian', som: 'Somali', spa: 'Spanish', swa: 'Swahili', swe: 'Swedish',
  tgl: 'Tagalog', tam: 'Tamil', tat: 'Tatar', tel: 'Telugu', tha: 'Thai',
  tur: 'Turkish', ukr: 'Ukrainian', urd: 'Urdu', uzb: 'Uzbek', vie: 'Vietnamese',
  cym: 'Welsh', wol: 'Wolof', xho: 'Xhosa', yor: 'Yoruba', zul: 'Zulu',
};

function mapLanguageCodes(codes) {
  if (!Array.isArray(codes)) return null;
  const out = [];
  const seen = new Set();
  for (const raw of codes) {
    const code = String(raw || '').toLowerCase().trim();
    if (!code || code === 'zxx' || code === 'mul') continue;
    const name = LANGUAGE_ISO[code];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out.length ? out : null;
}

function languagesFromRelations(relations) {
  if (!Array.isArray(relations)) return [];
  const codes = [];
  for (const rel of relations) {
    const work = rel && rel.work;
    if (!work) continue;
    const list = Array.isArray(work.languages) ? work.languages
      : (work.language ? [work.language] : []);
    for (const code of list) codes.push(code);
  }
  return codes;
}

const STREAM_HOSTS = [
  ['spotify.com', 'Spotify'],
  ['music.youtube.com', 'YouTube'],
  ['youtu.be', 'YouTube'],
  ['youtube.com', 'YouTube'],
  ['music.apple.com', 'Apple Music'],
  ['itunes.apple.com', 'Apple Music'],
  ['deezer.com', 'Deezer'],
  ['tidal.com', 'Tidal'],
  ['soundcloud.com', 'SoundCloud'],
  ['bandcamp.com', 'Bandcamp'],
];

function streamingFromRelations(relations) {
  if (!Array.isArray(relations)) return null;
  const items = [];
  const seen = new Set();
  for (const rel of relations) {
    const href = rel && rel.url && rel.url.resource;
    if (!href || seen.has(href)) continue;
    let host = '';
    try { host = new URL(href).hostname.toLowerCase(); } catch { continue; }
    const pair = STREAM_HOSTS.find(([suffix]) => host === suffix || host.endsWith(`.${suffix}`));
    if (!pair) continue;
    seen.add(href);
    items.push({ label: pair[1], url: href });
  }
  return items.length ? items : null;
}

function mapRecordingLookup(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const title = payload.title ? String(payload.title).trim() : '';
  const length = typeof payload.length === 'number' ? payload.length : null;
  return {
    mbid: payload.id ? String(payload.id) : null,
    title: title || null,
    artist: artistFromCredit(payload['artist-credit']),
    album: albumFromReleases(payload.releases),
    durationSeconds: length != null ? Math.round(length / 1000) : null,
    genre: mapGenreNames(collectGenreNames(payload)),
    language: mapLanguageCodes(languagesFromRelations(payload.relations)),
    streamingLinks: streamingFromRelations(payload.relations),
  };
}

function applyRecordingFill(fallback, lookup) {
  const src = lookup && !Array.isArray(lookup) ? lookup : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  return {
    title: src.title || base.title || null,
    artist: src.artist || base.artist || null,
    album: src.album || base.album || null,
    durationSeconds: src.durationSeconds ?? base.durationSeconds ?? null,
    genre: src.genre || null,
    language: src.language || null,
    streamingLinks: src.streamingLinks || null,
  };
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

// Import-time lookup: genres, lyrics language (via work), album, duration, streaming URLs.
// Failures return null so the importer can still write the list-row fallbacks.
async function lookupRecording(recordingMbid) {
  if (!isMbid(recordingMbid)) return null;
  const url = `${MB_ROOT}/recording/${recordingMbid}?fmt=json&inc=genres+tags+releases+artist-credits+work-rels+url-rels`;
  const mapped = await queued(`recording-lookup:${recordingMbid}`, async () => {
    const body = await fetchJson(url, `lookup ${recordingMbid}`);
    return body == null ? null : mapRecordingLookup(body);
  });
  return mapped && !Array.isArray(mapped) ? mapped : null;
}

module.exports = {
  searchArtists,
  searchRecordings,
  searchArtistsAndRecordings,
  listPopularRecordingsByArtist,
  lookupRecording,
  mapArtists,
  mapRecordings,
  mapPopularRecordings,
  mapRecordingLookup,
  mapGenreNames,
  mapLanguageCodes,
  applyRecordingFill,
  artistQuery,
  recordingQuery,
  emptyPage,
  SEARCH_LIMIT,
  escapeLucene,
  isMbid,
  USER_AGENT,
  resetForTests,
};
