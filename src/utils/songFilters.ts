import type { Playlist } from '../services/playlistService';
import type { Song } from '../services/songService';

// Special `instrumentFilter` value: match only songs linked to no instrument (orphans).
export const NO_INSTRUMENT = '__none__';

export type SongFilterOptions = {
  searchQuery: string;
  instrumentFilter: string;
  instrumentMatchMode: 'all' | 'any';
  myInstrumentFilter: string;
  tuningFilter: string;
  instrumentDifficultyFilter: number | '';
  capoFilter: number | '';
  techniqueFilters: Set<string>;
  techniqueMatchMode: 'all' | 'any';
  genreFilters: Set<string>;
  genreMatchMode: 'all' | 'any';
  keyFilter: string;
  bpmMinFilter: string;
  bpmMaxFilter: string;
  pitchStandardMinFilter: string;
  pitchStandardMaxFilter: string;
  timeSignatureFilter: string;
  modeFilter: string;
  languageFilters: Set<string>;
  languageMatchMode: 'all' | 'any';
  playlistFilter: string;
  playlists: Playlist[];
  instrumentMatchModeAll?: boolean;
};

// Subset of filter state that counts as an "active filter" — mirrors, one-for-one,
// the conditions behind `hasActiveFilters` in Songs.tsx. Search query is NOT a filter.
export type ActiveFilterState = {
  instrumentFilter: string;
  myInstrumentFilter: string;
  instrumentDifficultyFilter: number | '';
  capoFilter: number | '';
  tuningFilter: string;
  keyFilter: string;
  bpmMinFilter: string;
  bpmMaxFilter: string;
  pitchStandardMinFilter: string;
  pitchStandardMaxFilter: string;
  timeSignatureFilter: string;
  modeFilter: string;
  languageFilters: Set<string>;
  playlistFilter: string;
  techniqueFilters: Set<string>;
  genreFilters: Set<string>;
};

// Number of active filter dimensions (a non-empty Set counts as one). Single source
// of truth for both `hasActiveFilters` (> 0) and the mobile "Filters · N" counter.
export function countActiveFilters(f: ActiveFilterState): number {
  let n = 0;
  if (f.instrumentFilter) n++;
  if (f.myInstrumentFilter) n++;
  if (f.instrumentDifficultyFilter) n++;
  if (f.capoFilter !== '') n++;
  if (f.tuningFilter) n++;
  if (f.keyFilter) n++;
  if (f.bpmMinFilter) n++;
  if (f.bpmMaxFilter) n++;
  if (f.pitchStandardMinFilter) n++;
  if (f.pitchStandardMaxFilter) n++;
  if (f.timeSignatureFilter) n++;
  if (f.modeFilter) n++;
  if (f.languageFilters.size > 0) n++;
  if (f.playlistFilter) n++;
  if (f.techniqueFilters.size > 0) n++;
  if (f.genreFilters.size > 0) n++;
  return n;
}

