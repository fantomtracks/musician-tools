'use strict';

// Story 23.1 — seed the shared Catalog from the songs already entered in production.
// Story 23.2 — attach the users' existing Songs to the entry they match.
//
// MANUAL one-off script (epic 23, decision C). It is deliberately NOT wired to the
// deploy: `release_command` runs migrations only, and a content seed has no business in
// the schema pipeline. Run it by hand, dry-run first.
//
//   cd backend
//   NODE_ENV=development node scripts/seed-catalog.js                    # dry-run (default)
//   NODE_ENV=development node scripts/seed-catalog.js --apply            # writes
//   NODE_ENV=development node scripts/seed-catalog.js --file=seed/other.csv
//   NODE_ENV=development node scripts/seed-catalog.js --phase=attach     # dry-run of the attach
//   NODE_ENV=development node scripts/seed-catalog.js --phase=attach --apply
//   NODE_ENV=development node scripts/seed-catalog.js --phase=alias      # dry-run of the alias pass
//   NODE_ENV=development node scripts/seed-catalog.js --phase=alias --apply
//   NODE_ENV=development node scripts/seed-catalog.js --phase=enrich     # dry-run de l'enrichissement
//   NODE_ENV=development node scripts/seed-catalog.js --phase=enrich --apply
//
// Phase order matters: seed → attach → alias → enrich. The alias pass must run AFTER the
// exact-fold attach, so a song the exact match would have taken is never renamed by an
// alias; and enrich runs LAST because it travels along the link attach and alias create.
//
// The two phases share the host guard, the dry-run default and the argument parsing on
// purpose — the attach phase needs them MORE than the seed phase did, because it writes
// into the users' personal Songs rather than into a shared pool.
//
// ⚠️ THE GUARD KEYS ON THE RESOLVED DATABASE HOST, NOT ON NODE_ENV — and that is not
// a stylistic choice, it is a measured one. With NODE_ENV unset, db.js computes
// `env = 'production'` BEFORE config.js has loaded .env, so the connection is built
// from DATABASE_URL_PROD — the real production database. config.js then loads .env,
// which fills NODE_ENV with 'development'. Anything reading process.env.NODE_ENV
// afterwards reports "development" while the socket points at PROD. Verified:
//     NODE_ENV at startup : (unset)
//     NODE_ENV after load : development
//     actual connection   : aws-1-…-pooler.supabase.com:5432/postgres
// So: writing is REFUSED unless the resolved host is local, or --allow-remote is
// passed explicitly. A distracted `node scripts/seed-catalog.js --apply` cannot write
// to a remote database.
//
// Entries are created as DRAFTS (publishedAt = null, decision A): a seeded entry only
// carries title + artist, and if it were published a user clicking "Refresh" would have
// their key/BPM overwritten with nulls (refreshSongFromCatalog writes `catalog[f] ?? null`).
// The link lights up on its own once the curator enriches and publishes the entry.

const fs = require('node:fs');
const path = require('node:path');
const { fn, col, where: whereFn, Op, QueryTypes } = require('sequelize');
const { normalizeInt, normalizeDurationSeconds, normalizeLanguage, normalizeMode } = require('../utils/normalize');

const DEFAULT_FILE = path.join(__dirname, 'seed', 'catalog-seed.csv');
const KNOWN_FLAGS = ['--apply', '--allow-remote'];
const PHASES = ['seed', 'attach', 'alias', 'enrich'];
// Captured at MODULE LOAD, before anything can require config.js and let dotenv
// rewrite it. Informational only — the guard below trusts the host, not this.
const NODE_ENV_AT_STARTUP = process.env.NODE_ENV;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', ''];

function isLocalHost(host) {
  return LOCAL_HOSTS.includes(String(host || '').toLowerCase());
}

// --- CSV -------------------------------------------------------------------

// Minimal RFC4180-ish splitter: enough for two columns with quoted fields, and it does
// not drag a dependency in for 82 lines. A naive split(',') would break on a quoted
// artist like "Emerson, Lake & Palmer". Returns null when a quote is left open, so the
// caller can ABORT rather than fabricate rows out of a half-parsed line.
function splitCsvLine(line) {
  const out = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  if (inQuotes) return null; // a multi-line quoted field: unsupported, and never silent
  out.push(field);
  return out.map(f => f.trim());
}

// The IDENTITY fold — the one the unique index uses: lower() on both parts, an absent
// artist collapsing to ''. Accents are KEPT on purpose: the index does not unaccent, so
// « Hôtel California » and « Hotel California » are two distinct entries. The f_unaccent
// fold (catalogcontroller.foldedLike) is for LIKE SEARCH only — using it here would
// skip a legitimate creation.
//
// NOTE: this JS key and the SQL index are two implementations of the same rule. They
// agree on case and on a missing artist. They can still DISAGREE on a pre-existing row
// stored with surrounding whitespace, because the script trims its input and the index
// does not — deferred, see the story.
//
// The separator is NUL, which cannot occur in a Postgres text value. Any printable
// separator collides: with '|', ('a|b','c') and ('a','b|c') give the same key; with a
// space it is worse still — ('a b','c') and ('a','b c') collide, and both are perfectly
// ordinary song titles.
function identityKey(title, artist) {
  return `${String(title || '').toLowerCase()}\u0000${String(artist || '').toLowerCase()}`;
}

class SeedFileError extends Error {}

function parseSeedCsv(text) {
  const rows = [];
  const skipped = [];
  const seen = new Set();

  // Unicode NFC: the same accent can be stored decomposed (e + ́) or composed (é).
  // Postgres `lower()` compares bytes, so the two forms would create two entries.
  // Normalising the input side is the cheap half of the fix; the file itself is NFC.
  const clean = String(text).replace(/^﻿/, '').normalize('NFC'); // also strips a BOM
  const lines = clean.split(/\r?\n/);

  let headerSeen = false;
  for (const raw of lines) {
    if (!raw.trim()) continue; // blank line: not a skip, just noise

    const fields = splitCsvLine(raw);
    if (fields === null) {
      throw new SeedFileError(`Guillemet non fermé — champ multi-ligne non supporté : ${raw.slice(0, 80)}`);
    }

    // The header is the FIRST NON-BLANK line, not line index 0: a leading blank line
    // used to shift the index and turn the header itself into a Catalog entry.
    if (!headerSeen) {
      headerSeen = true;
      const [c1 = '', c2 = ''] = fields;
      if (c1.toLowerCase() !== 'artist' || c2.toLowerCase() !== 'title') {
        // Never guess the column order: a `title,artist` file would seed 82 rows
        // backwards, silently, and re-running would be idempotent in the wrong state.
        throw new SeedFileError(`En-tête attendu « artist,title », lu « ${fields.join(',')} »`);
      }
      continue;
    }

    const [artistRaw = '', titleRaw = ''] = fields;
    const title = titleRaw.trim();
    const artist = artistRaw.trim();

    // title is NOT NULL on the model; artist IS nullable.
    if (!title) { skipped.push({ artist, title, reason: 'ligne vide ou incomplète' }); continue; }

    const key = identityKey(title, artist);
    if (seen.has(key)) { skipped.push({ artist, title, reason: 'doublon interne au fichier' }); continue; }
    seen.add(key);

    rows.push({ artist: artist || null, title });
  }

  if (!headerSeen) throw new SeedFileError('Fichier vide : aucun en-tête trouvé');
  return { rows, skipped };
}

// --- Seeding ---------------------------------------------------------------

// Same folded lookup as catalogcontroller.findExistingByTitleArtist — deliberately the
// same shape so the skip and the unique index agree on case and on a null artist.
function findExisting(CatalogSong, title, artist) {
  return CatalogSong.findOne({
    where: {
      [Op.and]: [
        whereFn(fn('lower', col('title')), String(title == null ? '' : title).toLowerCase()),
        whereFn(fn('coalesce', fn('lower', col('artist')), ''), artist ? String(artist).toLowerCase() : ''),
      ],
    },
  });
}

