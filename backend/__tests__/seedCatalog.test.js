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

const { Op, QueryTypes } = require('sequelize');
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

// --- Story 23.2 — attach phase -----------------------------------------------
//
// This phase writes into the users' PERSONAL Songs, not into a shared pool, so the
// tests below are weighted towards proving what the script does NOT do: it does not
// touch a Song that already has a source, it does not write any column beyond the two
// provenance ones, and it refuses an ambiguous match instead of picking one.
//
// What they cannot exercise: that the SQL fold agrees with the functional index
// `songs_user_uid_title_artist_ci`. That is Postgres, validated on the dev DB in 23.4.
// The unit test asserts the shape of the statement instead.
const {
  ATTACH_CANDIDATES_SQL, selectAttachCandidates, attachSongs,
  countGuardedTables, diffCounts, formatAttachReport,
} = require('../scripts/seed-catalog');

const makeSong = () => ({ update: jest.fn().mockResolvedValue([1]) });

const candidate = over => ({
  songUid: 'song-1', userUid: 'user-a', songTitle: 'Hysteria', songArtist: 'Muse',
  catalogUid: 'cat-1', catalogUpdatedAt: new Date('2026-08-01T10:00:00Z'), matchCount: 1, ...over,
});

describe('parseArgs — la phase', () => {
  test('la phase par défaut est seed, le comportement historique', () => {
    expect(parseArgs([]).phase).toBe('seed');
  });

  test('--phase=attach est accepté', () => {
    expect(parseArgs(['--phase=attach', '--apply']).phase).toBe('attach');
  });

  test('une phase inconnue est refusée, jamais rabattue sur seed', () => {
    // Assertion sur le message SPÉCIFIQUE : le message générique d’argument inconnu
    // contient déjà « --phase=seed|attach », donc /[Pp]hase/ passerait même si le garde
    // disparaissait de la liste blanche.
    expect(() => parseArgs(['--phase=attachh'])).toThrow(/Phase inconnue/);
    expect(() => parseArgs(['--phase='])).toThrow(/Phase inconnue/);
  });

  test('--file n’a aucun sens en phase attach : refusé plutôt qu’ignoré', () => {
    expect(() => parseArgs(['--phase=attach', '--file=seed/x.csv'])).toThrow(/n’a pas de sens en --phase=attach/);
  });

  test('un drapeau répété est refusé, jamais résolu premier-gagnant', () => {
    expect(() => parseArgs(['--phase=seed', '--phase=attach'])).toThrow(/spécifié plusieurs fois/);
    expect(() => parseArgs(['--file=a.csv', '--file=b.csv'])).toThrow(/spécifié plusieurs fois/);
  });
});

describe('ATTACH_CANDIDATES_SQL — le rapprochement se fait en SQL, pas en JS', () => {
  test('il ne sélectionne que les Songs sans source', () => {
    expect(ATTACH_CANDIDATES_SQL).toMatch(/s\.source_catalog_uid IS NULL/);
  });

  test('il joint sur l’expression de l’index d’identité, accents conservés', () => {
    expect(ATTACH_CANDIDATES_SQL).toMatch(/lower\(s\.title\)\s*=\s*lower\(c\.title\)/);
    expect(ATTACH_CANDIDATES_SQL).toMatch(/coalesce\(lower\(s\.artist\), ''\)\s*=\s*coalesce\(lower\(c\.artist\), ''\)/);
    expect(ATTACH_CANDIDATES_SQL).not.toMatch(/unaccent/i); // that fold is for SEARCH only, whatever it is named
  });

  test('il compte les entrées Catalog en concurrence pour détecter l’ambiguïté', () => {
    expect(ATTACH_CANDIDATES_SQL).toMatch(/count\(\*\) OVER \(PARTITION BY s\.uid\)/i);
  });

  test('il ne filtre pas sur published_at : les entrées seedées sont des brouillons', () => {
    expect(ATTACH_CANDIDATES_SQL).not.toMatch(/published/i); // catches published_at AND publishedAt
  });

  test('selectAttachCandidates normalise les colonnes SQL et le compte bigint (string en pg)', async () => {
    const sequelize = {
      query: jest.fn().mockResolvedValue([{
        song_uid: 's1', user_uid: 'u1', song_title: 'Hysteria', song_artist: 'Muse',
        catalog_uid: 'c1', catalog_updated_at: '2026-08-01T10:00:00.000Z', match_count: '2',
      }]),
    };
    const rows = await selectAttachCandidates(sequelize);
    expect(rows).toEqual([{
      songUid: 's1', userUid: 'u1', songTitle: 'Hysteria', songArtist: 'Muse', catalogUid: 'c1',
      catalogUpdatedAt: '2026-08-01T10:00:00.000Z', matchCount: 2,
    }]);
    // QueryTypes.SELECT n’est pas décoratif : en RAW, Sequelize renvoie [rows, metadata].
    expect(sequelize.query).toHaveBeenCalledWith(ATTACH_CANDIDATES_SQL, { type: QueryTypes.SELECT });
  });

  test('une ligne inexploitable fait échouer la sélection au lieu d’aller jusqu’à l’UPDATE', async () => {
    // Ce que produirait un QueryTypes manquant : des champs undefined et matchCount NaN.
    // NaN > 1 est FAUX, donc sans ce garde la ligne passait la sonde d’ambiguïté et
    // arrivait à update({ sourceCatalogUid: undefined }, { where: { uid: undefined } }).
    const sequelize = { query: jest.fn().mockResolvedValue([{ song_uid: undefined, match_count: undefined }]) };
    await expect(selectAttachCandidates(sequelize)).rejects.toThrow(/inexploitable/);
  });
});

