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
    expect(report.skipped[0].reason).toBe('conflit d’unicité');
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