async function seedCatalog({ CatalogSong, rows, apply = false }) {
  const report = { total: rows.length, created: 0, skipped: [], failed: [], applied: !!apply };

  for (const { title, artist } of rows) {
    // The WHOLE row is guarded, lookup included: a connection dropping on row 41 used
    // to throw out of here and discard the report — the only record of the 40 rows
    // already written to a shared table.
    try {
      const existing = await findExisting(CatalogSong, title, artist);
      if (existing) {
        // A DRAFT counts as existing: the canonical index is global and covers drafts
        // (migration 20260716000100 — the 19.6 note calling it partial is wrong).
        report.skipped.push({ artist, title, reason: 'déjà au Catalog' });
        continue;
      }

      if (!apply) { report.created += 1; continue; } // dry-run: counted, never written

      await CatalogSong.create({ title, artist, publishedAt: null });
      report.created += 1;
    } catch (error) {
      if (error && error.name === 'SequelizeUniqueConstraintError') {
        // Almost certainly a race with a concurrent run on the canonical index — but
        // name the constraint rather than assume, so a violation on some OTHER unique
        // column can't hide inside a benign-looking tally.
        const constraint = (error.parent && error.parent.constraint) || error.constraint || 'contrainte inconnue';
        report.skipped.push({ artist, title, reason: `conflit d’unicité (${constraint})` });
      } else {
        // Anything else is a real problem: record it, but keep the batch going.
        report.failed.push({ artist, title, reason: (error && error.message) || String(error) });
      }
    }
  }
  return report;
}

// --- Report ----------------------------------------------------------------

function formatReport(report, { log = console.log } = {}) {
  const byReason = report.skipped.reduce((acc, s) => {
    acc[s.reason] = (acc[s.reason] || 0) + 1;
    return acc;
  }, {});

  log('');
  log(report.applied ? '=== SEED APPLIQUÉ ===' : '=== DRY-RUN — aucune écriture ===');
  log(`  lues            : ${report.total}`);
  log(`  ${report.applied ? 'créées         ' : 'à créer        '} : ${report.created}`);
  log(`  sautées         : ${report.skipped.length}`);
  for (const [reason, count] of Object.entries(byReason)) log(`      ${reason} : ${count}`);
  if (report.failed.length) {
    log(`  ÉCHECS          : ${report.failed.length}   ⚠️  le lot n'est PAS complet`);
    for (const f of report.failed) log(`      ✗ ${f.artist || '—'} — ${f.title} : ${f.reason}`);
  }
  // Database-side skips first: a pile of parse noise used to push them past the cutoff.
  const ordered = report.skipped
    .filter(s => s.reason !== 'ligne vide ou incomplète' && s.reason !== 'doublon interne au fichier')
    .concat(report.skipped.filter(s => s.reason === 'ligne vide ou incomplète' || s.reason === 'doublon interne au fichier'));
  const shown = ordered.slice(0, 20);
  if (shown.length) {
    log('  détail des sautées :');
    for (const s of shown) log(`      • ${s.artist || '—'} — ${s.title}  (${s.reason})`);
    if (ordered.length > shown.length) log(`      … et ${ordered.length - shown.length} de plus`);
  }
  log('');
}

// --- Attach (story 23.2) -----------------------------------------------------

// The matching happens HERE, in SQL, and not by loading every Song into JS: the JS fold
// (identityKey) and the index expression are two implementations of the same rule and can
// drift apart — they already disagree on surrounding whitespace.
//
// Be honest about how strong that is: this statement is a THIRD hand-typed spelling of the
// same rule, and nothing automated proves it matches the index. It was verified by hand
// against the dev database (story 23.2) and is verified again in 23.4. Note also that
// `songs_user_uid_title_artist_ci` leads on `user_uid`, which this join deliberately does
// NOT constrain — so that index cannot serve this join, and "agrees with the index" is a
// claim about the EXPRESSION only, not about the plan.
//
// `count(*) OVER (PARTITION BY s.uid)` is the ambiguity probe. In theory it is always 1:
// `catalog_songs_title_artist_ci` makes the fold unique on the Catalog side. Measuring it
// anyway costs nothing, and a 2 means the canonical index is not doing its job — a state
// worth refusing rather than resolving by picking whichever row came back first.
//
// `s.title`/`s.artist` come back so the UPDATE can re-check them: they are half of what
// made this row a candidate, and the row can change between the SELECT and the write.
//
// No `published_at` filter: every entry seeded by 23.1 is a DRAFT (decision A), so
// filtering on published would attach exactly nothing. The link stays dormant until the
// curator publishes.
const ATTACH_CANDIDATES_SQL = `
  SELECT s.uid                              AS song_uid,
         s.user_uid                         AS user_uid,
         s.title                            AS song_title,
         s.artist                           AS song_artist,
         c.uid                              AS catalog_uid,
         c."updatedAt"                      AS catalog_updated_at,
         count(*) OVER (PARTITION BY s.uid) AS match_count
    FROM "Songs" s
    JOIN "CatalogSongs" c
      ON lower(s.title) = lower(c.title)
     AND coalesce(lower(s.artist), '') = coalesce(lower(c.artist), '')
   WHERE s.source_catalog_uid IS NULL
   ORDER BY s.user_uid, s.title
`;

async function selectAttachCandidates(sequelize) {
  const rows = await sequelize.query(ATTACH_CANDIDATES_SQL, { type: QueryTypes.SELECT });
  return rows.map((r, i) => {
    const candidate = {
      songUid: r.song_uid,
      userUid: r.user_uid,
      songTitle: r.song_title,
      songArtist: r.song_artist,
      catalogUid: r.catalog_uid,
      catalogUpdatedAt: r.catalog_updated_at,
      // pg returns bigint as a STRING: `'2' > 1` is true by coercion but `'2' > '10'` is
      // not, so normalise rather than trust the comparison.
      matchCount: Number(r.match_count),
    };
    // Refuse a malformed row instead of carrying it into an UPDATE. Without this, dropping
    // `type: QueryTypes.SELECT` would make Sequelize return [rows, metadata]; every field
    // would be undefined and matchCount NaN — and `NaN > 1` is FALSE, so the ambiguity
    // probe would wave it straight through to `update({...}, { where: { uid: undefined } })`.
    if (!candidate.songUid || !candidate.catalogUid || !Number.isFinite(candidate.matchCount) || candidate.matchCount < 1) {
      throw new Error(
        `Ligne ${i} inexploitable renvoyée par la requête de rattachement (song=${candidate.songUid}, ` +
        `catalog=${candidate.catalogUid}, match_count=${r.match_count}) — la requête ne renvoie pas la forme attendue.`
      );
    }
    return candidate;
  });
}

// The tables whose rows ARE the users' practice history. Counted through the models so
// the table names come from one place (the model layer) instead of being re-typed here —
// `PlaylistSongs` in particular is camelCase in the database, not `playlist_songs`.
async function countGuardedTables(db) {
  const [Songs, SongPlays, SessionItems, PlaylistSongs] = await Promise.all([
    db.Song.count(), db.SongPlay.count(), db.SessionItem.count(), db.PlaylistSong.count(),
  ]);
  return { Songs, SongPlays, SessionItems, PlaylistSongs };
}

function diffCounts(before, after) {
  return Object.keys(before)
    .filter(table => before[table] !== after[table])
    .map(table => ({ table, before: before[table], after: after[table] }));
}

async function attachSongs({ Song, candidates, apply = false }) {
  const report = { candidates: 0, attached: 0, ambiguous: [], raced: [], failed: [], byUser: {}, applied: !!apply };
  const seen = new Set();

  for (const c of candidates) {
    // An ambiguous song comes back as several rows; it is ONE song to decide about.
    if (seen.has(c.songUid)) continue;
    seen.add(c.songUid);
    report.candidates += 1;

    if (c.matchCount > 1) {
      report.ambiguous.push({ songUid: c.songUid, userUid: c.userUid, matches: c.matchCount });
      continue;
    }

    const tally = () => {
      report.attached += 1;
      report.byUser[c.userUid] = (report.byUser[c.userUid] || 0) + 1;
    };

    // Same per-row guard as the seed phase: a connection dropping mid-batch must not
    // discard the record of what has ALREADY been written to the users' rows.
    try {
      if (!apply) { tally(); continue; } // dry-run: counted, never written

      const [affected = 0] = (await Song.update(
        { sourceCatalogUid: c.catalogUid, sourceCatalogSyncedAt: c.catalogUpdatedAt },
        {
          // The where re-checks AT WRITE TIME every condition that made this row a
          // candidate, not just the source. Checking only `sourceCatalogUid IS NULL` left
          // a window: the user renames "Yesterday" to "Yesterday (live)" between the
          // SELECT and the UPDATE, the uid still matches, the source is still NULL — and
          // we stamp a provenance towards an entry the song no longer matches, reported
          // as a success. Title and artist are compared exactly (not folded) on purpose:
          // any edit at all should cost us the write rather than risk a wrong link.
          where: { uid: c.songUid, sourceCatalogUid: null, title: c.songTitle, artist: c.songArtist },
          // No updatedAt bump: this is a metadata backfill, not a user edit. Touching
          // updatedAt on five users' whole songlists would falsify the row's own history
          // and make the "only two columns" claim untrue.
          silent: true,
        }
      )) || [];

      // 0 rows means the song no longer looks like the one we selected: attached by a
      // concurrent run, or edited since. We cannot tell which from here, and the label
      // must not pretend otherwise.
      if (!affected) { report.raced.push({ songUid: c.songUid, userUid: c.userUid }); continue; }
      tally();
    } catch (error) {
      report.failed.push({ songUid: c.songUid, userUid: c.userUid, reason: (error && error.message) || String(error) });
    }
  }
  return report;
}