describe('attachSongs — ce qui est écrit, et rien d’autre', () => {
  test('le dry-run n’écrit rien mais compte ce qui serait rattaché', async () => {
    const Song = makeSong();
    const report = await attachSongs({ Song, candidates: [candidate()], apply: false });
    expect(Song.update).not.toHaveBeenCalled();
    expect(report.attached).toBe(1);
    expect(report.applied).toBe(false);
  });

  test('l’update ne porte QUE sur les deux colonnes de provenance', async () => {
    const Song = makeSong();
    await attachSongs({ Song, candidates: [candidate()], apply: true });
    const [values] = Song.update.mock.calls[0];
    expect(Object.keys(values).sort()).toEqual(['sourceCatalogSyncedAt', 'sourceCatalogUid']);
  });

  test('syncedAt vaut le updatedAt de l’entrée Catalog, pas l’heure du script', async () => {
    const Song = makeSong();
    const catalogUpdatedAt = new Date('2026-07-01T08:30:00Z');
    await attachSongs({ Song, candidates: [candidate({ catalogUpdatedAt })], apply: true });
    expect(Song.update.mock.calls[0][0].sourceCatalogSyncedAt).toBe(catalogUpdatedAt);
  });

  test('le where re-vérifie sourceCatalogUid IS NULL à l’écriture, pas seulement à la sélection', async () => {
    const Song = makeSong();
    await attachSongs({ Song, candidates: [candidate()], apply: true });
    const [, options] = Song.update.mock.calls[0];
    expect(options.where).toEqual({
      uid: 'song-1', sourceCatalogUid: null, title: 'Hysteria', artist: 'Muse',
    });
  });

  test('le where re-vérifie AUSSI le titre et l’artiste : une chanson renommée entre le SELECT et l’UPDATE n’est pas estampillée', async () => {
    // 0 ligne touchée = la chanson ne ressemble plus à celle qu’on avait sélectionnée.
    const Song = { update: jest.fn().mockResolvedValue([0]) };
    const report = await attachSongs({ Song, candidates: [candidate()], apply: true });
    expect(Song.update.mock.calls[0][1].where).toMatchObject({ title: 'Hysteria', artist: 'Muse' });
    expect(report.attached).toBe(0);
    expect(report.raced).toHaveLength(1);
  });

  test('silent: true — sans lui, updatedAt serait poussé sur les songlists entières de cinq personnes', async () => {
    const Song = makeSong();
    await attachSongs({ Song, candidates: [candidate()], apply: true });
    // Assertion sur l’objet ENTIER : toute option ajoutée plus tard devient un choix délibéré.
    expect(Song.update.mock.calls[0][1]).toEqual({
      where: { uid: 'song-1', sourceCatalogUid: null, title: 'Hysteria', artist: 'Muse' },
      silent: true,
    });
  });

  test('une Song rattachée entre-temps (0 ligne touchée) n’est pas comptée comme rattachée', async () => {
    const Song = { update: jest.fn().mockResolvedValue([0]) };
    const report = await attachSongs({ Song, candidates: [candidate()], apply: true });
    expect(report.attached).toBe(0);
    expect(report.raced).toHaveLength(1);
  });

  test('un candidat ambigu est REFUSÉ, jamais arbitré au hasard', async () => {
    const Song = makeSong();
    const report = await attachSongs({
      Song,
      candidates: [
        candidate({ catalogUid: 'cat-1', matchCount: 2 }),
        candidate({ catalogUid: 'cat-2', matchCount: 2 }),
      ],
      apply: true,
    });
    expect(Song.update).not.toHaveBeenCalled();
    expect(report.attached).toBe(0);
    expect(report.ambiguous).toEqual([{ songUid: 'song-1', userUid: 'user-a', matches: 2 }]);
    expect(report.candidates).toBe(1); // one SONG, not two rows
  });

  test('idempotence : plus aucun candidat au second passage', async () => {
    const Song = makeSong();
    const report = await attachSongs({ Song, candidates: [], apply: true });
    expect(report.attached).toBe(0);
    expect(report.candidates).toBe(0);
    expect(Song.update).not.toHaveBeenCalled();
  });

  test('une erreur en cours de lot ne jette pas le rapport des lignes déjà écrites', async () => {
    const Song = { update: jest.fn().mockResolvedValueOnce([1]).mockRejectedValueOnce(new Error('connection terminated')) };
    const report = await attachSongs({
      Song,
      candidates: [candidate({ songUid: 's1' }), candidate({ songUid: 's2' })],
      apply: true,
    });
    expect(report.attached).toBe(1);
    expect(report.failed[0].reason).toMatch(/connection terminated/);
  });

  test('le rapport regroupe par utilisateur, sans jamais afficher d’email', async () => {
    const Song = makeSong();
    const report = await attachSongs({
      Song,
      candidates: [
        candidate({ songUid: 's1', userUid: 'user-a' }),
        candidate({ songUid: 's2', userUid: 'user-a' }),
        candidate({ songUid: 's3', userUid: 'user-b' }),
      ],
      apply: false,
    });
    expect(report.byUser).toEqual({ 'user-a': 2, 'user-b': 1 });
  });
});

