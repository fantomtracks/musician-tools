import { applySongFilters, countActiveFilters, NO_INSTRUMENT, type ActiveFilterState } from '../utils/songFilters';
import type { Song } from '../services/songService';

const noFilters: ActiveFilterState = {
  instrumentFilter: '',
  myInstrumentFilter: '',
  instrumentDifficultyFilter: '',
  capoFilter: '',
  tuningFilter: '',
  keyFilter: '',
  bpmMinFilter: '',
  bpmMaxFilter: '',
  pitchStandardMinFilter: '',
  pitchStandardMaxFilter: '',
  timeSignatureFilter: '',
  modeFilter: '',
  languageFilters: new Set(),
  playlistFilter: '',
  techniqueFilters: new Set(),
  genreFilters: new Set(),
};

describe('countActiveFilters', () => {
  test('returns 0 when nothing is set', () => {
    expect(countActiveFilters(noFilters)).toBe(0);
  });

  test('counts a single active select filter', () => {
    expect(countActiveFilters({ ...noFilters, keyFilter: 'C' })).toBe(1);
  });

  test('a non-empty Set counts as one dimension', () => {
    expect(countActiveFilters({ ...noFilters, genreFilters: new Set(['Rock', 'Jazz']) })).toBe(1);
    expect(countActiveFilters({ ...noFilters, techniqueFilters: new Set(['Bend']) })).toBe(1);
    expect(countActiveFilters({ ...noFilters, languageFilters: new Set(['en']) })).toBe(1);
  });

  test('capo 0 is active (!== ""), empty string is not', () => {
    expect(countActiveFilters({ ...noFilters, capoFilter: 0 })).toBe(1);
    expect(countActiveFilters({ ...noFilters, capoFilter: '' })).toBe(0);
  });

  test('sums multiple active dimensions', () => {
    expect(
      countActiveFilters({
        ...noFilters,
        instrumentFilter: 'Guitar',
        bpmMinFilter: '90',
        genreFilters: new Set(['Rock']),
        playlistFilter: 'pl-1',
      }),
    ).toBe(4);
  });
});

const baseSong: Song = {
  uid: '1',
  title: 'Song A',
  artist: 'Artist',
  album: 'Album',
  bpm: 100,
  key: 'C',
  timeSignature: '4/4',
  mode: 'Major',
  notes: '',
  instrument: [],
  genre: [],
  technique: [],
  instrumentDifficulty: {},
  instrumentLinks: {},
  pitchStandard: 440,
};

const makeOpts = (overrides: Partial<Parameters<typeof applySongFilters>[1]> = {}) => ({
  searchQuery: '',
  instrumentFilter: '',
  instrumentMatchMode: 'any' as const,
  myInstrumentFilter: '',
  tuningFilter: '',
  instrumentDifficultyFilter: '' as const,
  capoFilter: '' as const,
  techniqueFilters: new Set<string>(),
  techniqueMatchMode: 'any' as const,
  genreFilters: new Set<string>(),
  genreMatchMode: 'any' as const,
  keyFilter: '',
  bpmMinFilter: '',
  bpmMaxFilter: '',
  pitchStandardMinFilter: '',
  pitchStandardMaxFilter: '',
  timeSignatureFilter: '',
  modeFilter: '',
  languageFilters: new Set<string>(),
  languageMatchMode: 'any' as const,
  playlistFilter: '',
  playlists: [],
  ...overrides,
});

test('filters by BPM range', () => {
  const songs: Song[] = [
    { ...baseSong, uid: '1', bpm: 90 },
    { ...baseSong, uid: '2', bpm: 120 },
    { ...baseSong, uid: '3', bpm: 100 },
  ];

  const result = applySongFilters(songs, makeOpts({ bpmMinFilter: '95', bpmMaxFilter: '110' }));
  expect(result.map(s => s.uid)).toEqual(['3']);
});