function formatCounts(counts) {
  return Object.entries(counts).map(([t, n]) => `${t}=${n}`).join('  ');
}

// One width for every label in the run, computed rather than hand-counted: the header and
// the report are what an operator reads to decide whether to authorise a production write,
// and hand-aligned spaces drift the moment a label is added (they already had, on
// « Compteurs après »). Accented labels count in code points here, which is what padEnd
// uses too, so the columns line up for the strings actually in play.
const LABEL_WIDTH = 16;
const label = text => text.padEnd(LABEL_WIDTH);

function formatAttachReport(report, { log = console.log } = {}) {
  log('');
  log(report.applied ? '=== RATTACHEMENT APPLIQUÉ ===' : '=== DRY-RUN — aucune écriture ===');
  log(`  ${label('candidats')}: ${report.candidates}`);
  log(`  ${label(report.applied ? 'rattachées' : 'à rattacher')}: ${report.attached}`);
  if (report.raced.length) log(`  ${label('non écrites')}: ${report.raced.length}   (rattachées entre-temps, ou modifiées depuis la sélection)`);

  if (report.ambiguous.length) {
    log(`  ${label('AMBIGUËS')}: ${report.ambiguous.length}   ⚠️  refusées — plusieurs entrées Catalog pour un même fold`);
    for (const a of report.ambiguous) log(`      ✗ song ${a.songUid} — ${a.matches} entrées candidates`);
  }
  if (report.failed.length) {
    log(`  ${label('ÉCHECS')}: ${report.failed.length}   ⚠️  le lot n'est PAS complet`);
    for (const f of report.failed) log(`      ✗ song ${f.songUid} : ${f.reason}`);
  }

  // A batch where NOTHING was written and everything bounced is not "someone else already
  // did the work" — it reads that way, which is exactly the danger. Say it plainly.
  if (report.applied && report.candidates > 0 && report.attached === 0 && report.raced.length === report.candidates) {
    log(`  ⚠️  AUCUNE écriture n'a abouti alors que ${report.candidates} candidat(s) avaient été sélectionnés.`);
    log("      Ce n'est pas un lot déjà fait : vérifiez la correspondance colonnes/attributs avant de relancer.");
  }

  // Per user, never per email: the script has no need for one, and the versioned CSV
  // deliberately contains none.
  const users = Object.entries(report.byUser);
  if (users.length) {
    log('  par utilisateur :');
    for (const [userUid, count] of users) log(`      ${userUid} : ${count}`);
  }
  log('');
}

// --- Alias (story 23.3) ------------------------------------------------------
//
// The ONLY phase that rewrites what a user typed. Decision F: cleaning the seed CSV fixed
// the Catalog's spelling, which broke the exact-fold match for the 9 entries whose typo
// was corrected. northwood: « je ne veux pas que les utilisateurs payent ». So the original
// spelling becomes an alias, and the user's row is corrected to the canonical form.
//
// It runs AFTER the exact-fold phase on purpose: a song the exact phase would have taken
// must not be renamed by an alias it did not need.

const ALIAS_FILE = path.join(__dirname, 'seed', 'catalog-seed-aliases.csv');
// One ordered source of truth for the CTE columns and the bind order. Declaring them twice
// invited a transposition no test could have caught: the CSV header order is the REVERSE of
// each pair (aliasArtist,aliasTitle vs alias_title,alias_artist).
const ALIAS_BIND_COLUMNS = ['alias_title', 'alias_artist', 'canon_title', 'canon_artist'];
const ALIAS_BIND_FIELDS = ['aliasTitle', 'aliasArtist', 'title', 'artist'];

function parseAliasCsv(text) {
  const rows = [];
  const skipped = [];
  const seen = new Map(); // alias fold -> canonical LITERAL, to catch a file that contradicts itself

  const clean = String(text).replace(/^﻿/, '').normalize('NFC');
  const lines = clean.split(/\r?\n/);

  let headerSeen = false;
  for (const raw of lines) {
    if (!raw.trim()) continue;

    const fields = splitCsvLine(raw);
    if (fields === null) {
      throw new SeedFileError(`Guillemet non fermé — champ multi-ligne non supporté : ${raw.slice(0, 80)}`);
    }

    if (!headerSeen) {
      headerSeen = true;
      const [c1 = '', c2 = '', c3 = '', c4 = ''] = fields.map(f => f.toLowerCase());
      if (c1 !== 'aliasartist' || c2 !== 'aliastitle' || c3 !== 'artist' || c4 !== 'title') {
        // Never guess the column order: here it would rename users' songs towards the wrong string.
        throw new SeedFileError(`En-tête attendu « aliasArtist,aliasTitle,artist,title », lu « ${fields.join(',')} »`);
      }
      if (fields.length > 4) {
        throw new SeedFileError(`En-tête à ${fields.length} colonnes : les colonnes surnuméraires seraient ignorées en silence`);
      }
      continue;
    }

    const [aliasArtistRaw = '', aliasTitleRaw = '', artistRaw = '', titleRaw = ''] = fields;
    const aliasTitle = aliasTitleRaw.trim();
    const aliasArtist = aliasArtistRaw.trim();
    const title = titleRaw.trim();
    const artist = artistRaw.trim();

    // ALL FOUR columns are required, artists included. An empty aliasArtist would join on
    // `coalesce(lower(s.artist),'') = ''` and claim EVERY artist-less song with that title,
    // for every user, then rename it. An empty canonical artist would write NULL over the
    // user's real artist, and the report would render it « — / Back in Black », which reads
    // like formatting rather than data loss. An artist-less song is deliberately NOT
    // expressible here: this table exists to fix a handful of named rows.
    if (!aliasTitle || !title || !aliasArtist || !artist) {
      skipped.push({ aliasArtist, aliasTitle, reason: 'ligne incomplète (les 4 colonnes sont obligatoires)' });
      continue;
    }

    const aliasKey = identityKey(aliasTitle, aliasArtist);
    const canonKey = identityKey(title, artist);
    // The conflict test compares the LITERAL canonical pair, not its fold: the whole point of
    // this phase is to write one precise spelling into a user's row, so « AC/DC » and « ac/dc »
    // are a contradiction to raise, not a duplicate to collapse.
    const canonLiteral = `${title} ${artist}`;

    if (aliasKey === canonKey) {
      // The exact-fold phase already matched this one; treating it as an alias would mean
      // "renaming" a song to the spelling it already has.
      skipped.push({ aliasArtist, aliasTitle, reason: 'alias identique à la forme canonique' });
      continue;
    }

    if (seen.has(aliasKey)) {
      if (seen.get(aliasKey) !== canonLiteral) {
        throw new SeedFileError(`Conflit dans la table d'alias : « ${aliasArtist} / ${aliasTitle} » pointe vers deux fiches différentes`);
      }
      skipped.push({ aliasArtist, aliasTitle, reason: 'doublon interne au fichier' });
      continue;
    }
    seen.set(aliasKey, canonLiteral);

    rows.push({ aliasArtist, aliasTitle, artist, title });
  }

  if (!headerSeen) throw new SeedFileError('Fichier vide : aucun en-tête trouvé');
  return { rows, skipped };
}