describe('compteurs de sécurité — la preuve mécanique de l’invariant « jamais recréer une Song »', () => {
  test('les quatre tables porteuses de donnée d’entraînement sont comptées', async () => {
    const db = {
      Song: { count: jest.fn().mockResolvedValue(120) },
      SongPlay: { count: jest.fn().mockResolvedValue(900) },
      SessionItem: { count: jest.fn().mockResolvedValue(40) },
      PlaylistSong: { count: jest.fn().mockResolvedValue(12) },
    };
    await expect(countGuardedTables(db)).resolves.toEqual({
      Songs: 120, SongPlays: 900, SessionItems: 40, PlaylistSongs: 12,
    });
  });

  test('un écart est nommé table par table', () => {
    const before = { Songs: 120, SongPlays: 900, SessionItems: 40, PlaylistSongs: 12 };
    expect(diffCounts(before, { ...before })).toEqual([]);
    expect(diffCounts(before, { ...before, SongPlays: 899 })).toEqual([
      { table: 'SongPlays', before: 900, after: 899 },
    ]);
  });
});

describe('formatAttachReport — ce qu’un opérateur lit avant d’autoriser la prod', () => {
  const capture = report => {
    const lines = [];
    formatAttachReport(report, { log: l => lines.push(l) });
    return lines.join('\n');
  };
  const base = { candidates: 0, attached: 0, ambiguous: [], raced: [], failed: [], byUser: {}, applied: false };

  test('le dry-run dit clairement que rien n’a été écrit et détaille par utilisateur', () => {
    const out = capture({ ...base, candidates: 3, attached: 3, byUser: { 'user-a': 2, 'user-b': 1 } });
    expect(out).toMatch(/DRY-RUN — aucune écriture/);
    expect(out).toMatch(/user-a\s*:\s*2/);
    expect(out).toMatch(/user-b\s*:\s*1/);
  });

  test('un candidat ambigu est crié, pas noyé', () => {
    const out = capture({ ...base, candidates: 1, ambiguous: [{ songUid: 'song-1', userUid: 'user-a', matches: 2 }], applied: true });
    expect(out).toMatch(/AMBIGU/i);
    expect(out).toMatch(/song-1/);
  });

  test('un lot avec échecs ne se lit jamais comme un succès', () => {
    const out = capture({ ...base, candidates: 1, failed: [{ songUid: 'song-1', userUid: 'user-a', reason: 'connection reset' }], applied: true });
    expect(out).toMatch(/ÉCHECS/);
    expect(out).toMatch(/connection reset/);
  });
});