export function applySongFilters(songs: Song[], opts: SongFilterOptions): Song[] {
  const {
    searchQuery,
    instrumentFilter,
    instrumentMatchMode,
    myInstrumentFilter,
    tuningFilter,
    instrumentDifficultyFilter,
    capoFilter,
    techniqueFilters,
    techniqueMatchMode,
    genreFilters,
    genreMatchMode,
    keyFilter,
    bpmMinFilter,
    bpmMaxFilter,
    pitchStandardMinFilter,
    pitchStandardMaxFilter,
    timeSignatureFilter,
    modeFilter,
    languageFilters,
    languageMatchMode,
    playlistFilter,
    playlists,
  } = opts;

  const query = searchQuery.toLowerCase();

  return songs.filter(song => {
    const passesSearch = (
      song.title.toLowerCase().includes(query) ||
      song.artist?.toLowerCase().includes(query) ||
      song.album?.toLowerCase().includes(query)
    );

    const isNoInstrument = instrumentFilter === NO_INSTRUMENT;
    const selected = instrumentFilter && !isNoInstrument ? [instrumentFilter] : [];
    const songInstruments = Array.isArray(song.instrument)
      ? song.instrument
      : (song.instrument ? [song.instrument] : []);
    const passesInstrument = isNoInstrument
      ? songInstruments.length === 0
      : (selected.length === 0 ||
        (instrumentMatchMode === 'all'
          ? selected.every(inst => songInstruments.includes(inst))
          : selected.some(inst => songInstruments.includes(inst))));

    const passesMyInstrument = !myInstrumentFilter || song.myInstrumentUid === myInstrumentFilter;

    // Tuning/difficulty are per-instrument: not applicable when filtering for instrument-less songs.
    const passesTuning = isNoInstrument || !tuningFilter || (instrumentFilter && song.instrumentTuning && song.instrumentTuning[instrumentFilter] === tuningFilter);

    const rawSongDifficulty: unknown =
      instrumentFilter && song.instrumentDifficulty
        ? (song.instrumentDifficulty as Record<string, unknown>)[instrumentFilter]
        : undefined;
    const songDifficulty = (() => {
      if (rawSongDifficulty === undefined || rawSongDifficulty === null) return undefined;
      if (typeof rawSongDifficulty === 'number') return rawSongDifficulty;
      if (typeof rawSongDifficulty === 'string') {
        const trimmed = rawSongDifficulty.trim();
        if (!trimmed) return undefined;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : undefined;
      }
      const parsed = Number(rawSongDifficulty);
      return Number.isFinite(parsed) ? parsed : undefined;
    })();
    const passesDifficulty = isNoInstrument || !instrumentDifficultyFilter || (
      instrumentFilter
        ? (typeof songDifficulty === 'number' && Number.isFinite(songDifficulty) && songDifficulty <= instrumentDifficultyFilter)
        : false
    );

    const rawSongCapo: unknown = song.capo;
    const songCapo = (() => {
      if (rawSongCapo === undefined || rawSongCapo === null) return undefined;
      if (typeof rawSongCapo === 'number') {
        return Number.isInteger(rawSongCapo) && rawSongCapo >= 1 && rawSongCapo <= 12 ? rawSongCapo : undefined;
      }
      if (typeof rawSongCapo === 'string') {
        const trimmed = rawSongCapo.trim();
        if (!trimmed) return undefined;
        const parsed = Number(trimmed);
        return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : undefined;
      }
      const parsed = Number(rawSongCapo);
      return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : undefined;
    })();
    const passesCapo = capoFilter === '' || (typeof songCapo === 'number' && Number.isFinite(songCapo) && songCapo === capoFilter);

    const selectedTech = Array.from(techniqueFilters);
    const songTechniques = Array.isArray(song.technique)
      ? song.technique
      : (song.technique ? [song.technique] : []);
    const passesTechnique =
      selectedTech.length === 0 ||
      (techniqueMatchMode === 'all'
        ? selectedTech.every(t => songTechniques.includes(t))
        : selectedTech.some(t => songTechniques.includes(t)));

    const selectedGenres = Array.from(genreFilters);
    const songGenres = Array.isArray(song.genre)
      ? song.genre
      : (song.genre ? [song.genre] : []);
    const passesGenre =
      selectedGenres.length === 0 ||
      (genreMatchMode === 'all'
        ? selectedGenres.every(g => songGenres.includes(g))
        : selectedGenres.some(g => songGenres.includes(g)));

    const passesKey = !keyFilter || song.key === keyFilter;

    const min = bpmMinFilter ? parseInt(bpmMinFilter, 10) : undefined;
    const max = bpmMaxFilter ? parseInt(bpmMaxFilter, 10) : undefined;
    const bpm = song.bpm;
    const passesBpm = (
      (min === undefined || (typeof bpm === 'number' && bpm >= min)) &&
      (max === undefined || (typeof bpm === 'number' && bpm <= max))
    );

    const pitchMin = pitchStandardMinFilter ? parseInt(pitchStandardMinFilter, 10) : undefined;
    const pitchMax = pitchStandardMaxFilter ? parseInt(pitchStandardMaxFilter, 10) : undefined;
    const pitch = song.pitchStandard;
    const passesPitch = (
      (pitchMin === undefined || (typeof pitch === 'number' && pitch >= pitchMin)) &&
      (pitchMax === undefined || (typeof pitch === 'number' && pitch <= pitchMax))
    );

    const passesTimeSignature = !timeSignatureFilter || song.timeSignature === timeSignatureFilter;
    const passesMode = !modeFilter || song.mode === modeFilter;
    
    const selectedLanguages = Array.from(languageFilters);
    const songLanguages = Array.isArray(song.language)
      ? song.language
      : (song.language ? [song.language] : []);
    const passesLanguage =
      selectedLanguages.length === 0 ||
      (languageMatchMode === 'all'
        ? selectedLanguages.every(l => songLanguages.includes(l))
        : selectedLanguages.some(l => songLanguages.includes(l)));

    const passesPlaylist = !playlistFilter || (playlists.find(p => p.uid === playlistFilter)?.songUids || []).includes(song.uid);

    return passesSearch && passesInstrument && passesMyInstrument && passesTechnique && passesGenre && passesTuning && passesDifficulty && passesCapo && passesKey && passesBpm && passesPitch && passesTimeSignature && passesMode && passesLanguage && passesPlaylist;
  });
}