// The alias table travels as bind parameters rather than being interpolated: these strings
// come from a file, and one of them legitimately contains a quote (Guns N' Roses).
//
// Three probes live in this statement, each because doing it in JS would be weaker:
//   * collision_count — `songs_user_uid_title_artist_ci` makes identity unique PER USER, so
//     renaming « AC DC / Back in black » can collide with an « AC/DC / Back in Black » the
//     same user already owns. Counted on the index expression, same user, excluding self.
//   * match_count — the same ambiguity probe the attach phase carries. If the Catalog ever
//     held two fiches for one fold, taking whichever row came back first would be arbitrary
//     AND irreproducible; the attach phase refuses, so this one refuses too.
//   * NOT EXISTS — the phase-order guard, made STRUCTURAL instead of merely documented. A
//     song whose own spelling is itself a Catalog entry is never an alias candidate,
//     whatever order the phases run in. Without it, a fiche one day spelled like an alias
//     would turn this pass into a renamer of correctly-spelled songs.
//
// LEFT JOIN on CatalogSongs, not JOIN: a missing canonical entry must come back so it can be
// REFUSED and reported, not silently vanish from the candidate list.
function buildAliasCandidatesSql(count) {
  const tuples = Array.from({ length: count }, (_, i) => {
    const b = i * 4;
    // Postgres cannot infer a bind parameter's type inside VALUES; casting the first tuple
    // is enough to type the whole column.
    const cast = i === 0 ? '::text' : '';
    return `($${b + 1}${cast}, $${b + 2}${cast}, $${b + 3}${cast}, $${b + 4}${cast})`;
  }).join(', ');

  return `
  WITH alias(${ALIAS_BIND_COLUMNS.join(', ')}) AS (VALUES ${tuples})
  SELECT s.uid          AS song_uid,
         s.user_uid     AS user_uid,
         s.title        AS song_title,
         s.artist       AS song_artist,
         a.alias_title  AS alias_title,
         a.alias_artist AS alias_artist,
         a.canon_title  AS canon_title,
         a.canon_artist AS canon_artist,
         c.uid          AS catalog_uid,
         c."updatedAt"  AS catalog_updated_at,
         count(*) OVER (PARTITION BY s.uid)                                            AS match_count,
         (SELECT count(*) FROM "Songs" o
           WHERE o.user_uid = s.user_uid
             AND o.uid <> s.uid
             AND lower(o.title) = lower(a.canon_title)
             AND coalesce(lower(o.artist), '') = coalesce(lower(a.canon_artist), '')) AS collision_count,
         (SELECT count(*) FROM "SessionItems" i WHERE i.song_uid = s.uid)             AS session_item_count
    FROM "Songs" s
    JOIN alias a
      ON lower(s.title) = lower(a.alias_title)
     AND coalesce(lower(s.artist), '') = coalesce(lower(a.alias_artist), '')
    LEFT JOIN "CatalogSongs" c
      ON lower(c.title) = lower(a.canon_title)
     AND coalesce(lower(c.artist), '') = coalesce(lower(a.canon_artist), '')
   WHERE s.source_catalog_uid IS NULL
     AND NOT EXISTS (SELECT 1 FROM "CatalogSongs" x
                      WHERE lower(x.title) = lower(a.alias_title)
                        AND coalesce(lower(x.artist), '') = coalesce(lower(a.alias_artist), ''))
   ORDER BY s.user_uid, s.title
`;
}

async function selectAliasCandidates(sequelize, aliasRows) {
  if (!aliasRows.length) return []; // an empty VALUES list is a syntax error, not an empty result
  const bind = [];
  // Built from the SAME ordered constant the CTE declares, so a transposition is impossible
  // rather than merely untested. The CSV header order is the reverse of each pair, which is
  // exactly the invitation to swap that this removes.
  for (const r of aliasRows) bind.push(...ALIAS_BIND_FIELDS.map(f => r[f]));

  const rows = await sequelize.query(buildAliasCandidatesSql(aliasRows.length), { type: QueryTypes.SELECT, bind });
  return rows.map(r => ({
    songUid: r.song_uid,
    userUid: r.user_uid,
    songTitle: r.song_title,
    songArtist: r.song_artist,
    aliasTitle: r.alias_title,
    aliasArtist: r.alias_artist,
    canonTitle: r.canon_title,
    canonArtist: r.canon_artist,
    catalogUid: r.catalog_uid,
    catalogUpdatedAt: r.catalog_updated_at,
    matchCount: Number(r.match_count),           // bigint arrives as a string
    collisionCount: Number(r.collision_count),
    sessionItemCount: Number(r.session_item_count),
  }));
}

const describeSong = (artist, title) => `${artist || '—'} / ${title}`;

async function attachAliasSongs({ Song, candidates, apply = false, log = () => {} }) {
  const report = {
    candidates: 0, renamed: 0, attachedOnly: [], refused: [], failed: [], raced: [],
    renames: [], sessionItemsAffected: 0, matchedAliases: new Set(), applied: !!apply,
  };
  const seen = new Set();
  // Canonical identities this run has already claimed, per user. Two aliases whose canonical
  // forms fold alike would each report collision_count = 0 (neither exists YET), so without
  // this the dry-run would promise two renames while --apply delivers one plus a 23505
  // fallback — a deterministic lie in the very number northwood signs off on.
  const claimed = new Set();

  for (const c of candidates) {
    if (seen.has(c.songUid)) continue;
    seen.add(c.songUid);
    report.candidates += 1;
    report.matchedAliases.add(identityKey(c.aliasTitle, c.aliasArtist));

    const typed = describeSong(c.songArtist, c.songTitle);
    const canonical = describeSong(c.canonArtist, c.canonTitle);
    const identify = extra => ({ songUid: c.songUid, userUid: c.userUid, song: typed, canon: canonical, ...extra });

    // Same refusal as the attach phase: two Catalog fiches for one fold is a broken canonical
    // index, and choosing between them at random is not a fix.
    if (c.matchCount > 1) {
      report.refused.push(identify({ reason: `ambigu — ${c.matchCount} entrées Catalog pour « ${canonical} »` }));
      continue;
    }

    // The alias points at an entry that is not in the Catalog: the seed phase has not run, or
    // the curator deleted the fiche. Creating it here would be the seed phase's job done
    // badly, in the wrong place, from a file that only carries a spelling.
    if (!c.catalogUid) {
      report.refused.push(identify({ reason: `entrée canonique absente du Catalog (${canonical})` }));
      continue;
    }

    const claimKey = `${c.userUid} ${identityKey(c.canonTitle, c.canonArtist)}`;
    const wouldCollide = c.collisionCount > 0 || claimed.has(claimKey);
    const collisionReason = claimed.has(claimKey)
      ? 'collision avec une autre renommée du même lot, pour le même utilisateur'
      : 'collision avec une autre chanson du même utilisateur';

    const provenance = { sourceCatalogUid: c.catalogUid, sourceCatalogSyncedAt: c.catalogUpdatedAt };
    // The where re-checks the TYPED spelling, not the canonical one: if the user edited the
    // song since the SELECT, it is no longer the row we decided about.
    const where = { uid: c.songUid, sourceCatalogUid: null, title: c.songTitle, artist: c.songArtist };

    const tallyRename = () => {
      claimed.add(claimKey);
      report.renamed += 1;
      report.renames.push({ userUid: c.userUid, before: typed, after: canonical });
      report.sessionItemsAffected += c.sessionItemCount || 0;
    };

    // Attach without touching the spelling. `silent` here for the same reason as 23.2: this
    // path writes provenance only, which is metadata about the row, not an edit of it.
    const attachWithoutRenaming = async reason => {
      const [affected = 0] = (await Song.update(provenance, { where, silent: true })) || [];
      if (!affected) { report.raced.push(identify({})); return; }
      report.attachedOnly.push(identify({ reason }));
      log(`      • rattachée sans renommage : ${typed}  (${reason})`);
    };

    if (!apply) {
      if (wouldCollide) report.attachedOnly.push(identify({ reason: collisionReason }));
      else tallyRename();
      continue;
    }

    try {
      if (wouldCollide) {
        await attachWithoutRenaming(collisionReason);
        continue;
      }

      const [affected = 0] = (await Song.update(
        { ...provenance, title: c.canonTitle, artist: c.canonArtist },
        // Deliberately NOT silent, unlike 23.2 and unlike the branch above: there we posted a
        // provenance marker, here the user's song genuinely changes. Freezing updatedAt would
        // make the row claim it had not been modified when it had.
        { where }
      )) || [];

      if (!affected) { report.raced.push(identify({})); continue; }
      tallyRename();
      // Printed as it lands, not only in the final report: this script is run by hand against
      // production, and a Ctrl-C would otherwise destroy the whole record of what was
      // rewritten while the writes stay committed.
      log(`      ✎ ${typed}  →  ${canonical}`);
    } catch (error) {
      if (error && error.name === 'SequelizeUniqueConstraintError') {
        // The pre-check said no collision, but the index disagreed: a concurrent run, or a
        // song the user created in between. The index is the authority. Fall back to the link
        // alone rather than failing the row — and NAME the constraint instead of assuming
        // which one fired.
        const constraint = (error.parent && error.parent.constraint) || error.constraint || 'contrainte inconnue';
        try {
          await attachWithoutRenaming(`collision détectée à l'écriture (${constraint})`);
        } catch (fallbackError) {
          report.failed.push(identify({ reason: `repli après conflit impossible : ${(fallbackError && fallbackError.message) || fallbackError}` }));
        }
        continue;
      }
      report.failed.push(identify({ reason: (error && error.message) || String(error) }));
    }
  }
  return report;
}

