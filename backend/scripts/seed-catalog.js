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
// ⚠️ NODE_ENV UNSET MEANS PRODUCTION in this project (models/index.js:8,
// config/config.js:3). A script launched without it would write to the PROD database.
// That is why main() prints the environment and the database host before doing
// anything, and why --apply is required to write.
//
// Entries are created as DRAFTS (publishedAt = null, decision A): a seeded entry only
// carries title + artist, and if it were published a user clicking "Refresh" would have
// their key/BPM overwritten with nulls (refreshSongFromCatalog writes `catalog[f] ?? null`).
// The link lights up on its own once the curator enriches and publishes the entry.

const fs = require('node:fs');
const path = require('node:path');
const { fn, col, where: whereFn, Op } = require('sequelize');

const DEFAULT_FILE = path.join(__dirname, 'seed', 'catalog-seed.csv');

// --- CSV -------------------------------------------------------------------

// Minimal RFC4180-ish splitter: enough for two columns with quoted fields, and it does
// not drag a dependency in for 82 lines. A naive split(',') would break on a quoted
// artist like "Emerson, Lake & Palmer".
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
  out.push(field);
  return out.map(f => f.trim());
}

// The IDENTITY fold — the one the unique index uses: lower() on both parts, an absent
// artist collapsing to ''. Accents are KEPT on purpose: the index does not unaccent, so
// « Hôtel California » and « Hotel California » are two distinct entries. The f_unaccent
// fold (catalogcontroller.foldedLike) is for LIKE SEARCH only — using it here would
// skip a legitimate creation.
function identityKey(title, artist) {
  return `${String(title || '').toLowerCase()}|${String(artist || '').toLowerCase()}`;
}

function parseSeedCsv(text) {
  const rows = [];
  const skipped = [];
  const seen = new Set();

  const lines = String(text).split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    if (!raw.trim()) continue;                       // blank line: not a skip, just noise
    if (index === 0 && /^\s*artist\s*,\s*title\s*$/i.test(raw)) continue; // header

    const [artistRaw = '', titleRaw = ''] = splitCsvLine(raw);
    const title = titleRaw.trim();
    const artist = artistRaw.trim();

    // title is NOT NULL on the model; artist IS nullable.
    if (!title) { skipped.push({ artist, title, reason: 'ligne vide ou incomplète' }); continue; }

    const key = identityKey(title, artist);
    if (seen.has(key)) { skipped.push({ artist, title, reason: 'doublon interne au fichier' }); continue; }
    seen.add(key);

    rows.push({ artist: artist || null, title });
  }
  return { rows, skipped };
}

// --- Seeding ---------------------------------------------------------------

// Same folded lookup as catalogcontroller.findExistingByTitleArtist — deliberately the
// same shape so the skip and the unique index can never disagree.
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
    const existing = await findExisting(CatalogSong, title, artist);
    if (existing) {
      // A DRAFT counts as existing: the canonical index is global and covers drafts
      // (migration 20260716000100 — the story 19.6 note claiming it is partial is wrong).
      report.skipped.push({ artist, title, reason: 'déjà au Catalog' });
      continue;
    }

    if (!apply) { report.created += 1; continue; } // dry-run: counted, never written

    try {
      await CatalogSong.create({ title, artist, publishedAt: null });
      report.created += 1;
    } catch (error) {
      if (error && error.name === 'SequelizeUniqueConstraintError') {
        // Lost a race with a concurrent run. Not a failure — the row exists now.
        report.skipped.push({ artist, title, reason: 'conflit d’unicité' });
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
  log(`  ${report.applied ? 'créées' : 'à créer'}${report.applied ? '          ' : '        '}: ${report.created}`);
  log(`  sautées         : ${report.skipped.length}`);
  for (const [reason, count] of Object.entries(byReason)) log(`      ${reason} : ${count}`);
  if (report.failed.length) {
    log(`  ÉCHECS          : ${report.failed.length}`);
    for (const f of report.failed) log(`      ✗ ${f.artist || '—'} — ${f.title} : ${f.reason}`);
  }
  const shown = report.skipped.slice(0, 20);
  if (shown.length) {
    log('  détail des sautées :');
    for (const s of shown) log(`      • ${s.artist || '—'} — ${s.title}  (${s.reason})`);
    if (report.skipped.length > shown.length) log(`      … et ${report.skipped.length - shown.length} de plus`);
  }
  log('');
}

// --- Entry point -----------------------------------------------------------

async function main(argv) {
  const apply = argv.includes('--apply');
  const fileArg = argv.find(a => a.startsWith('--file='));
  const file = fileArg ? path.resolve(process.cwd(), fileArg.slice('--file='.length)) : DEFAULT_FILE;

  // Loaded here, not at module scope, so the unit tests never touch the DB layer.
  const db = require('../models');
  const env = process.env.NODE_ENV || 'production';
  // Never print credentials — host and database name are enough to know what we target.
  let target = 'inconnu';
  try {
    const opts = db.sequelize.options || {};
    target = `${opts.host || '?'}/${db.sequelize.config ? db.sequelize.config.database : '?'}`;
  } catch { /* purely informational */ }

  console.log(`Environnement : ${env}   Base : ${target}`);
  console.log(`Fichier       : ${file}`);
  console.log(apply ? 'Mode          : --apply (ÉCRITURE)' : 'Mode          : dry-run (aucune écriture)');
  if (env === 'production') {
    console.log('⚠️  NODE_ENV vaut « production » — vérifiez que c’est bien la cible voulue.');
  }

  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    console.error(`Fichier illisible : ${file}\n${error.message}`);
    process.exitCode = 1;
    return;
  }

  const { rows, skipped: parseSkipped } = parseSeedCsv(text);
  try {
    const report = await seedCatalog({ CatalogSong: db.CatalogSong, rows, apply });
    report.total += parseSkipped.length;
    report.skipped = parseSkipped.concat(report.skipped);
    formatReport(report);
    if (!apply) console.log('Relancez avec --apply pour écrire.');
  } catch (error) {
    console.error(`Échec : ${error.message}`);
    process.exitCode = 1;
  } finally {
    await db.sequelize.close().catch(() => {});
  }
}

module.exports = { parseSeedCsv, seedCatalog, identityKey, formatReport, main };

if (require.main === module) {
  main(process.argv.slice(2));
}
