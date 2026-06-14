import { findDuplicateSong } from '../utils/songDuplicate';
import type { Song } from '../services/songService';

const makeSong = (overrides: Partial<Song>): Song => ({
  uid: '1',
  title: 'Killing in the Name',
  artist: 'Rage Against the Machine',
  album: '',
  bpm: null,
  key: '',
  timeSignature: '',
  mode: '',
  notes: '',
  instrument: [],
  genre: [],
  technique: [],
  instrumentDifficulty: {},
  instrumentLinks: {},
  pitchStandard: 440,
  ...overrides,
});

describe('findDuplicateSong', () => {
  it('matches on title + artist ignoring case and surrounding whitespace', () => {
    const songs = [makeSong({})];
    const hit = findDuplicateSong(songs, {
      title: '  killing in the name ',
      artist: 'RAGE AGAINST THE MACHINE',
    });
    expect(hit).toBe(songs[0]);
  });

  it('collapses internal whitespace differences', () => {
    const songs = [makeSong({ artist: 'Rage  Against the Machine' })]; // double space
    expect(
      findDuplicateSong(songs, { title: 'Killing in the Name', artist: 'Rage Against the Machine' }),
    ).toBe(songs[0]);
  });

  it('treats NFC and NFD encodings of the same accented text as equal', () => {
    const nfc = 'Beyonce\u0301'.normalize('NFC'); // precomposed é
    const nfd = 'Beyonce\u0301'.normalize('NFD'); // e + combining acute accent
    const songs = [makeSong({ title: nfc, artist: nfc })];
    expect(findDuplicateSong(songs, { title: nfd, artist: nfd })).toBe(songs[0]);
  });

  it('keeps accents distinct from their unaccented form (no folding)', () => {
    const songs = [makeSong({ title: 'Beyoncé', artist: 'Beyoncé' })];
    expect(findDuplicateSong(songs, { title: 'Beyonce', artist: 'Beyonce' })).toBeNull();
  });

  it('returns null when the artist differs (same title, other artist)', () => {
    const songs = [makeSong({})];
    expect(
      findDuplicateSong(songs, { title: 'Killing in the Name', artist: 'Cover Band' }),
    ).toBeNull();
  });

  it('returns null when the title is empty (the required field)', () => {
    const songs = [makeSong({})];
    expect(findDuplicateSong(songs, { title: '', artist: 'Rage Against the Machine' })).toBeNull();
  });

  it('treats null/undefined artist as empty on both sides', () => {
    const songs = [makeSong({ artist: null as unknown as string })]; // DB allows null artist
    expect(findDuplicateSong(songs, { title: 'Killing in the Name', artist: '' })).toBe(songs[0]);
    expect(findDuplicateSong(songs, { title: 'Killing in the Name' })).toBe(songs[0]);
  });

  it('ignores the song being edited via excludeUid', () => {
    const songs = [makeSong({ uid: 'self' })];
    expect(
      findDuplicateSong(
        songs,
        { title: 'Killing in the Name', artist: 'Rage Against the Machine' },
        'self',
      ),
    ).toBeNull();
  });

  // The bug this fix addresses: detection scans the whole songlist, independent
  // of any list filter — so a song hidden from the visible list still matches.
  it('matches regardless of how the visible list is filtered', () => {
    const hidden = makeSong({ uid: 'hidden', instrument: [] }); // no instrument → hidden by an instrument filter
    expect(
      findDuplicateSong([hidden], {
        title: 'Killing in the Name',
        artist: 'Rage Against the Machine',
      }),
    ).toBe(hidden);
  });
});