function formatAliasReport(report, { log = console.log } = {}) {
  // Every exception bucket names the song, the user and the canonical target. These are the
  // rows a human has to decide about; a bare UUID makes that impossible.
  const detail = (mark, e) => {
    log(`      ${mark} ${e.song || 'song'} → ${e.canon || '?'}  [user ${e.userUid}, song ${e.songUid}]`);
    if (e.reason) log(`          ${e.reason}`);
  };

  log('');
  log(report.applied ? '=== ALIAS APPLIQUÉ ===' : '=== DRY-RUN — aucune écriture ===');
  log(`  ${label('candidats')}: ${report.candidates}`);
  log(`  ${label(report.applied ? 'renommées' : 'à renommer')}: ${report.renamed}`);

  if (report.attachedOnly.length) {
    log(`  ${label('rattachées SANS renommage')}: ${report.attachedOnly.length}`);
    for (const a of report.attachedOnly) detail('•', a);
  }
  if (report.refused.length) {
    log(`  ${label('REFUSÉES')}: ${report.refused.length}`);
    for (const r of report.refused) detail('✗', r);
  }
  if (report.raced && report.raced.length) {
    log(`  ${label('NON ÉCRITES')}: ${report.raced.length}   ⚠️  modifiées depuis la sélection — l'alias n'a PAS été posé`);
    for (const r of report.raced) detail('✗', r);
  }
  if (report.failed.length) {
    log(`  ${label('ÉCHECS')}: ${report.failed.length}   ⚠️  le lot n'est PAS complet`);
    for (const f of report.failed) detail('✗', f);
  }

  if (report.renames.length) {
    const byUser = report.renames.reduce((acc, r) => {
      (acc[r.userUid] = acc[r.userUid] || []).push(r);
      return acc;
    }, {});
    log('  avant → après, par utilisateur :');
    for (const [userUid, list] of Object.entries(byUser)) {
      log(`      ${userUid} :`);
      for (const r of list) log(`          ${r.before}  →  ${r.after}`);
    }
  }

  // Only when it actually applies — an unconditional disclaimer is noise, and noise is what
  // makes real warnings invisible.
  if (report.sessionItemsAffected > 0) {
    log(`  ℹ️  ${report.sessionItemsAffected} entrée(s) d'historique des sessions gardent l'ANCIENNE orthographe.`);
    log("      SessionItems.label est un instantané volontaire (FR4) : ce n'est pas un bug, rien à corriger.");
  }
  log('');
}