describe('runAttach — un écart de compteur fait échouer le lot, il ne se contente pas de le dire', () => {
  const { runAttach } = require('../scripts/seed-catalog');

  // Counts change between the two reads: the second call to each count() returns one less.
  const makeDb = ({ before, after, candidates = [] }) => {
    const counter = key => {
      let calls = 0;
      return jest.fn(async () => { calls += 1; return calls === 1 ? before[key] : after[key]; });
    };
    return {
      Song: { count: counter('Songs'), update: jest.fn().mockResolvedValue([1]) },
      SongPlay: { count: counter('SongPlays') },
      SessionItem: { count: counter('SessionItems') },
      PlaylistSong: { count: counter('PlaylistSongs') },
      sequelize: { query: jest.fn().mockResolvedValue(candidates) },
    };
  };
  const stable = { Songs: 120, SongPlays: 900, SessionItems: 40, PlaylistSongs: 12 };
  const row = over => ({ song_uid: 's1', user_uid: 'u1', song_title: 'Hysteria', song_artist: 'Muse', catalog_uid: 'c1', catalog_updated_at: '2026-08-01T10:00:00.000Z', match_count: '1', ...over });

  let logs;
  beforeEach(() => {
    logs = [];
    process.exitCode = undefined;
    jest.spyOn(console, 'log').mockImplementation(l => logs.push(String(l)));
    jest.spyOn(console, 'error').mockImplementation(l => logs.push(String(l)));
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.exitCode = undefined;
  });

  test('une ligne de SongPlays disparue ⇒ code de sortie 1 et un message qui nomme la table', async () => {
    const db = makeDb({ before: stable, after: { ...stable, SongPlays: 899 }, candidates: [row()] });
    await runAttach(db, { apply: true, phase: 'attach' });
    expect(process.exitCode).toBe(1);
    expect(logs.join('\n')).toMatch(/COMPTEURS MODIFIÉS/);
    expect(logs.join('\n')).toMatch(/SongPlays : 900 → 899/);
  });

  test('compteurs stables ⇒ code de sortie inchangé', async () => {
    const db = makeDb({ before: stable, after: stable, candidates: [row()] });
    await runAttach(db, { apply: true, phase: 'attach' });
    expect(process.exitCode).toBeUndefined();
    expect(db.Song.update).toHaveBeenCalledTimes(1);
  });

  test('un candidat ambigu suffit à faire échouer le lot', async () => {
    const db = makeDb({ before: stable, after: stable, candidates: [row({ match_count: '2' }), row({ catalog_uid: 'c2', match_count: '2' })] });
    await runAttach(db, { apply: true, phase: 'attach' });
    expect(db.Song.update).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  test('le dry-run n’écrit rien, ne compare pas les compteurs, et invite à --apply', async () => {
    const db = makeDb({ before: stable, after: { ...stable, SongPlays: 1 }, candidates: [row()] });
    await runAttach(db, { apply: false, phase: 'attach' });
    expect(db.Song.update).not.toHaveBeenCalled();
    expect(db.SongPlay.count).toHaveBeenCalledTimes(1);      // photo de référence, pas de comparaison
    expect(process.exitCode).toBeUndefined();
    expect(logs.join('\n')).toMatch(/Relancez avec --apply/);
  });

  test('un lot où RIEN n’a été écrit ne se lit pas comme « déjà fait » : sortie 1', async () => {
    // Toutes les écritures rebondissent (0 ligne touchée). Sans ce garde, la sortie disait
    // « candidats : 1 / rattachées : 0 / non écrites : 1 » avec un code de sortie 0.
    const db = makeDb({ before: stable, after: stable, candidates: [row()] });
    db.Song.update.mockResolvedValue([0]);
    await runAttach(db, { apply: true, phase: 'attach' });
    expect(process.exitCode).toBe(1);
    expect(logs.join('\n')).toMatch(/AUCUNE écriture n'a abouti/);
  });

  test('un SELECT qui casse est signalé et fait échouer, il ne passe pas pour « 0 candidat »', async () => {
    const db = makeDb({ before: stable, after: stable });
    db.sequelize.query.mockRejectedValue(new Error('connection terminated'));
    await runAttach(db, { apply: true, phase: 'attach' });
    expect(process.exitCode).toBe(1);
    expect(logs.join('\n')).toMatch(/connection terminated/);
  });
});

// --- Story 23.3 — alias phase ------------------------------------------------
//
// C'est la SEULE phase qui réécrit le title/artist d'un utilisateur. Les tests
// pèsent donc surtout sur ce qu'elle refuse de faire : ne pas renommer quand ça
// collisionnerait avec une autre chanson du même user, ne pas inventer d'entrée
// Catalog manquante, ne rien écrire au-delà des 4 champs annoncés.
const {
  parseAliasCsv, buildAliasCandidatesSql, selectAliasCandidates,
  attachAliasSongs, formatAliasReport, runAlias,
  ALIAS_BIND_COLUMNS, ALIAS_BIND_FIELDS,
} = require('../scripts/seed-catalog');

const ALIAS_HEADER = 'aliasArtist,aliasTitle,artist,title\n';
const aliasCandidate = over => ({
  songUid: 'song-1', userUid: 'user-a',
  songTitle: 'Back in black', songArtist: 'AC DC',
  aliasTitle: 'Back in black', aliasArtist: 'AC DC',
  canonTitle: 'Back in Black', canonArtist: 'AC/DC',
  catalogUid: 'cat-1', catalogUpdatedAt: new Date('2026-08-01T10:00:00Z'),
  matchCount: 1, collisionCount: 0, sessionItemCount: 0, ...over,
});

describe('parseAliasCsv', () => {
  test('lit les 4 colonnes et rend la saisie et la forme canonique', () => {
    const { rows, skipped } = parseAliasCsv(ALIAS_HEADER + 'AC DC,Back in black,AC/DC,Back in Black\n');
    expect(rows).toEqual([{
      aliasArtist: 'AC DC', aliasTitle: 'Back in black', artist: 'AC/DC', title: 'Back in Black',
    }]);
    expect(skipped).toHaveLength(0);
  });

  test('un en-tête inattendu est refusé, jamais deviné', () => {
    expect(() => parseAliasCsv('artist,title\nMuse,Hysteria\n')).toThrow(/[Ee]n-tête/);
  });

  test('un alias dont le fold égale déjà sa forme canonique est sauté : la phase exacte l’a pris', () => {
    const { rows, skipped } = parseAliasCsv(ALIAS_HEADER + 'Muse,hysteria,Muse,Hysteria\n');
    expect(rows).toHaveLength(0);
    expect(skipped[0].reason).toMatch(/identique à la forme canonique/);
  });

  test('deux lignes qui enverraient la MÊME saisie vers deux fiches différentes lèvent', () => {
    const text = ALIAS_HEADER
      + 'Beatles,Come together,The Beatles,Come Together\n'
      + 'Beatles,Come together,The Fab Four,Come Together\n';
    expect(() => parseAliasCsv(text)).toThrow(/conflit/i);
  });

  test('une ligne strictement identique répétée est sautée, pas fatale', () => {
    const line = 'AC DC,Back in black,AC/DC,Back in Black\n';
    const { rows, skipped } = parseAliasCsv(ALIAS_HEADER + line + line);
    expect(rows).toHaveLength(1);
    expect(skipped[0].reason).toMatch(/doublon/);
  });

  test('une ligne incomplète est sautée avec sa raison', () => {
    const { rows, skipped } = parseAliasCsv(ALIAS_HEADER + 'AC DC,,AC/DC,Back in Black\n');
    expect(rows).toHaveLength(0);
    expect(skipped[0].reason).toMatch(/incomplète/);
  });

  test('le vrai fichier versionné est lisible et donne 9 alias exploitables', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const text = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'seed', 'catalog-seed-aliases.csv'), 'utf8');
    const { rows, skipped } = parseAliasCsv(text);
    // Pas de compte magique : un curateur qui ajoute un 10e alias ne doit pas casser la
    // suite. Ce qui compte, ce sont les propriétés — aucune ligne sautée, quatre colonnes
    // pleines partout, aucun alias répété.
    expect(skipped).toHaveLength(0);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.aliasArtist && r.aliasTitle && r.artist && r.title).toBeTruthy();
    }
    const keys = rows.map(r => `${r.aliasArtist.toLowerCase()}|${r.aliasTitle.toLowerCase()}`);
    expect(new Set(keys).size).toBe(rows.length);
  });
});

