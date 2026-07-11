import type { Song } from '../services/songService';

// Server-shaped Song fixture for tests. The real API returns the FULL record —
// server metadata (uid/userUid-less here but timestamps present), null (not '') for
// empty text fields, {} for empty maps, [] / null for empty lists — which minimal inline
// mocks ({ uid, title, artist: '' }) don't reproduce. Epic 18 QA caught a bug (isFreshSong's
// exact-JSON compare) that was invisible precisely because the mocks weren't server-shaped.
// Default to this factory for anything that flows through buildFormFromSong / the list.
export function makeSong(overrides: Partial<Song> & { uid: string; title: string }): Song {
  return {
    bpm: null,
    durationSeconds: null,
    key: '',
    capo: null,
    timeSignature: '',
    mode: '',
    notes: '',
    instrument: null,
    instrumentLinks: null as unknown as Song['instrumentLinks'],
    instrumentDifficulty: {},
    artist: null as unknown as Song['artist'], // server sends null, not '', for an empty artist
    album: null as unknown as Song['album'],
    language: null,
    genre: null,
    technique: [],
    pitchStandard: 440,
    instrumentTuning: {},
    myInstrumentUid: undefined,
    lastPlayed: undefined,
    streamingLinks: null as unknown as Song['streamingLinks'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