// The alias run. Same skeleton as runAttach — counters, report, exit codes — because the two
// phases must not drift apart on the safety rails.
async function runAlias(db, opts) {
  const before = await countGuardedTables(db);
  console.log(`${label('Compteurs')}: ${formatCounts(before)}`);

  let parsed;
  try {
    parsed = parseAliasCsv(fs.readFileSync(ALIAS_FILE, 'utf8'));
  } catch (error) {
    console.error(error instanceof SeedFileError ? error.message : `Table d'alias illisible : ${ALIAS_FILE}\n${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${label('Alias')}: ${parsed.rows.length} exploitables, ${parsed.skipped.length} sautés`);
  for (const sk of parsed.skipped) console.log(`      • ${sk.aliasArtist || '—'} / ${sk.aliasTitle}  (${sk.reason})`);

  let report;
  try {
    const candidates = await selectAliasCandidates(db.sequelize, parsed.rows);
    report = await attachAliasSongs({ Song: db.Song, candidates, apply: opts.apply, log: console.log });
  } catch (error) {
    console.error(`Échec : ${error.message}`);
    process.exitCode = 1;
    return;
  }

  formatAliasReport(report);

  // An alias that matched nothing is the failure nobody notices: this table exists to fix a
  // handful of NAMED songs, so "0 matched" is not "nothing to do", it is a miss — a trailing
  // space, a curly apostrophe, an NFD accent. Without this block the run looks identical
  // whether 9 aliases worked or 4 did.
  const dead = parsed.rows.filter(r => !report.matchedAliases.has(identityKey(r.aliasTitle, r.aliasArtist)));
  if (dead.length) {
    console.error(`\n⚠️  ${dead.length} alias sur ${parsed.rows.length} n'ont trouvé AUCUNE chanson :`);
    for (const d of dead) console.error(`      • ${d.aliasArtist} / ${d.aliasTitle}   (visait « ${d.artist} / ${d.title} »)`);
    console.error("Vérifiez l'orthographe exacte telle qu'elle est stockée : espace finale, apostrophe courbe, accent NFD.");
  }

  if (opts.apply) {
    let after;
    try {
      after = await countGuardedTables(db);
    } catch (error) {
      // The writes ALREADY landed. Saying only "Échec" here would read as "nothing happened".
      console.error(`\n⚠️  ÉCRITURES APPLIQUÉES, mais le contrôle des compteurs est indisponible : ${(error && error.message) || error}`);
      console.error('Relisez le rapport ci-dessus : il liste ce qui a été écrit.');
      process.exitCode = 1;
      return;
    }
    console.log(`${label('Compteurs après')}: ${formatCounts(after)}`);
    const drift = diffCounts(before, after);
    if (drift.length) {
      console.error('\n⚠️  COMPTEURS MODIFIÉS — cette phase renomme, elle ne crée ni ne supprime :');
      for (const d of drift) console.error(`      ${d.table} : ${d.before} → ${d.after}`);
      console.error("Cause la plus probable : un utilisateur écrivait pendant l'exécution — vérifiez-le d'abord.");
      process.exitCode = 1;
      return;
    }
  }

  // A refusal, a raced row and a dead alias all mean « something did not land ». None of them
  // may exit 0 on a script that rewrites user data by hand.
  if (report.failed.length || report.refused.length || report.raced.length || dead.length) process.exitCode = 1;
  else if (!opts.apply) console.log('Relancez avec --apply pour écrire.');
}


// --- Enrich (story 23.5) -----------------------------------------------------
//
// Fills each DRAFT fiche from the single Song attached to it, and keeps the song's
// synchronisation marker honest. Born from the 23.4 rehearsal: the original export carried
// only artist + title, but the restored prod dump carries key, bpm, genre and links.
//
// It runs LAST (seed → attach → alias → enrich): it travels along the link attach and alias
// create, so no link means no source.
//
// ⚠️ WHAT THE RE-SYNC IS AND IS NOT (corrected after review — the first version of this
// comment claimed the opposite). `getSong` only emits the provenance block when the fiche is
// PUBLISHED (songcontroller.js:113), and this phase only touches DRAFTS — so no user can see
// a "newer version available" banner at this point, drift or no drift. Publishing later moves
// `updatedAt` past whatever we stamp here anyway (measured: drift goes 0 → 75 on publish).
// The re-sync therefore prevents NO banner. What it does is keep `sourceCatalogSyncedAt`
// TRUTHFUL: the copy really does reflect the fiche version it points at. The banner is 23.6's
// problem, at publication time.

// The closed list of what may travel from a personal Song into a SHARED fiche. Mirrors
// songcontroller's INTRINSIC_REFRESH_FIELDS + the three JSON fields it deep-clones, plus
// `album`. Personal fields — notes, tuning, instrument, lastPlayed — must never appear here.
//
// `pitchStandard` was in this list and has been REMOVED: the column carries `DEFAULT 440` in
// Postgres itself (verified — all 125 fiches hold 440), so it can never read as a hole and
// could never be filled. Keeping it meant a dead entry plus a special case to exclude it from
// the emptiness signal. Assumed consequence: a song tuned to 432 Hz does not propagate its
// pitch to the shared fiche; the curator sets it by hand.
const ENRICH_FIELDS = [
  'album', 'key', 'bpm', 'mode', 'timeSignature', 'durationSeconds',
  'language', 'genre', 'streamingLinks',
];

// Plain strings: trimmed before being written. `createCatalogEntry` trims album on the API
// path; skipping it here would let « C » and « C  » become two distinct facet chips, one of
// which matches nothing.
const ENRICH_TEXT_FIELDS = new Set(['album', 'key', 'timeSignature']);

// JSONB columns with no model-level validator on either side. A legacy row can hold a bare
// string where an array is expected; copied as-is into a shared fiche it would be skipped by
// the facet query (`jsonb_typeof(genre) = 'array'`) and never match a filter — enriched on
// paper, invisible in the app.
const ENRICH_SHAPE_GUARDS = {
  genre: value => Array.isArray(value),
  streamingLinks: value => typeof value === 'object' && value !== null,
};

// Column name is identical on both tables (verified against information_schema), so one
// mapping serves both sides.
const ENRICH_COLUMNS = {
  album: 'album', key: 'key', bpm: 'bpm', mode: 'mode', timeSignature: 'time_signature',
  durationSeconds: 'duration_seconds', language: 'language', genre: 'genre',
  streamingLinks: 'streaming_links',
};

// LEFT JOIN, not JOIN: a draft fiche attached to NO song must still come back so it can be
// counted rather than vanish. `count(s.uid)` (not `count(*)`) so the empty row a LEFT JOIN
// produces counts as zero.
//
// `c."updatedAt"` and `s.source_catalog_synced_at` come back so the re-sync can be checked
// even when there is nothing to fill — that is what makes it self-healing.
const ENRICH_CANDIDATES_SQL = `
  SELECT c.uid         AS catalog_uid,
         c.title       AS catalog_title,
         c.artist      AS catalog_artist,
         c."updatedAt" AS catalog_updated_at,
         ${ENRICH_FIELDS.map(f => `c.${ENRICH_COLUMNS[f]} AS catalog_${ENRICH_COLUMNS[f]}`).join(',\n         ')},
         s.uid                       AS song_uid,
         s.source_catalog_synced_at  AS song_synced_at,
         ${ENRICH_FIELDS.map(f => `s.${ENRICH_COLUMNS[f]} AS song_${ENRICH_COLUMNS[f]}`).join(',\n         ')},
         count(s.uid) OVER (PARTITION BY c.uid) AS song_count
    FROM "CatalogSongs" c
    LEFT JOIN "Songs" s ON s.source_catalog_uid = c.uid
   WHERE c.published_at IS NULL
   ORDER BY c.artist, c.title
`;

async function selectEnrichCandidates(sequelize) {
  const rows = await sequelize.query(ENRICH_CANDIDATES_SQL, { type: QueryTypes.SELECT });
  const pick = (row, prefix) => ENRICH_FIELDS.reduce((acc, f) => {
    acc[f] = row[`${prefix}_${ENRICH_COLUMNS[f]}`];
    return acc;
  }, {});
  return rows.map(r => ({
    catalogUid: r.catalog_uid,
    label: describeSong(r.catalog_artist, r.catalog_title),
    catalogUpdatedAt: r.catalog_updated_at,
    songUid: r.song_uid,
    songSyncedAt: r.song_synced_at,
    songCount: Number(r.song_count),
    catalog: pick(r, 'catalog'),
    song: pick(r, 'song'),
  }));
}

// A hole is anything carrying no information: null, undefined, a blank string, an empty array,
// an empty object. The blank string matters — a naive count during framing claimed 75 songs
// had a key or bpm when the real answer was 61, because `key = ''` is not NULL.
function isEmptyValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

// Reuse the shared normalizers rather than re-typing the rules. Bounds mirror
// songcontroller/catalogcontroller exactly.
const NORMALIZE_ENRICH = {
  bpm: value => normalizeInt(value, { min: 1, max: 1000 }),
  durationSeconds: normalizeDurationSeconds,
  language: normalizeLanguage,
  mode: normalizeMode,
};

function computeFill(catalogValues, songValues) {
  const fill = {};
  const dropped = [];

  for (const field of ENRICH_FIELDS) {
    if (!isEmptyValue(catalogValues[field])) continue; // the fiche wins: the curator validated it
    const raw = songValues[field];
    if (isEmptyValue(raw)) continue;                   // nothing to give

    const shapeOk = ENRICH_SHAPE_GUARDS[field];
    if (shapeOk && !shapeOk(raw)) {
      dropped.push({ field, reason: `forme inattendue (${Array.isArray(raw) ? 'array' : typeof raw}) : ${JSON.stringify(raw).slice(0, 60)}` });
      continue;
    }

    const normalize = NORMALIZE_ENRICH[field];
    let value = normalize ? normalize(raw) : raw;
    if (ENRICH_TEXT_FIELDS.has(field) && typeof value === 'string') value = value.trim();

    // The normalizers reject to null rather than clamp. Writing their return would fill a hole
    // with emptiness while counting it a success.
    if (isEmptyValue(value)) {
      dropped.push({ field, reason: `valeur refusée par la normalisation : ${JSON.stringify(raw)}` });
      continue;
    }

    // Deep clone: a shared fiche must never hold a reference into a user's row.
    fill[field] = (value !== null && typeof value === 'object') ? structuredClone(value) : value;
  }

  return { fill, dropped };
}

// The write-time guard: re-assert in SQL that every column we are about to fill is STILL
// empty. Without it, `fill` is computed from a snapshot taken before the batch started, and a
// value the curator typed mid-run would be silently overwritten — which the code comment and
// the tests both promised would never happen.
function buildFillGuard(fill) {
  const guard = {};
  for (const field of Object.keys(fill)) {
    guard[field] = ENRICH_TEXT_FIELDS.has(field) ? { [Op.or]: [null, ''] } : null;
  }
  return guard;
}

const needsResync = (catalogUpdatedAt, songSyncedAt) => {
  if (!catalogUpdatedAt) return false;
  if (songSyncedAt == null) return true;
  return new Date(catalogUpdatedAt) > new Date(songSyncedAt);
};

async function enrichCatalogEntries({ CatalogSong, Song, candidates, apply = false, log = () => {} }) {
  const report = {
    candidates: 0, enriched: 0, nothingToDo: 0, sourceEmpty: [], sourceRefused: [], withoutSource: 0,
    ambiguous: [], dropped: [], raced: [], failed: [], desynced: [], resynced: 0,
    fills: [], byField: {}, applied: !!apply,
  };
  const seen = new Set();

  for (const c of candidates) {
    if (seen.has(c.catalogUid)) continue; // an ambiguous fiche comes back as several rows
    seen.add(c.catalogUid);
    report.candidates += 1;

    if (c.songCount === 0 || !c.songUid) { report.withoutSource += 1; continue; }

    if (c.songCount > 1) {
      report.ambiguous.push({ catalogUid: c.catalogUid, label: c.label, songs: c.songCount });
      continue;
    }

    const { fill, dropped } = computeFill(c.catalog, c.song);
    const fields = Object.keys(fill);

    const classifyNoFill = () => {
      // Three very different reasons land here and must not share a label.
      if (dropped.length) {
        report.sourceRefused.push({ catalogUid: c.catalogUid, label: c.label, fields: dropped.map(d => d.field) });
      } else if (ENRICH_FIELDS.every(f => isEmptyValue(c.catalog[f]))) {
        report.sourceEmpty.push({ catalogUid: c.catalogUid, label: c.label });
      } else report.nothingToDo += 1;
    };

    // Keeps the marker truthful even when there is nothing to fill. This is what makes the
    // phase SELF-HEALING: a fiche written by a previous run whose re-sync failed has no holes
    // left, so the old code returned before ever reaching the re-sync and the song stayed
    // desynced for good.
    const resyncIfNeeded = async (catalogUpdatedAt) => {
      if (!needsResync(catalogUpdatedAt, c.songSyncedAt)) return true;
      if (!apply) { report.resynced += 1; return true; }
      const [synced = 0] = (await Song.update(
        { sourceCatalogSyncedAt: catalogUpdatedAt },
        { where: { uid: c.songUid, sourceCatalogUid: c.catalogUid }, silent: true }
      )) || [];
      if (!synced) {
        // The song was deleted or detached since the SELECT — or a second song was attached
        // and this one no longer matches. Either way the marker is NOT what we think.
        report.desynced.push({ catalogUid: c.catalogUid, label: c.label, songUid: c.songUid });
        return false;
      }
      report.resynced += 1;
      return true;
    };

    try {
      if (!fields.length) {
        classifyNoFill();
        await resyncIfNeeded(c.catalogUpdatedAt);
        continue;
      }

      for (const d of dropped) report.dropped.push({ label: c.label, ...d });

      if (!apply) {
        report.enriched += 1;
        report.fills.push({ label: c.label, fields });
        for (const f of fields) report.byField[f] = (report.byField[f] || 0) + 1;
        continue;
      }

      // `returning: true` rather than a re-read: a re-read answers "what is the timestamp
      // NOW", which may be a concurrent curator's write — stamping that on the song would
      // mark THEIR change as already seen. This answers "what did MY write produce".
      const [affected = 0, rows = []] = (await CatalogSong.update(fill, {
        where: { uid: c.catalogUid, publishedAt: null, ...buildFillGuard(fill) },
        returning: true,
      })) || [];

      if (!affected) {
        report.raced.push({ catalogUid: c.catalogUid, label: c.label });
        continue;
      }

      const written = rows && rows[0];
      if (!written || !written.updatedAt) {
        // The fiche IS written but we cannot know its new timestamp, so we cannot re-sync.
        // Say exactly that instead of laundering it into a generic failure.
        report.desynced.push({ catalogUid: c.catalogUid, label: c.label, songUid: c.songUid, reason: 'fiche écrite mais horodatage illisible' });
      } else if (!(await resyncIfNeeded(written.updatedAt))) {
        // enriched below anyway: the fiche WAS written. `desynced` carries the repair job.
      }

      report.enriched += 1;
      report.fills.push({ label: c.label, fields });
      for (const f of fields) report.byField[f] = (report.byField[f] || 0) + 1;
      log(`      ✎ ${c.label} — ${fields.join(', ')}`);
    } catch (error) {
      report.failed.push({ catalogUid: c.catalogUid, label: c.label, reason: (error && error.message) || String(error) });
    }
  }
  return report;
}

function formatEnrichReport(report, { log = console.log } = {}) {
  log('');
  log(report.applied ? '=== ENRICHISSEMENT APPLIQUÉ ===' : '=== DRY-RUN — aucune écriture ===');
  log(`  ${label('fiches brouillon')}: ${report.candidates}`);
  log(`  ${label(report.applied ? 'enrichies' : 'à enrichir')}: ${report.enriched}`);
  if (report.resynced) log(`  ${label(report.applied ? 'marqueurs resynchro.' : 'marqueurs à resynchro.')}: ${report.resynced}`);
  if (report.nothingToDo) log(`  ${label('rien à combler')}: ${report.nothingToDo}   (la fiche porte déjà tout ce que sa source peut donner)`);
  if (report.withoutSource) log(`  ${label('sans chanson source')}: ${report.withoutSource}   (normal : personne ne les a)`);

  if (report.sourceEmpty.length) {
    log(`  ${label('source SANS DONNÉE')}: ${report.sourceEmpty.length}   (à remplir à la main : personne n'a renseigné cette chanson)`);
    for (const e of report.sourceEmpty) log(`      • ${e.label}`);
  }
  if (report.sourceRefused.length) {
    log(`  ${label('source REFUSÉE')}: ${report.sourceRefused.length}   ⚠️  la donnée existe mais a été rejetée — réparable`);
    for (const e of report.sourceRefused) log(`      ✗ ${e.label}  (${e.fields.join(', ')})`);
  }
  if (report.ambiguous.length) {
    log(`  ${label('AMBIGUËS')}: ${report.ambiguous.length}   ⚠️  plusieurs chansons rattachées — refusées, pas arbitrées`);
    for (const a of report.ambiguous) log(`      ✗ ${a.label}  (${a.songs} chansons)  [${a.catalogUid}]`);
  }
  if (report.dropped.length) {
    log(`  ${label('valeurs ÉCARTÉES')}: ${report.dropped.length}`);
    for (const d of report.dropped) log(`      ✗ ${d.label} — ${d.field} : ${d.reason}`);
  }
  if (report.desynced.length) {
    log(`  ${label('DÉSYNCHRONISÉES')}: ${report.desynced.length}   ⚠️  fiche écrite, marqueur PAS reposé — relancez la phase, elle se répare`);
    for (const d of report.desynced) log(`      ✗ ${d.label}  [fiche ${d.catalogUid}, song ${d.songUid}]${d.reason ? ` — ${d.reason}` : ''}`);
  }
  if (report.raced.length) {
    log(`  ${label('non écrites')}: ${report.raced.length}   (fiche introuvable dans l'état attendu : publiée, supprimée ou remplie depuis la sélection)`);
    for (const r of report.raced) log(`      ✗ ${r.label}  [${r.catalogUid}]`);
  }
  if (report.failed.length) {
    log(`  ${label('ÉCHECS')}: ${report.failed.length}   ⚠️  le lot n'est PAS complet`);
    for (const f of report.failed) log(`      ✗ ${f.label} : ${f.reason}`);
  }

  const totals = Object.entries(report.byField).sort((a, b) => b[1] - a[1]);
  if (totals.length) {
    log('  ce qui remonte, par champ :');
    for (const [field, n] of totals) log(`      ${field.padEnd(18)}: ${n}`);
  }
  if (report.fills.length) {
    log('  détail par fiche :');
    for (const f of report.fills.slice(0, 25)) log(`      • ${f.label}  →  ${f.fields.join(', ')}`);
    if (report.fills.length > 25) log(`      … et ${report.fills.length - 25} de plus`);
  }
  log('');
}

// The enrich run. Same skeleton as the other phases — counters, report, exit codes.
async function runEnrich(db, opts) {
  const before = await countGuardedTables(db);
  console.log(`${label('Compteurs')}: ${formatCounts(before)}`);

  let report;
  try {
    const candidates = await selectEnrichCandidates(db.sequelize);
    report = await enrichCatalogEntries({
      CatalogSong: db.CatalogSong, Song: db.Song, candidates, apply: opts.apply, log: console.log,
    });
  } catch (error) {
    console.error(`Échec : ${error.message}`);
    process.exitCode = 1;
    return;
  }

  formatEnrichReport(report);

  if (opts.apply) {
    let after;
    try {
      after = await countGuardedTables(db);
    } catch (error) {
      console.error(`\n⚠️  ÉCRITURES APPLIQUÉES, mais le contrôle des compteurs est indisponible : ${(error && error.message) || error}`);
      console.error('Relisez le rapport ci-dessus : il liste ce qui a été écrit.');
      process.exitCode = 1;
      return;
    }
    console.log(`${label('Compteurs après')}: ${formatCounts(after)}`);
    const drift = diffCounts(before, after);
    if (drift.length) {
      console.error('\n⚠️  COMPTEURS MODIFIÉS — cette phase remplit des fiches, elle ne crée ni ne supprime :');
      for (const d of drift) console.error(`      ${d.table} : ${d.before} → ${d.after}`);
      console.error("Cause la plus probable : un utilisateur écrivait pendant l'exécution — vérifiez-le d'abord.");
      process.exitCode = 1;
      return;
    }
  }

  // Ambiguity is a STEADY state this phase deliberately refuses to resolve — two users owning
  // the same song will keep it non-zero on every future run. Exiting 1 on it would make 1 the
  // normal outcome, and an exit code that is always 1 carries no information. Only the
  // transient, actionable outcomes fail the run.
  if (report.ambiguous.length) {
    console.error(`\n⚠️  ${report.ambiguous.length} fiche(s) ambiguë(s) — état stable, non bloquant, mais à regarder.`);
  }
  if (report.failed.length || report.raced.length || report.desynced.length) process.exitCode = 1;
  if (!opts.apply) console.log('Relancez avec --apply pour écrire.');
}


// --- Entry point -----------------------------------------------------------

function parseArgs(argv) {
  const unknown = argv.filter(a => !KNOWN_FLAGS.includes(a) && !a.startsWith('--file=') && !a.startsWith('--phase='));
  if (unknown.length) {
    // `--file path` (space form) lands here too, which is the point: it used to be
    // ignored while --apply was honoured, writing the DEFAULT file to the database.
    throw new SeedFileError(`Argument non reconnu : ${unknown.join(' ')} — attendus : ${KNOWN_FLAGS.join(', ')}, --file=<chemin>, --phase=${PHASES.join('|')}`);
  }

  // A repeated flag was silently resolved first-wins: `--phase=seed --phase=attach` ran
  // the SEED phase. Same discipline as the unknown argument — never guess which one the
  // operator meant, especially when one of the two writes 82 rows.
  for (const prefix of ['--phase=', '--file=']) {
    const given = argv.filter(a => a.startsWith(prefix));
    if (given.length > 1) {
      throw new SeedFileError(`${prefix.slice(0, -1)} est spécifié plusieurs fois : ${given.join(' ')} — n'en gardez qu'un`);
    }
  }

  const phaseArg = argv.find(a => a.startsWith('--phase='));
  const phase = phaseArg ? phaseArg.slice('--phase='.length) : 'seed';
  if (!PHASES.includes(phase)) {
    // Never fall back to the default: `--phase=attachh` silently running the SEED phase
    // with --apply would write 82 rows the operator did not ask for.
    throw new SeedFileError(`Phase inconnue : « ${phase} » — attendues : ${PHASES.join(', ')}`);
  }

  const fileArg = argv.find(a => a.startsWith('--file='));
  if (fileArg && phase !== 'seed') {
    // Only the seed phase takes an input file. Honouring --apply while ignoring --file
    // would let the operator believe a different input was used.
    const why = phase === 'attach' ? 'cette phase lit la base, pas le CSV'
      : 'cette phase lit la table d’alias versionnée';
    throw new SeedFileError(`--file n’a pas de sens en --phase=${phase} : ${why}`);
  }

  return {
    apply: argv.includes('--apply'),
    allowRemote: argv.includes('--allow-remote'),
    phase,
    file: fileArg ? path.resolve(process.cwd(), fileArg.slice('--file='.length)) : DEFAULT_FILE,
  };
}

// The attach run, counters included. Kept out of main() so the argument/guard preamble
// stays one block and the two phases cannot drift apart on it.
async function runAttach(db, opts) {
  const before = await countGuardedTables(db);
  console.log(`${label('Compteurs')}: ${formatCounts(before)}`);

  let report;
  try {
    const candidates = await selectAttachCandidates(db.sequelize);
    report = await attachSongs({ Song: db.Song, candidates, apply: opts.apply });
  } catch (error) {
    // attachSongs guards every row, so reaching here means the SELECT itself failed.
    console.error(`Échec : ${error.message}`);
    process.exitCode = 1;
    return;
  }

  formatAttachReport(report);

  if (opts.apply) {
    // Invariant 1's safety net: this phase only ever UPDATEs two columns, so none of these
    // counts should move. Read it as a TRIPWIRE, not as proof — a live database moves on
    // its own (a user logging a practice adds a SongPlays row), and a delete plus an insert
    // in the same table would leave the total untouched. It catches a destructive edit to
    // this script; it does not certify the run.
    const after = await countGuardedTables(db);
    console.log(`${label('Compteurs après')}: ${formatCounts(after)}`);
    const drift = diffCounts(before, after);
    if (drift.length) {
      console.error('\n⚠️  COMPTEURS MODIFIÉS — ce script ne doit RIEN créer ni supprimer :');
      for (const d of drift) console.error(`      ${d.table} : ${d.before} → ${d.after}`);
      console.error("Cause la plus probable : un utilisateur écrivait pendant l'exécution — vérifiez-le d'abord.");
      console.error('Sinon, auditez la base : le script aurait créé ou supprimé des lignes.');
      process.exitCode = 1;
      return;
    }
  }

  // An apply where every selected candidate bounced wrote nothing at all. Failing here
  // stops it from reading as "already done" on the way out.
  const allBounced = opts.apply && report.candidates > 0 && report.attached === 0
    && report.raced.length === report.candidates;

  if (report.failed.length || report.ambiguous.length || allBounced) process.exitCode = 1;
  else if (!opts.apply) console.log('Relancez avec --apply pour écrire.');
}

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  const db = require('../models'); // required here so the unit tests never touch the DB layer

  // The ONLY trustworthy answer to « which database am I about to write to ».
  const cfg = (db.sequelize && db.sequelize.config) || {};
  const host = cfg.host || '';
  const target = `${host || '?'}:${cfg.port || '?'}/${cfg.database || '?'}`;

  console.log(`${label('Base')}: ${target}${isLocalHost(host) ? '  (locale)' : '  ⚠️ DISTANTE'}`);
  console.log(`${label('NODE_ENV')}: au démarrage ${NODE_ENV_AT_STARTUP === undefined ? '(non défini)' : `« ${NODE_ENV_AT_STARTUP} »`}, après chargement « ${process.env.NODE_ENV} »`);
  if (NODE_ENV_AT_STARTUP !== process.env.NODE_ENV) {
    console.log('                ⚠️ .env a modifié NODE_ENV APRÈS le choix de la connexion — ne vous fiez pas à cette valeur, fiez-vous à la base ci-dessus.');
  }
  console.log(`${label('Phase')}: ${opts.phase}${{ attach: '  (rattachement des Songs existantes)', alias: '  (alias + correction orthographique)', enrich: '  (enrichissement des fiches brouillon)' }[opts.phase] || '  (création des entrées Catalog)'}`);
  if (opts.phase === 'seed') console.log(`${label('Fichier')}: ${opts.file}`);
  console.log(`${label('Mode')}: ${opts.apply ? '--apply (ÉCRITURE)' : 'dry-run (aucune écriture)'}`);

  // The refusal, keyed on the resolved host. Measured reason (see header): a plain
  // `node scripts/seed-catalog.js --apply` resolves to the PRODUCTION database while
  // reporting NODE_ENV=development, so NODE_ENV cannot be the criterion.
  if (opts.apply && !isLocalHost(host) && !opts.allowRemote) {
    console.error(
      `\nREFUS : écriture demandée sur une base DISTANTE (${target}).\n` +
      "Si c'est bien la cible voulue, relancez avec --allow-remote.\n" +
      'Pour viser la base locale, exportez NODE_ENV=development — sans lui, la connexion\n' +
      'est construite depuis DATABASE_URL_PROD avant même que .env soit lu.'
    );
    process.exitCode = 1;
    await Promise.resolve(db.sequelize.close()).catch(() => {});
    return;
  }

  if (opts.phase === 'enrich') {
    try {
      await runEnrich(db, opts);
    } catch (error) {
      console.error(`Échec : ${(error && error.message) || error}`);
      process.exitCode = 1;
    } finally {
      await Promise.resolve(db.sequelize.close()).catch(() => {});
    }
    return;
  }

  if (opts.phase === 'alias') {
    try {
      await runAlias(db, opts);
    } catch (error) {
      console.error(`Échec : ${(error && error.message) || error}`);
      process.exitCode = 1;
    } finally {
      await Promise.resolve(db.sequelize.close()).catch(() => {});
    }
    return;
  }

  if (opts.phase === 'attach') {
    // The counters live OUTSIDE runAttach's inner try, and the one that matters most runs
    // AFTER the writes: a database error there would otherwise escape as a raw stack with
    // the pool still open, killing precisely the step meant to show nothing was destroyed.
    try {
      await runAttach(db, opts);
    } catch (error) {
      console.error(`Échec : ${(error && error.message) || error}`);
      process.exitCode = 1;
    } finally {
      await Promise.resolve(db.sequelize.close()).catch(() => {});
    }
    return;
  }

  let parsed;
  try {
    parsed = parseSeedCsv(fs.readFileSync(opts.file, 'utf8'));
  } catch (error) {
    console.error(error instanceof SeedFileError ? error.message : `Fichier illisible : ${opts.file}\n${error.message}`);
    process.exitCode = 1;
    await Promise.resolve(db.sequelize.close()).catch(() => {});
    return;
  }

  let report;
  try {
    report = await seedCatalog({ CatalogSong: db.CatalogSong, rows: parsed.rows, apply: opts.apply });
  } catch (error) {
    // seedCatalog guards every row, so reaching here means something outside the loop
    // broke. Still say so loudly rather than silently.
    console.error(`Échec : ${error.message}`);
    process.exitCode = 1;
    await Promise.resolve(db.sequelize.close()).catch(() => {});
    return;
  }

  report.total += parsed.skipped.length;
  report.skipped = parsed.skipped.concat(report.skipped);
  formatReport(report);

  // A run where rows failed is NOT a success, whatever the report looks like.
  if (report.failed.length) process.exitCode = 1;
  else if (!opts.apply) console.log('Relancez avec --apply pour écrire.');

  await Promise.resolve(db.sequelize.close()).catch(() => {});
}