describe('buildAliasCandidatesSql — le rapprochement ET la détection de collision sont en SQL', () => {
  const sql = () => buildAliasCandidatesSql(2);

  test('il ne sélectionne que les Songs sans source', () => {
    expect(sql()).toMatch(/s\.source_catalog_uid IS NULL/);
  });

  test('il joint la saisie sur le fold d’identité, accents conservés', () => {
    expect(sql()).toMatch(/lower\(s\.title\)\s*=\s*lower\(a\.alias_title\)/);
    expect(sql()).not.toMatch(/unaccent/i);
  });

  test('l’entrée canonique est jointe en LEFT JOIN : absente, la ligne remonte quand même pour être refusée', () => {
    expect(sql()).toMatch(/LEFT JOIN "CatalogSongs"/);
  });

  test('la collision est comptée sur le MÊME utilisateur et en excluant la chanson elle-même', () => {
    expect(sql()).toMatch(/o\.user_uid\s*=\s*s\.user_uid/);
    expect(sql()).toMatch(/o\.uid\s*<>\s*s\.uid/);
  });

  test('un tuple de bind par alias, typé pour que Postgres ne se plaigne pas du type des paramètres', () => {
    expect(buildAliasCandidatesSql(1)).toMatch(/\$1::text/);
    expect(sql()).toMatch(/\$5/);        // 2 alias × 4 colonnes
    expect(sql()).not.toMatch(/\$9/);
  });

  test('selectAliasCandidates passe les binds à plat et normalise les compteurs bigint', async () => {
    const sequelize = {
      query: jest.fn().mockResolvedValue([{
        song_uid: 's1', user_uid: 'u1', song_title: 'Back in black', song_artist: 'AC DC',
        canon_title: 'Back in Black', canon_artist: 'AC/DC', catalog_uid: 'c1',
        catalog_updated_at: '2026-08-01T10:00:00.000Z', collision_count: '0', session_item_count: '2',
      }]),
    };
    const rows = await selectAliasCandidates(sequelize, [
      { aliasArtist: 'AC DC', aliasTitle: 'Back in black', artist: 'AC/DC', title: 'Back in Black' },
    ]);
    expect(sequelize.query.mock.calls[0][1].bind).toEqual(['Back in black', 'AC DC', 'Back in Black', 'AC/DC']);
    expect(rows[0]).toMatchObject({ songUid: 's1', collisionCount: 0, sessionItemCount: 2, catalogUid: 'c1' });
  });

  test('aucun alias exploitable ⇒ aucune requête lancée', async () => {
    const sequelize = { query: jest.fn() };
    await expect(selectAliasCandidates(sequelize, [])).resolves.toEqual([]);
    expect(sequelize.query).not.toHaveBeenCalled();
  });
});

