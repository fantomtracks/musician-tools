'use strict';

// Story 23.1 — seed the shared Catalog from the songs already entered in production.
//
// MANUAL one-off script (epic 23, decision C). It is deliberately NOT wired to the
// deploy: `release_command` runs migrations only, and a content seed has no business in
// the schema pipeline. Run it by hand, dry-run first.
//
//   cd backend
//   NODE_ENV=development node scripts/seed-catalog.js              # dry-run (default)
//   NODE_ENV=development node scripts/seed-catalog.js --apply      # writes
//   NODE_ENV=development node scripts/seed-catalog.js --file=seed/other.csv
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
const { fn, col, where: whereFn, Op } = require('sequelize');

const DEFAULT_FILE = path.join(__dirname, 'seed', 'catalog-seed.csv');
const KNOWN_FLAGS = ['--apply', '--allow-remote'];
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

// --- Entry point -----------------------------------------------------------

function parseArgs(argv) {
  const unknown = argv.filter(a => !KNOWN_FLAGS.includes(a) && !a.startsWith('--file='));
  if (unknown.length) {
    // `--file path` (space form) lands here too, which is the point: it used to be
    // ignored while --apply was honoured, writing the DEFAULT file to the database.
    throw new SeedFileError(`Argument non reconnu : ${unknown.join(' ')} — attendus : ${KNOWN_FLAGS.join(', ')}, --file=<chemin>`);
  }
  const fileArg = argv.find(a => a.startsWith('--file='));
  return {
    apply: argv.includes('--apply'),
    allowRemote: argv.includes('--allow-remote'),
    file: fileArg ? path.resolve(process.cwd(), fileArg.slice('--file='.length)) : DEFAULT_FILE,
  };
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

  console.log(`Base          : ${target}${isLocalHost(host) ? '  (locale)' : '  ⚠️ DISTANTE'}`);
  console.log(`NODE_ENV      : au démarrage ${NODE_ENV_AT_STARTUP === undefined ? '(non défini)' : `« ${NODE_ENV_AT_STARTUP} »`}, après chargement « ${process.env.NODE_ENV} »`);
  if (NODE_ENV_AT_STARTUP !== process.env.NODE_ENV) {
    console.log('                ⚠️ .env a modifié NODE_ENV APRÈS le choix de la connexion — ne vous fiez pas à cette valeur, fiez-vous à la base ci-dessus.');
  }
  console.log(`Fichier       : ${opts.file}`);
  console.log(opts.apply ? 'Mode          : --apply (ÉCRITURE)' : 'Mode          : dry-run (aucune écriture)');

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

module.exports = { parseSeedCsv, seedCatalog, identityKey, formatReport, parseArgs, isLocalHost, SeedFileError, main };

if (require.main === module) {
  main(process.argv.slice(2));
}