module.exports = {
  parseSeedCsv, seedCatalog, identityKey, formatReport, parseArgs, isLocalHost, SeedFileError, main,
  // Story 23.2 — attach phase
  ATTACH_CANDIDATES_SQL, selectAttachCandidates, attachSongs, countGuardedTables, diffCounts,
  formatAttachReport, runAttach,
  // Story 23.3 — alias phase
  ALIAS_FILE, ALIAS_BIND_COLUMNS, ALIAS_BIND_FIELDS, parseAliasCsv, buildAliasCandidatesSql, selectAliasCandidates, attachAliasSongs,
  formatAliasReport, runAlias,
  // Story 23.5 — enrich phase
  ENRICH_FIELDS, ENRICH_TEXT_FIELDS, ENRICH_COLUMNS, buildFillGuard, needsResync, ENRICH_CANDIDATES_SQL, selectEnrichCandidates, computeFill,
  enrichCatalogEntries, formatEnrichReport, runEnrich,
};

if (require.main === module) {
  // Without this, anything escaping main surfaces as an unhandled rejection — a raw stack
  // with no exit code, on a script whose whole job is to be legible while it writes to
  // users' rows.
  main(process.argv.slice(2)).catch(error => {
    console.error(`Échec inattendu : ${(error && error.stack) || error}`);
    process.exitCode = 1;
  });
}