describe('attachAliasSongs — corriger l’orthographe sans jamais écraser', () => {
  const makeSong = () => ({ update: jest.fn().mockResolvedValue([1]) });

  test('le dry-run n’écrit rien', async () => {
    const Song = makeSong();
    const report = await attachAliasSongs({ Song, candidates: [aliasCandidate()], apply: false });
    expect(Song.update).not.toHaveBeenCalled();
    expect(report.renamed).toBe(1);
  });

  test('la renommée écrit EXACTEMENT 4 champs : les 2 de provenance + title + artist', async () => {
    const Song = makeSong();
    await attachAliasSongs({ Song, candidates: [aliasCandidate()], apply: true });
    const [values] = Song.update.mock.calls[0];
    expect(Object.keys(values).sort()).toEqual(['artist', 'sourceCatalogSyncedAt', 'sourceCatalogUid', 'title']);
    expect(values).toMatchObject({ title: 'Back in Black', artist: 'AC/DC' });
  });

  test('le where re-vérifie la SAISIE, pas la forme canonique : sinon on renomme une chanson déjà modifiée', async () => {
    const Song = makeSong();
    await attachAliasSongs({ Song, candidates: [aliasCandidate()], apply: true });
    expect(Song.update.mock.calls[0][1].where).toEqual({
      uid: 'song-1', sourceCatalogUid: null, title: 'Back in black', artist: 'AC DC',
    });
  });

  test('une renommée qui collisionnerait rattache SANS renommer, et le signale', async () => {
    const Song = makeSong();
    const report = await attachAliasSongs({
      Song, candidates: [aliasCandidate({ collisionCount: 1 })], apply: true,
    });
    const [values] = Song.update.mock.calls[0];
    expect(Object.keys(values).sort()).toEqual(['sourceCatalogSyncedAt', 'sourceCatalogUid']); // pas de rename
    expect(report.renamed).toBe(0);
    expect(report.attachedOnly).toHaveLength(1);
    expect(report.attachedOnly[0]).toMatchObject({ songUid: 'song-1', reason: expect.stringMatching(/collision/i) });
  });

  test('une 23505 concurrente retombe sur « rattacher sans renommer », en nommant la contrainte', async () => {
    // Le pré-contrôle disait 0 collision, mais la chanson a été créée entre-temps.
    const conflict = Object.assign(new Error('dup'), {
      name: 'SequelizeUniqueConstraintError',
      parent: { constraint: 'songs_user_uid_title_artist_ci' },
    });
    const Song = { update: jest.fn().mockRejectedValueOnce(conflict).mockResolvedValueOnce([1]) };
    const report = await attachAliasSongs({ Song, candidates: [aliasCandidate()], apply: true });
    expect(Song.update).toHaveBeenCalledTimes(2);
    expect(Object.keys(Song.update.mock.calls[1][0]).sort()).toEqual(['sourceCatalogSyncedAt', 'sourceCatalogUid']);
    expect(report.renamed).toBe(0);
    expect(report.attachedOnly[0].reason).toMatch(/songs_user_uid_title_artist_ci/);
  });

  test('une entrée canonique absente du Catalog est REFUSÉE, jamais créée à la volée', async () => {
    const Song = makeSong();
    const report = await attachAliasSongs({
      Song, candidates: [aliasCandidate({ catalogUid: null, catalogUpdatedAt: null })], apply: true,
    });
    expect(Song.update).not.toHaveBeenCalled();
    expect(report.refused[0].reason).toMatch(/absente du Catalog/);
  });

  test('idempotence : plus aucun candidat au second passage', async () => {
    const Song = makeSong();
    const report = await attachAliasSongs({ Song, candidates: [], apply: true });
    expect(Song.update).not.toHaveBeenCalled();
    expect(report.renamed).toBe(0);
    expect(report.candidates).toBe(0);
  });

  test('une erreur en cours de lot ne jette pas le rapport des lignes déjà écrites', async () => {
    const Song = { update: jest.fn().mockResolvedValueOnce([1]).mockRejectedValueOnce(new Error('connection terminated')) };
    const report = await attachAliasSongs({
      Song,
      candidates: [aliasCandidate({ songUid: 's1' }), aliasCandidate({ songUid: 's2' })],
      apply: true,
    });
    expect(report.renamed).toBe(1);
    expect(report.failed[0].reason).toMatch(/connection terminated/);
  });

  test('renommer BUMPE updatedAt, poser la seule provenance ne le bumpe pas', async () => {
    // 23.2 utilisait silent parce qu’on ne posait qu’une métadonnée. Ici la chanson de
    // l’utilisateur change vraiment : masquer updatedAt serait un mensonge sur la ligne.
    const Song = makeSong();
    await attachAliasSongs({ Song, candidates: [aliasCandidate()], apply: true });
    expect(Song.update.mock.calls[0][1].silent).toBeUndefined();

    const Song2 = makeSong();
    await attachAliasSongs({ Song: Song2, candidates: [aliasCandidate({ collisionCount: 1 })], apply: true });
    expect(Song2.update.mock.calls[0][1].silent).toBe(true);
  });
});

describe('formatAliasReport — l’avant/après que northwood lit avant d’autoriser la prod', () => {
  const capture = report => {
    const lines = [];
    formatAliasReport(report, { log: l => lines.push(l) });
    return lines.join('\n');
  };
  const base = {
    candidates: 0, renamed: 0, attachedOnly: [], refused: [], failed: [],
    renames: [], sessionItemsAffected: 0, applied: false,
  };

  test('chaque renommée est affichée avant → après, groupée par utilisateur', () => {
    const out = capture({
      ...base, candidates: 1, renamed: 1,
      renames: [{ userUid: 'user-a', before: 'AC DC / Back in black', after: 'AC/DC / Back in Black' }],
    });
    expect(out).toMatch(/user-a/);
    expect(out).toMatch(/AC DC \/ Back in black.*→.*AC\/DC \/ Back in Black/);
  });

  test('le snapshot FR4 est signalé UNIQUEMENT si une renommée a un historique de session', () => {
    const withHistory = capture({ ...base, candidates: 1, renamed: 1, sessionItemsAffected: 3 });
    expect(withHistory).toMatch(/SessionItems|historique des sessions/i);
    expect(withHistory).toMatch(/3/);

    const withoutHistory = capture({ ...base, candidates: 1, renamed: 1, sessionItemsAffected: 0 });
    expect(withoutHistory).not.toMatch(/historique des sessions/i);
  });

  test('un refus et une collision ne se lisent jamais comme un succès', () => {
    const out = capture({
      ...base, candidates: 2, applied: true,
      attachedOnly: [{ songUid: 's1', userUid: 'u1', reason: 'collision avec une autre chanson du même utilisateur' }],
      refused: [{ songUid: 's2', userUid: 'u1', reason: 'entrée canonique absente du Catalog' }],
    });
    expect(out).toMatch(/collision/i);
    expect(out).toMatch(/absente du Catalog/);
  });
});