test('filters by key, mode, and time signature together', () => {
  const songs: Song[] = [
    { ...baseSong, uid: '1', key: 'C', mode: 'Major', timeSignature: '4/4' },
    { ...baseSong, uid: '2', key: 'G', mode: 'Minor', timeSignature: '3/4' },
  ];

  const result = applySongFilters(songs, makeOpts({ keyFilter: 'C', modeFilter: 'Major', timeSignatureFilter: '4/4' }));
  expect(result.map(s => s.uid)).toEqual(['1']);
});

test('filters by playlist membership', () => {
  const songs: Song[] = [
    { ...baseSong, uid: '1' },
    { ...baseSong, uid: '2' },
  ];

  const playlists = [{ uid: 'p1', name: 'Set', songUids: ['2'] }];
  const result = applySongFilters(songs, makeOpts({ playlistFilter: 'p1', playlists }));
  expect(result.map(s => s.uid)).toEqual(['2']);
});

test('does not treat empty-string difficulty as 0', () => {
  const songs: Song[] = [
    {
      ...baseSong,
      uid: '1',
      instrument: ['Guitar'],
      instrumentDifficulty: { Guitar: '' as unknown as number },
    },
    {
      ...baseSong,
      uid: '2',
      instrument: ['Guitar'],
      instrumentDifficulty: { Guitar: 2 },
    },
  ];

  const result = applySongFilters(songs, makeOpts({ instrumentFilter: 'Guitar', instrumentDifficultyFilter: 2 }));
  expect(result.map(s => s.uid)).toEqual(['2']);
});

test('filters by exact capo position', () => {
  const songs: Song[] = [
    { ...baseSong, uid: '1', capo: 1 },
    { ...baseSong, uid: '2', capo: 2 },
    { ...baseSong, uid: '3', capo: 4 },
  ];

  const result = applySongFilters(songs, makeOpts({ capoFilter: 2 }));
  expect(result.map(s => s.uid)).toEqual(['2']);
});

test('excludes songs without capo when capo filter is active', () => {
  const songs: Song[] = [
    { ...baseSong, uid: '1', capo: null },
    { ...baseSong, uid: '2', capo: 1 },
  ];

  const result = applySongFilters(songs, makeOpts({ capoFilter: 1 }));
  expect(result.map(s => s.uid)).toEqual(['2']);
});

test('excludes capo 0 as invalid when capo filter is active', () => {
  const songs: Song[] = [
    { ...baseSong, uid: '1', capo: 0 },
    { ...baseSong, uid: '2', capo: 3 },
  ];

  const result = applySongFilters(songs, makeOpts({ capoFilter: 3 }));
  expect(result.map(s => s.uid)).toEqual(['2']);
});

test('NO_INSTRUMENT keeps only songs linked to no instrument', () => {
  const songs: Song[] = [
    { ...baseSong, uid: '1', instrument: [] },
    { ...baseSong, uid: '2', instrument: ['Guitar'] },
    { ...baseSong, uid: '3', instrument: null },
  ];

  const result = applySongFilters(songs, makeOpts({ instrumentFilter: NO_INSTRUMENT }));
  expect(result.map(s => s.uid)).toEqual(['1', '3']);
});

test('NO_INSTRUMENT ignores per-instrument sub-filters (stale difficulty/tuning do not exclude)', () => {
  const songs: Song[] = [{ ...baseSong, uid: '1', instrument: [] }];

  const result = applySongFilters(
    songs,
    makeOpts({ instrumentFilter: NO_INSTRUMENT, instrumentDifficultyFilter: 3, tuningFilter: 'Drop D' }),
  );
  expect(result.map(s => s.uid)).toEqual(['1']);
});

test('filters by language', () => {
  const songs: Song[] = [
    { ...baseSong, uid: '1', language: 'French' },
    { ...baseSong, uid: '2', language: 'English' },
  ];

  const result = applySongFilters(songs, makeOpts({ languageFilters: new Set(['French']) }));
  expect(result.map(s => s.uid)).toEqual(['1']);
});