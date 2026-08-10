// Story 23.1 — seed script for the shared Catalog. Models are mocked
// (jest.mock('../models')) per the project's backend test convention — no real DB.
//
// What these tests deliberately DO exercise: the parsing of the seed file, the
// decision to create or skip, and the fact that dry-run writes nothing. What they
// CANNOT exercise: that the skip uses the same folded key as the functional unique
// index `catalog_songs_title_artist_ci` — that is SQL, validated on the dev DB in
// story 23.4. The unit test asserts the shape of the WHERE clause instead.
jest.mock('../models', () => ({
  CatalogSong: { findOne: jest.fn(), create: jest.fn() },
  sequelize: { close: jest.fn() },
}));

const { Op } = require('sequelize');
const { CatalogSong } = require('../models');
const { parseSeedCsv, seedCatalog } = require('../scripts/seed-catalog');

beforeEach(() => {
  jest.clearAllMocks();
  CatalogSong.findOne.mockResolvedValue(null);
  CatalogSong.create.mockImplementation(async values => ({ uid: 'new-uid', ...values }));
});

describe('parseSeedCsv', () => {
  test('reads artist,title rows and drops the header', () => {
    const { rows, skipped } = parseSeedCsv('artist,title\nAC/DC,Back in Black\nMuse,Hysteria\n');
    expect(rows).toEqual([
      { artist: 'AC/DC', title: 'Back in Black' },
      { artist: 'Muse', title: 'Hysteria' },
    ]);
    expect(skipped).toHaveLength(0);
  });

  test('a quoted field containing a comma stays one field', () => {
    const { rows } = parseSeedCsv('artist,title\n"Emerson, Lake & Palmer",Lucky Man\n');
    expect(rows).toEqual([{ artist: 'Emerson, Lake & Palmer', title: 'Lucky Man' }]);
  });

  test('an empty title is invalid (the model forbids it); an empty artist is legal', () => {
    const { rows, skipped } = parseSeedCsv('artist,title\nSomeone,\n,Untitled Instrumental\n');
    expect(rows).toEqual([{ artist: null, title: 'Untitled Instrumental' }]);
    expect(skipped).toEqual([{ artist: 'Someone', title: '', reason: 'ligne vide ou incomplète' }]);
  });

  test('blank lines are ignored, not counted as skipped', () => {
    const { rows, skipped } = parseSeedCsv('artist,title\n\nMuse,Hysteria\n\n');
    expect(rows).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  test('a duplicate inside the file is kept once and reported', () => {
    const { rows, skipped } = parseSeedCsv('artist,title\nMuse,Hysteria\nMUSE,hysteria\n');
    expect(rows).toHaveLength(1);
    expect(skipped).toEqual([{ artist: 'MUSE', title: 'hysteria', reason: 'doublon interne au fichier' }]);
  });
});

describe('seedCatalog', () => {
  const rows = [{ artist: 'Muse', title: 'Hysteria' }, { artist: 'Tool', title: 'Fear Inoculum' }];

  test('dry-run is the safe path: it never calls create', async () => {
    const report = await seedCatalog({ CatalogSong, rows, apply: false });
    expect(CatalogSong.create).not.toHaveBeenCalled();
    expect(report.created).toBe(2);
    expect(report.applied).toBe(false);
  });

  test('apply creates every new entry as a DRAFT and nothing else', async () => {
    await seedCatalog({ CatalogSong, rows, apply: true });
    expect(CatalogSong.create).toHaveBeenCalledTimes(2);
    expect(CatalogSong.create).toHaveBeenCalledWith({ title: 'Hysteria', artist: 'Muse', publishedAt: null });
    // No key/bpm/mode/... invented from thin air.
    expect(Object.keys(CatalogSong.create.mock.calls[0][0]).sort()).toEqual(['artist', 'publishedAt', 'title']);
  });

  test('an entry already in the Catalog is skipped, never updated', async () => {
    CatalogSong.findOne.mockImplementation(async () => ({ uid: 'existing' }));
    const report = await seedCatalog({ CatalogSong, rows, apply: true });
    expect(CatalogSong.create).not.toHaveBeenCalled();
    expect(report.created).toBe(0);
    expect(report.skipped).toHaveLength(2);
    expect(report.skipped[0].reason).toBe('déjà au Catalog');
  });

  test('a draft counts as existing too — the unique index covers drafts (19.6 note is wrong)', async () => {
    CatalogSong.findOne.mockResolvedValueOnce({ uid: 'a-draft', publishedAt: null }).mockResolvedValue(null);
    const report = await seedCatalog({ CatalogSong, rows, apply: true });
    expect(report.created).toBe(1);
    expect(report.skipped[0].reason).toBe('déjà au Catalog');
  });

  test('a unique-constraint race on one row does not abort the batch', async () => {
    const conflict = Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError' });
    CatalogSong.create.mockRejectedValueOnce(conflict);
    const report = await seedCatalog({ CatalogSong, rows, apply: true });
    expect(CatalogSong.create).toHaveBeenCalledTimes(2); // the second row still ran
    expect(report.created).toBe(1);
    // Named since the review: a violation on some OTHER unique column must not hide
    // inside a benign-looking tally.
    expect(report.skipped[0].reason).toMatch(/^conflit d’unicité \(/);
  });

  test('any OTHER error on a row is surfaced, not swallowed as a skip', async () => {
    CatalogSong.create.mockRejectedValueOnce(new Error('connection reset'));
    const report = await seedCatalog({ CatalogSong, rows, apply: true });
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0].reason).toMatch(/connection reset/);
    expect(report.created).toBe(1); // the batch continued
  });

  test('the existence lookup folds title AND artist the way the unique index does', async () => {
    await seedCatalog({ CatalogSong, rows: [{ artist: 'AC/DC', title: 'Back in Black' }], apply: false });
    const [title, artist] = CatalogSong.findOne.mock.calls[0][0].where[Op.and];

    // lower(title) = <lowercased title>
    expect(title.attribute.fn).toBe('lower');
    expect(title.attribute.args[0].col).toBe('title');
    expect(title.logic).toBe('back in black');

    // coalesce(lower(artist), '') = <lowercased artist>
    expect(artist.attribute.fn).toBe('coalesce');
    expect(artist.attribute.args[0].fn).toBe('lower');
    expect(artist.logic).toBe('ac/dc');

    // NO f_unaccent anywhere: accents are part of the identity
    // (« Hôtel California » ≠ « Hotel California »), unlike the LIKE search of the browse.
    expect(JSON.stringify([title.attribute, artist.attribute])).not.toContain('f_unaccent');
  });

  test('an entry without an artist folds to the empty string, like COALESCE does', async () => {
    await seedCatalog({ CatalogSong, rows: [{ artist: null, title: 'Untitled' }], apply: false });
    const [, artist] = CatalogSong.findOne.mock.calls[0][0].where[Op.and];
    expect(artist.logic).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Review 23.1 — the guards a data script needs, and that the first version lacked
// ---------------------------------------------------------------------------

const { parseArgs, formatReport, SeedFileError, identityKey } = require('../scripts/seed-catalog');

describe('parseSeedCsv — refuse rather than guess', () => {
  test('a leading blank line does NOT turn the header into a Catalog entry', () => {
    const { rows, skipped } = parseSeedCsv('\nartist,title\nMuse,Hysteria\n');
    expect(rows).toEqual([{ artist: 'Muse', title: 'Hysteria' }]);
    expect(skipped).toHaveLength(0);
  });

  test('a header in the wrong column order aborts instead of seeding 82 rows backwards', () => {
    expect(() => parseSeedCsv('title,artist\nHysteria,Muse\n')).toThrow(SeedFileError);
    expect(() => parseSeedCsv('title,artist\nHysteria,Muse\n')).toThrow(/artist,title/);
  });

  test('a missing header aborts — the first data row must not be eaten as one', () => {
    expect(() => parseSeedCsv('Muse,Hysteria\n')).toThrow(SeedFileError);
  });

  test('an unterminated quote aborts instead of fabricating a row and losing another', () => {
    expect(() => parseSeedCsv('artist,title\n"Emerson,\nLake,Lucky Man\n')).toThrow(/Guillemet non fermé/);
  });

  test('an empty file aborts', () => {
    expect(() => parseSeedCsv('\n\n')).toThrow(/aucun en-tête/);
  });

  test('a BOM does not corrupt the header detection', () => {
    const { rows } = parseSeedCsv('﻿artist,title\nMuse,Hysteria\n');
    expect(rows).toEqual([{ artist: 'Muse', title: 'Hysteria' }]);
  });

  test('CRLF endings are handled', () => {
    const { rows } = parseSeedCsv('artist,title\r\nMuse,Hysteria\r\n');
    expect(rows).toEqual([{ artist: 'Muse', title: 'Hysteria' }]);
  });

  test('the two Unicode forms of the same accent are one entry, not two', () => {
    // "Beyoncé" composed (NFC) then decomposed (NFD) — Postgres lower() compares bytes,
    // so without normalisation these would become two Catalog rows.
    const { rows, skipped } = parseSeedCsv('artist,title\nBeyoncé,Halo\nBeyoncé,Halo\n');
    expect(rows).toHaveLength(1);
    expect(skipped[0].reason).toBe('doublon interne au fichier');
  });
});

describe('identityKey — the separator must not be a character a song can contain', () => {
  test.each([
    ['pipe', 'a|b', 'c', 'a', 'b|c'],
    ['space', 'a b', 'c', 'a', 'b c'],      // ordinary titles — the nastiest case
    ['dash', 'a-b', 'c', 'a', 'b-c'],
    ['comma', 'a,b', 'c', 'a', 'b,c'],
  ])('a %s in a title cannot collide two different pairs', (_label, t1, a1, t2, a2) => {
    expect(identityKey(t1, a1)).not.toBe(identityKey(t2, a2));
  });
});

describe('parseArgs — an unrecognised argument is refused, never ignored', () => {
  test('the space form of --file is rejected instead of silently seeding the default file', () => {
    expect(() => parseArgs(['--file', 'seed/other.csv', '--apply'])).toThrow(/Argument non reconnu/);
  });

  test('a typo in a flag is refused', () => {
    expect(() => parseArgs(['--aply'])).toThrow(/Argument non reconnu/);
  });

  test('the documented forms are accepted, and dry-run is the default', () => {
    expect(parseArgs([]).apply).toBe(false);
    expect(parseArgs(['--apply']).apply).toBe(true);
    expect(parseArgs(['--apply', '--allow-remote']).allowRemote).toBe(true);
    expect(parseArgs(['--file=seed/x.csv']).file).toMatch(/seed\/x\.csv$/);
  });
});

describe('formatReport — the numbers an operator acts on', () => {
  const capture = report => {
    const lines = [];
    formatReport(report, { log: l => lines.push(l) });
    return lines.join('\n');
  };

  test('a batch with failures shouts, and never reads as a clean success', () => {
    const out = capture({
      total: 2, created: 0, applied: true, skipped: [],
      failed: [{ artist: 'Muse', title: 'Hysteria', reason: 'connection reset' }],
    });
    expect(out).toMatch(/ÉCHECS\s+: 1/);
    expect(out).toMatch(/le lot n'est PAS complet/);
    expect(out).toMatch(/Hysteria : connection reset/);
  });

  test('database-side skips are shown first, not pushed past the cutoff by parse noise', () => {
    const parseNoise = Array.from({ length: 25 }, (_, i) => ({ artist: `x${i}`, title: '', reason: 'ligne vide ou incomplète' }));
    const out = capture({
      total: 26, created: 0, applied: false, failed: [],
      skipped: parseNoise.concat([{ artist: 'Muse', title: 'Hysteria', reason: 'déjà au Catalog' }]),
    });
    expect(out).toMatch(/Muse — Hysteria {2}\(déjà au Catalog\)/);
  });

  test('dry-run says plainly that nothing was written', () => {
    expect(capture({ total: 1, created: 1, applied: false, skipped: [], failed: [] }))
      .toMatch(/DRY-RUN — aucune écriture/);
  });
});

describe('seedCatalog — a read error mid-batch does not discard the report', () => {
  test('the rows already created are still reported', async () => {
    CatalogSong.findOne
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('connection terminated'));
    const report = await seedCatalog({
      CatalogSong,
      rows: [{ artist: 'Muse', title: 'Hysteria' }, { artist: 'Tool', title: 'Fear Inoculum' }],
      apply: true,
    });
    expect(report.created).toBe(1);                       // the first row DID land
    expect(report.failed[0].reason).toMatch(/connection terminated/);
  });

  test('a unique-constraint error names the constraint instead of assuming which one fired', async () => {
    const conflict = Object.assign(new Error('dup'), {
      name: 'SequelizeUniqueConstraintError',
      parent: { constraint: 'catalog_songs_title_artist_ci' },
    });
    CatalogSong.create.mockRejectedValueOnce(conflict);
    const report = await seedCatalog({ CatalogSong, rows: [{ artist: 'Muse', title: 'Hysteria' }], apply: true });
    expect(report.skipped[0].reason).toBe('conflit d’unicité (catalog_songs_title_artist_ci)');
  });
});