// --- Story 23.3 — correctifs de la code review ------------------------------

describe('parseAliasCsv — les quatre colonnes sont obligatoires', () => {
  test('un aliasArtist vide est refusé : il réclamerait toutes les chansons sans artiste, chez tous les users', () => {
    const { rows, skipped } = parseAliasCsv(ALIAS_HEADER + ',Runaway,Jamiroquai,Runaway\n');
    expect(rows).toHaveLength(0);
    expect(skipped[0].reason).toMatch(/incomplète/);
  });

  test('un artiste canonique vide est refusé : il écrirait NULL par-dessus l’artiste réel', () => {
    const { rows, skipped } = parseAliasCsv(ALIAS_HEADER + 'AC DC,Back in black,,Back in Black\n');
    expect(rows).toHaveLength(0);
    expect(skipped[0].reason).toMatch(/incomplète/);
  });

  test('une 5e colonne fait lever plutôt que d’être ignorée en silence', () => {
    expect(() => parseAliasCsv('aliasArtist,aliasTitle,artist,title,note\n')).toThrow(/colonnes/);
  });

  test('deux orthographes canoniques qui ne diffèrent QUE par la casse sont un conflit, pas un doublon', () => {
    const text = ALIAS_HEADER
      + 'Beatles,Come together,AC/DC,Back in Black\n'
      + 'Beatles,Come together,ac/dc,back in black\n';
    expect(() => parseAliasCsv(text)).toThrow(/[Cc]onflit/);
  });
});

describe('buildAliasCandidatesSql — les gardes ajoutés en review', () => {
  test('le garde d’ordre des phases est STRUCTUREL : une orthographe déjà au Catalog n’est jamais candidate', () => {
    expect(buildAliasCandidatesSql(1)).toMatch(/NOT EXISTS[\s\S]*lower\(x\.title\)\s*=\s*lower\(a\.alias_title\)/);
  });

  test('la sonde d’ambiguïté existe, comme dans la phase attach', () => {
    expect(buildAliasCandidatesSql(1)).toMatch(/count\(\*\) OVER \(PARTITION BY s\.uid\)/i);
  });

  test('l’ordre des binds est lié à celui de la CTE par une constante partagée, pas par convention', () => {
    // Permuter deux noms dans la CTE laissait toute la suite verte : l’en-tête du CSV est
    // dans l’ordre INVERSE de chaque paire, donc l’invitation à transposer était réelle.
    expect(ALIAS_BIND_COLUMNS).toEqual(['alias_title', 'alias_artist', 'canon_title', 'canon_artist']);
    expect(ALIAS_BIND_FIELDS).toEqual(['aliasTitle', 'aliasArtist', 'title', 'artist']);
    expect(buildAliasCandidatesSql(1)).toContain(`WITH alias(${ALIAS_BIND_COLUMNS.join(', ')})`);
  });
});

describe('attachAliasSongs — refus, réservation et traçabilité', () => {
  const makeSong = () => ({ update: jest.fn().mockResolvedValue([1]) });

  test('deux entrées Catalog pour un même fold ⇒ REFUS, comme en 23.2, jamais un choix au hasard', async () => {
    const Song = makeSong();
    const report = await attachAliasSongs({ Song, candidates: [aliasCandidate({ matchCount: 2 })], apply: true });
    expect(Song.update).not.toHaveBeenCalled();
    expect(report.refused[0].reason).toMatch(/ambigu/);
  });

  test('le dry-run ne promet pas deux renommées quand la seconde collisionnerait avec la première', async () => {
    // Les deux visent la même identité canonique pour le même user : collisionCount vaut 0
    // pour les deux (aucune n’existe ENCORE), donc sans réservation le dry-run annonçait 2.
    const Song = makeSong();
    const candidates = [
      aliasCandidate({ songUid: 's1', songTitle: 'Back in black', aliasTitle: 'Back in black' }),
      aliasCandidate({ songUid: 's2', songTitle: 'back in BLACK', aliasTitle: 'back in BLACK' }),
    ];
    const dry = await attachAliasSongs({ Song, candidates, apply: false });
    const wet = await attachAliasSongs({ Song, candidates, apply: true });
    expect(dry.renamed).toBe(1);
    expect(dry.attachedOnly).toHaveLength(1);
    expect(wet.renamed).toBe(dry.renamed);                 // le dry-run ne ment pas
    expect(wet.attachedOnly).toHaveLength(dry.attachedOnly.length);
  });

  test('chaque seau d’exception nomme la chanson, l’utilisateur et la cible', async () => {
    const Song = makeSong();
    const report = await attachAliasSongs({
      Song, candidates: [aliasCandidate({ collisionCount: 1 })], apply: true,
    });
    expect(report.attachedOnly[0]).toMatchObject({
      songUid: 'song-1', userUid: 'user-a', song: 'AC DC / Back in black', canon: 'AC/DC / Back in Black',
    });
  });

  test('une ligne non écrite atterrit dans « raced » avec de quoi la retrouver', async () => {
    const Song = { update: jest.fn().mockResolvedValue([0]) };
    const report = await attachAliasSongs({ Song, candidates: [aliasCandidate()], apply: true });
    expect(report.renamed).toBe(0);
    expect(report.raced[0]).toMatchObject({ songUid: 'song-1', userUid: 'user-a', song: 'AC DC / Back in black' });
  });

  test('chaque renommée est journalisée au moment où elle est écrite, pas seulement à la fin', async () => {
    const Song = makeSong();
    const lines = [];
    await attachAliasSongs({ Song, candidates: [aliasCandidate()], apply: true, log: l => lines.push(l) });
    expect(lines.join('\n')).toMatch(/AC DC \/ Back in black.*→.*AC\/DC \/ Back in Black/);
  });

  test('idempotence RÉELLE : au second passage la chanson porte déjà la forme canonique, le where ne matche plus', async () => {
    // Ce que fait vraiment un second run : le SELECT ne la renvoie plus (source posée), et si
    // elle revenait, le where sur la saisie d’origine ne matcherait plus rien.
    const Song = { update: jest.fn().mockResolvedValue([0]) };
    const report = await attachAliasSongs({
      Song,
      candidates: [aliasCandidate({ songTitle: 'Back in Black', songArtist: 'AC/DC' })],
      apply: true,
    });
    expect(Song.update.mock.calls[0][1].where).toMatchObject({ title: 'Back in Black', artist: 'AC/DC' });
    expect(report.renamed).toBe(0);
    expect(report.raced).toHaveLength(1);
  });

  test('les alias effectivement rencontrés sont tracés, pour pouvoir nommer ceux qui n’ont rien trouvé', async () => {
    const Song = makeSong();
    const report = await attachAliasSongs({ Song, candidates: [aliasCandidate()], apply: false });
    expect(report.matchedAliases.has(identityKey('Back in black', 'AC DC'))).toBe(true);
  });
});

