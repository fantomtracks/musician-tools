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

const DEFAULT_FILE = path.join(__dirname, 'seed', 'catalog-seed.csv');
const KNOWN_FLAGS = ['--apply', '--allow-remote'];
const PHASES = ['seed', 'attach'];
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
  if (fileArg && phase === 'attach') {
    // The attach phase reads the database, not the CSV. Honouring --apply while ignoring
    // --file would let the operator believe a different input was used.
    throw new SeedFileError('--file n’a pas de sens en --phase=attach : cette phase lit la base, pas le CSV');
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
  console.log(`${label('Phase')}: ${opts.phase}${opts.phase === 'attach' ? '  (rattachement des Songs existantes)' : '  (création des entrées Catalog)'}`);
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