describe('parseArgs — la phase alias', () => {
  test('--phase=alias est accepté', () => {
    expect(parseArgs(['--phase=alias']).phase).toBe('alias');
    expect(parseArgs(['--phase=alias', '--apply']).apply).toBe(true);
  });

  test('--file est refusé en phase alias, avec un message propre à la phase', () => {
    expect(() => parseArgs(['--phase=alias', '--file=x.csv'])).toThrow(/--phase=alias/);
  });
});

describe('runAlias — un alias qui ne trouve rien ne doit pas passer pour un succès', () => {
  const stable = { Songs: 120, SongPlays: 900, SessionItems: 40, PlaylistSongs: 12 };
  const makeDb = rows => ({
    Song: { count: jest.fn().mockResolvedValue(stable.Songs), update: jest.fn().mockResolvedValue([1]) },
    SongPlay: { count: jest.fn().mockResolvedValue(stable.SongPlays) },
    SessionItem: { count: jest.fn().mockResolvedValue(stable.SessionItems) },
    PlaylistSong: { count: jest.fn().mockResolvedValue(stable.PlaylistSongs) },
    sequelize: { query: jest.fn().mockResolvedValue(rows) },
  });
  // Une ligne SQL correspondant au 1er alias du fichier versionné (AC DC / Back in black).
  const row = over => ({
    song_uid: 's1', user_uid: 'u1', song_title: 'Back in black', song_artist: 'AC DC',
    alias_title: 'Back in black', alias_artist: 'AC DC',
    canon_title: 'Back in Black', canon_artist: 'AC/DC',
    catalog_uid: 'c1', catalog_updated_at: '2026-08-01T10:00:00.000Z',
    match_count: '1', collision_count: '0', session_item_count: '0', ...over,
  });

  let logs;
  beforeEach(() => {
    logs = [];
    process.exitCode = undefined;
    jest.spyOn(console, 'log').mockImplementation(l => logs.push(String(l)));
    jest.spyOn(console, 'error').mockImplementation(l => logs.push(String(l)));
  });
  afterEach(() => { jest.restoreAllMocks(); process.exitCode = undefined; });

  test('les alias sans correspondance sont NOMMÉS et le run sort en 1', async () => {
    // Un seul des 9 alias du fichier remonte une chanson : les 8 autres sont morts.
    await runAlias(makeDb([row()]), { apply: false, phase: 'alias' });
    const out = logs.join('\n');
    expect(out).toMatch(/n'ont trouvé AUCUNE chanson/);
    expect(out).toMatch(/Jamiroquoi \/ Runaway/);   // un des alias non servis
    expect(process.exitCode).toBe(1);
  });

  test('une ligne non écrite met aussi le code de sortie à 1', async () => {
    const db = makeDb([row()]);
    db.Song.update.mockResolvedValue([0]);
    await runAlias(db, { apply: true, phase: 'alias' });
    expect(logs.join('\n')).toMatch(/NON ÉCRITES/);
    expect(process.exitCode).toBe(1);
  });

  test('un comptage post-écriture en échec dit que les ÉCRITURES ONT EU LIEU', async () => {
    const db = makeDb([row()]);
    let calls = 0;
    db.SongPlay.count = jest.fn(async () => { calls += 1; if (calls > 1) throw new Error('connection terminated'); return stable.SongPlays; });
    await runAlias(db, { apply: true, phase: 'alias' });
    expect(logs.join('\n')).toMatch(/ÉCRITURES APPLIQUÉES/);
    expect(process.exitCode).toBe(1);
  });
});
