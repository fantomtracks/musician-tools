import { useEffect, useRef, useState, useMemo } from 'react';
import type React from 'react';
import type { CreateSongDTO, Song } from '../services/songService';
import type { SongPlay } from '../services/songPlayService';
import { instrumentTypeOptions, instrumentTechniquesMap } from '../constants/instrumentTypes';
import SongFormInstruments from './SongFormInstruments';
import { parseDurationToSeconds, formatSecondsToMmss } from '../utils/duration';
import { handleComboKeyDown, useScrollHighlightIntoView, comboboxInputAria, comboboxOptionAria } from '../utils/comboboxKeyboard';

type Mode = 'add' | 'edit';

type SongFormProps = {
  mode: Mode;
  form: CreateSongDTO;
  loading: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onSetDurationSeconds?: (seconds: number | null) => void;
  onToggleGenre: (genre: string) => void;
  onToggleLanguage: (language: string) => void;
  onChangeInstruments: (instruments: string[]) => void;
  onSetTechniques: (techniques: string[]) => void;
  onSetInstrumentDifficulty?: (instrumentType: string, difficulty: number | null) => void;
  onSetMyInstrumentUid: (uid: string | undefined) => void;
  onSetInstrumentTuning?: (instrumentType: string, tuning: string | null) => void;
  onToggleTechnique: (technique: string) => void;
  onSetInstrumentLinksForInstrument?: (instrumentType: string, links: Array<{ label?: string; url: string }>) => void;
  onSetStreamingLinks?: (links: Array<{ label: string; url: string }>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onMarkAsPlayedNow?: (instrumentType: string) => void;
  songPlays?: SongPlay[];
  formatLastPlayed?: (dateString: string | undefined) => string;
  myInstruments?: Array<{ uid: string; name: string; type?: string | null }>;
  playlistSlot?: React.ReactNode;
  suggestedAlbums?: string[];
  suggestedArtists?: string[];
  metadataLoading?: boolean;
  metadataSource?: string | null;
  onAutoFillMetadata?: () => Promise<void>;
  // An existing song matching the current title + artist, surfaced live so the
  // user is told before the submit guard blocks — when adding, or when renaming
  // a song into a collision. onEditDuplicate jumps straight to its edit screen.
  duplicate?: Song | null;
  onEditDuplicate?: () => void;
};

const keyOptions = ['C','C#','Db','D','Eb','E','F','F#','Gb','G','Ab','A','Bb','B'];
const timeSignatureOptions = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8', '5/8', '7/4', '3/8', 'Other'];
const modeOptions = ['Major', 'Minor', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian', 'Locrian', 'Other'];
const genreOptions = [
  'Acoustic',
  'Alternative',
  'Ambient',
  'Blues',
  'Classical',
  'Country',
  'Disco',
  'Drum & Bass',
  'EDM',
  'Electronic',
  'Folk',
  'Funk',
  'Gospel',
  'Hard Rock',
  'Hip-Hop',
  'House',
  'Indie',
  'Jazz',
  'K-Pop',
  'Latin',
  'Metal',
  'Pop',
  'Progressive',
  'Punk',
  'R&B / Soul',
  'Rap',
  'Reggae',
  'Rock',
  'Singer-Songwriter',
  'Ska',
  'Soundtrack',
  'Techno',
  'Trap',
  'World',
  'Other',
];

const languageOptions = [
  'Afrikaans', 'Albanian', 'Amharic', 'Arabic', 'Armenian', 'Azerbaijani',
  'Basque', 'Belarusian', 'Bengali', 'Bosnian', 'Bulgarian', 'Burmese',
  'Catalan', 'Chinese (Cantonese)', 'Chinese (Mandarin)', 'Croatian', 'Czech',
  'Danish', 'Dutch', 'English', 'Estonian', 'Farsi', 'Finnish', 'French',
  'Galician', 'Georgian', 'German', 'Greek', 'Gujarati', 'Haitian Creole',
  'Hausa', 'Hebrew', 'Hindi', 'Hungarian', 'Icelandic', 'Igbo', 'Indonesian',
  'Irish', 'Italian', 'Japanese', 'Javanese', 'Kannada', 'Kazakh', 'Khmer',
  'Kinyarwanda', 'Korean', 'Kurdish', 'Lao', 'Latvian', 'Lithuanian',
  'Macedonian', 'Malay', 'Malayalam', 'Maltese', 'Maori', 'Marathi',
  'Mongolian', 'Nepali', 'Norwegian', 'Odia', 'Pashto', 'Polish',
  'Portuguese', 'Punjabi', 'Quechua', 'Romanian', 'Russian', 'Serbian',
  'Sinhala', 'Slovak', 'Slovenian', 'Somali', 'Spanish', 'Swahili',
  'Swedish', 'Tagalog', 'Tamil', 'Tatar', 'Telugu', 'Thai', 'Turkish',
  'Ukrainian', 'Urdu', 'Uzbek', 'Vietnamese', 'Welsh', 'Wolof', 'Xhosa',
  'Yoruba', 'Zulu', 'Other'
];

const getAvailableTechniques = (instrumentType: string) => {
  if (!instrumentType) return [];
  const list = instrumentTechniquesMap[instrumentType] || [];
  return [...list].sort((a, b) => a.localeCompare(b));
};

export function SongForm(props: SongFormProps) {
  const { mode, form, loading, onChange, onSetDurationSeconds, onChangeInstruments, onSetTechniques, onToggleGenre, onToggleLanguage, onSetInstrumentDifficulty, onSetMyInstrumentUid, onSetInstrumentTuning, onToggleTechnique, onSetInstrumentLinksForInstrument, onSetStreamingLinks, onSubmit, onCancel, onDelete, onMarkAsPlayedNow, songPlays, formatLastPlayed, myInstruments, playlistSlot, suggestedAlbums = [], suggestedArtists = [], metadataLoading = false, metadataSource = null, onAutoFillMetadata, duplicate = null, onEditDuplicate } = props;
  const currentInstruments = useMemo(() => Array.isArray(form.instrument) ? form.instrument : (form.instrument ? [form.instrument] : []), [form.instrument]);
  const currentTechniques = useMemo(() => Array.isArray(form.technique) ? form.technique : [], [form.technique]);
  const currentGenres = Array.isArray(form.genre) ? form.genre : (form.genre ? [form.genre] : []);
  const currentLanguages = Array.isArray(form.language) ? form.language : (form.language ? [form.language] : []);
  const [selectedInstrumentType, setSelectedInstrumentType] = useState('');
  const [expandedInstruments, setExpandedInstruments] = useState<Set<string>>(new Set(currentInstruments));
  const [detailsAccordionOpen, setDetailsAccordionOpen] = useState(false);
  // Free-text duration ("3:30" or decimal minutes); committed to the form as
  // whole seconds on blur. Kept as local state so the user can type freely.
  const [durationText, setDurationText] = useState(() => formatSecondsToMmss(form.durationSeconds));
  const [durationError, setDurationError] = useState<string | null>(null);
  const lastCommittedSeconds = useRef<number | null>(form.durationSeconds ?? null);
  // Re-seed the text only when the stored value changes from outside (e.g.
  // loading a song for edit, or our own blur commit canonicalising the format).
  useEffect(() => {
    const current = form.durationSeconds ?? null;
    if (current !== lastCommittedSeconds.current) {
      lastCommittedSeconds.current = current;
      setDurationText(formatSecondsToMmss(current));
      setDurationError(null);
    }
  }, [form.durationSeconds]);
  const [genreSearchOpen, setGenreSearchOpen] = useState(false);
  const [genreSearchQuery, setGenreSearchQuery] = useState('');
  const [selectedGenreIndex, setSelectedGenreIndex] = useState(-1);
  const [languageSearchOpen, setLanguageSearchOpen] = useState(false);
  const [languageSearchQuery, setLanguageSearchQuery] = useState('');
  const [selectedLanguageIndex, setSelectedLanguageIndex] = useState(-1);
  // Keep the keyboard-highlighted option scrolled into view in the dropdowns.
  const genreListRef = useRef<HTMLDivElement>(null);
  const languageListRef = useRef<HTMLDivElement>(null);
  const artistListRef = useRef<HTMLDivElement>(null);
  const albumListRef = useRef<HTMLDivElement>(null);
  const [albumSearchOpen, setAlbumSearchOpen] = useState(false);
  const [selectedAlbumIndex, setSelectedAlbumIndex] = useState(-1);
  const [artistSearchOpen, setArtistSearchOpen] = useState(false);
  const [selectedArtistIndex, setSelectedArtistIndex] = useState(-1);
  // removed unused availableTechniques and filteredMyInstruments
  const allInstrumentLinks = Object.entries(form.instrumentLinks || {}).flatMap(([type, arr]) => (arr || []).map(l => ({ type, url: l.url, label: l.label })));

  useEffect(() => {
    // Filter out techniques that are not available for any of the current instruments
    if (currentInstruments.length === 0 && currentTechniques.length > 0) {
      onSetTechniques([]);
      return;
    }

    const allAvailableTechniques = new Set<string>();
    currentInstruments.forEach(inst => {
      const techniques = getAvailableTechniques(inst);
      techniques.forEach(t => allAvailableTechniques.add(t));
    });

    const nextTechniques = currentTechniques.filter(t => allAvailableTechniques.has(t));
    if (nextTechniques.length !== currentTechniques.length) {
      onSetTechniques(nextTechniques);
    }
  }, [currentInstruments, currentTechniques, onSetTechniques]);

  useScrollHighlightIntoView(genreListRef, selectedGenreIndex, genreSearchOpen);
  useScrollHighlightIntoView(languageListRef, selectedLanguageIndex, languageSearchOpen);
  useScrollHighlightIntoView(artistListRef, selectedArtistIndex, artistSearchOpen);
  useScrollHighlightIntoView(albumListRef, selectedAlbumIndex, albumSearchOpen);

  // Lifted so the keyboard handler and the rendered dropdown index the SAME list.
  const filteredGenreOptions = genreOptions.filter(
    g => !currentGenres.includes(g) && g.toLowerCase().includes(genreSearchQuery.toLowerCase()),
  );
  const filteredLanguageOptions = languageOptions.filter(
    language => !currentLanguages.includes(language) && language.toLowerCase().includes(languageSearchQuery.toLowerCase()),
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Top quick links aggregated from all instruments */}
      {allInstrumentLinks.length > 0 && (
        <>
          <div className="text-sm font-medium text-gray-700 dark:text-gray-100 mb-1">Links</div>
          <div className="flex flex-wrap gap-2">
            {allInstrumentLinks.map((lnk) => (
              <button
                key={`quick-link-${lnk.url}-${lnk.label ?? ''}`}
                type="button"
                className="inline-flex items-center rounded-md bg-brand-500 text-white px-3 py-1 text-sm hover:bg-brand-600 disabled:opacity-50"
                onClick={() => {
                  if (lnk.url && (lnk.url.startsWith('http://') || lnk.url.startsWith('https://'))) {
                    window.open(lnk.url, '_blank');
                  }
                }}
                title={`${lnk.label || lnk.url} • ${lnk.type}`}
              >
                <span className="mr-2 inline-flex items-center rounded bg-white/20 px-2 py-0.5 text-xs">{lnk.type}</span>
                <span className="truncate max-w-[12rem]">{lnk.label || lnk.url}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {form.streamingLinks && form.streamingLinks.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {form.streamingLinks.map((link, idx) => (
              <div
                key={`streaming-link-${link.url}-${link.label ?? ''}`}
                className="inline-flex items-center gap-1 rounded-md bg-blue-100 dark:bg-blue-900 px-3 py-1 text-sm text-blue-800 dark:text-blue-100"
              >
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline truncate max-w-[20rem]"
                  title={link.label || link.url}
                >
                  {link.label || link.url}
                </a>
                <button
                  type="button"
                  className="ml-1 rounded hover:bg-blue-200 dark:hover:bg-blue-800 px-1"
                  onClick={(e) => {
                    e.preventDefault();
                    const updatedLinks = (form.streamingLinks || []).filter((_, i) => i !== idx);
                    onSetStreamingLinks?.(updatedLinks);
                  }}
                  title="Remove link"
                  disabled={loading}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
      )}
      <div>
        <label htmlFor="song-artist" className="block text-sm font-medium text-gray-700 dark:text-gray-100">Artist</label>
        <div className="relative">
          <input
            id="song-artist"
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-gray-100"
            name="artist"
            value={form.artist}
            onChange={(e) => {
              onChange(e);
              if (e.target.value.length === 0) {
                setArtistSearchOpen(suggestedArtists.length > 0);
              } else {
                const filteredArtists = suggestedArtists.filter(artist => 
                  artist.toLowerCase().includes(e.target.value.toLowerCase())
                );
                const hasMatch = filteredArtists.length > 0;
                const isSingleExactMatch = filteredArtists.length === 1 && filteredArtists[0] === e.target.value;
                setArtistSearchOpen(hasMatch && !isSingleExactMatch);
              }
              setSelectedArtistIndex(-1);
            }}
            onKeyDown={(e) => {
              const filteredArtists = suggestedArtists.filter(artist => 
                !form.artist || artist.toLowerCase().includes(form.artist.toLowerCase())
              );
              
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setArtistSearchOpen(true);
                setSelectedArtistIndex(prev => 
                  prev < filteredArtists.length - 1 ? prev + 1 : prev
                );
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedArtistIndex(prev => prev > 0 ? prev - 1 : -1);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedArtistIndex >= 0 && filteredArtists[selectedArtistIndex]) {
                  onChange({
                    target: { name: 'artist', value: filteredArtists[selectedArtistIndex] }
                  } as React.ChangeEvent<HTMLInputElement>);
                  setArtistSearchOpen(false);
                  setSelectedArtistIndex(-1);
                }
              } else if (e.key === 'Escape') {
                setArtistSearchOpen(false);
                setSelectedArtistIndex(-1);
              } else if (e.key === 'Tab') {
                setArtistSearchOpen(false); // close now so Tab doesn't linger over the list
                setSelectedArtistIndex(-1);
              }
            }}
            onFocus={() => {
              const filteredArtists = suggestedArtists.filter(artist => 
                !form.artist || artist.toLowerCase().includes(form.artist.toLowerCase())
              );
              const isSingleExactMatch = filteredArtists.length === 1 && filteredArtists[0] === form.artist;
              setArtistSearchOpen(filteredArtists.length > 0 && !isSingleExactMatch);
            }}
            onBlur={() => setTimeout(() => setArtistSearchOpen(false), 200)}
            disabled={loading}
            autoComplete="off"
            {...comboboxInputAria('song-artist-list', artistSearchOpen, selectedArtistIndex)}
          />
          {artistSearchOpen && suggestedArtists.length > 0 && (
            <div ref={artistListRef} id="song-artist-list" role="listbox" className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-10 max-h-64 overflow-y-auto">
              {suggestedArtists
                .filter(artist =>
                  !form.artist || artist.toLowerCase().includes(form.artist.toLowerCase())
                )
                .map((artist, index) => (
                <button
                  key={artist}
                  type="button"
                  {...comboboxOptionAria('song-artist-list', index, selectedArtistIndex)}
                  className={`w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-600 last:border-b-0 ${
                    index === selectedArtistIndex ? 'bg-brand-100 dark:bg-brand-900/40' : ''
                  }`}
                  onMouseEnter={() => setSelectedArtistIndex(index)}
                  onClick={() => {
                    onChange({
                      target: { name: 'artist', value: artist }
                    } as React.ChangeEvent<HTMLInputElement>);
                    setArtistSearchOpen(false);
                    setSelectedArtistIndex(-1);
                  }}
                >
                  {artist}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div>
        <label htmlFor="song-title" className="block text-sm font-medium text-gray-700 dark:text-gray-100">Title</label>
        <input
          id="song-title"
          className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-gray-100"
          name="title"
          value={form.title}
          onChange={onChange}
          required
          disabled={loading}
        />
      </div>
      {duplicate && (
        <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 p-3 text-sm text-amber-800 dark:text-amber-100">
          <p>
            <span className="font-medium">"{duplicate.title}"</span>
            {duplicate.artist ? <> by <span className="font-medium">{duplicate.artist}</span></> : null}
            {' '}already exists in your songlist.
          </p>
          {onEditDuplicate && (
            <button
              type="button"
              onClick={onEditDuplicate}
              className="mt-1 font-medium text-brand-600 dark:text-brand-400 hover:underline"
              disabled={loading}
            >
              Edit this song →
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={onAutoFillMetadata}
          disabled={loading || metadataLoading || !form.title || !form.artist}
        >
          {metadataLoading ? 'Auto-filling...' : 'Auto-fill metadata & links'}
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {metadataSource ? `Metadata found: ${metadataSource}` : 'Title + artist required'}
        </p>
      </div>
      <div className="border border-gray-200 dark:border-gray-700 rounded-md divide-y divide-gray-200 dark:divide-gray-700">
        <button
          type="button"
          className={`w-full flex items-center justify-between px-3 h-10 hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-100 overflow-hidden ${detailsAccordionOpen ? 'rounded-t-md' : 'rounded-md'}`}
          onClick={() => setDetailsAccordionOpen(!detailsAccordionOpen)}
          aria-expanded={detailsAccordionOpen}
        >
          <span className="font-medium">Details</span>
          <span>{detailsAccordionOpen ? '▾' : '▸'}</span>
        </button>
        {detailsAccordionOpen && (
          <div className="mt-0 space-y-4 p-3 bg-gray-50 dark:bg-gray-800 overflow-visible rounded-b-md">
            <div>
              <label htmlFor="genres-search" className="block text-sm font-medium text-gray-700 dark:text-gray-100 mb-2">Genres</label>
              <div className="relative z-30">
                <input
                  id="genres-search"
                  type="text"
                  placeholder="Search or select a genre"
                  value={genreSearchQuery}
                  onChange={(e) => { setGenreSearchQuery(e.target.value); setSelectedGenreIndex(-1); }}
                  onFocus={() => setGenreSearchOpen(true)}
                  onBlur={() => setTimeout(() => setGenreSearchOpen(false), 200)}
                  onKeyDown={(e) => handleComboKeyDown(
                    e, filteredGenreOptions, selectedGenreIndex, setSelectedGenreIndex, setGenreSearchOpen,
                    (genre) => { onToggleGenre(genre); setGenreSearchQuery(''); setGenreSearchOpen(false); setSelectedGenreIndex(-1); },
                  )}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-gray-100"
                  disabled={loading}
                  {...comboboxInputAria('song-genres-list', genreSearchOpen, selectedGenreIndex)}
                />
                {genreSearchOpen && (
                    <div ref={genreListRef} id="song-genres-list" role="listbox" className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg max-h-32 overflow-y-auto">
                      {filteredGenreOptions.map((genre, index) => (
                          <button
                            key={genre}
                            type="button"
                            {...comboboxOptionAria('song-genres-list', index, selectedGenreIndex)}
                            onMouseEnter={() => setSelectedGenreIndex(index)}
                            onClick={() => {
                              onToggleGenre(genre);
                              setGenreSearchQuery('');
                              setGenreSearchOpen(false);
                              setSelectedGenreIndex(-1);
                            }}
                            className={`w-full text-left px-3 py-2 text-gray-700 dark:text-gray-100 ${
                              index === selectedGenreIndex ? 'bg-brand-100 dark:bg-brand-900/40' : ''
                            }`}
                            disabled={loading}
                          >
                            {genre}
                          </button>
                        ))}
                      {filteredGenreOptions.length === 0 && (
                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No genres found</div>
                      )}
                    </div>
                )}
              </div>
              {currentGenres.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {currentGenres.map(genre => (
                    <button
                      key={genre}
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full bg-brand-500 text-white px-3 py-1 text-sm hover:bg-brand-600 disabled:opacity-50"
                      onClick={() => onToggleGenre(genre)}
                      disabled={loading}
                      title={genre}
                    >
                      <span className="truncate">{genre}</span>
                      <span>✕</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label htmlFor="song-album" className="block text-sm font-medium text-gray-700 dark:text-gray-100">Album</label>
              {/* z-[25] keeps the album dropdown above the Languages block (z-20) below it, while
                  staying below the Genres block (z-30) above it so the Genres dropdown still wins */}
              <div className="relative z-[25]">
                <input
                  id="song-album"
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-gray-100"
                  name="album"
                  value={typeof form.album === 'string' ? form.album : ''}
                  onChange={(e) => {
                    onChange(e);
                    if (e.target.value.length === 0) {
                      setAlbumSearchOpen(suggestedAlbums.length > 0);
                    } else {
                      const filteredAlbums = suggestedAlbums.filter(album => 
                        album.toLowerCase().includes(e.target.value.toLowerCase())
                      );
                      const hasMatch = filteredAlbums.length > 0;
                      const isSingleExactMatch = filteredAlbums.length === 1 && filteredAlbums[0] === e.target.value;
                      setAlbumSearchOpen(hasMatch && !isSingleExactMatch);
                    }
                    setSelectedAlbumIndex(-1);
                  }}
                  onKeyDown={(e) => {
                    const filteredAlbums = suggestedAlbums.filter(album => 
                      !form.album || album.toLowerCase().includes(form.album.toLowerCase())
                    );
                    
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setAlbumSearchOpen(true);
                      setSelectedAlbumIndex(prev => 
                        prev < filteredAlbums.length - 1 ? prev + 1 : prev
                      );
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSelectedAlbumIndex(prev => prev > 0 ? prev - 1 : -1);
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      if (selectedAlbumIndex >= 0 && filteredAlbums[selectedAlbumIndex]) {
                        onChange({
                          target: { name: 'album', value: filteredAlbums[selectedAlbumIndex] }
                        } as React.ChangeEvent<HTMLInputElement>);
                        setAlbumSearchOpen(false);
                        setSelectedAlbumIndex(-1);
                      }
                    } else if (e.key === 'Escape') {
                      setAlbumSearchOpen(false);
                      setSelectedAlbumIndex(-1);
                    } else if (e.key === 'Tab') {
                      setAlbumSearchOpen(false); // close now so Tab doesn't linger over the list
                      setSelectedAlbumIndex(-1);
                    }
                  }}
                  onFocus={() => {
                    const filteredAlbums = suggestedAlbums.filter(album => 
                      !form.album || album.toLowerCase().includes(form.album.toLowerCase())
                    );
                    const isSingleExactMatch = filteredAlbums.length === 1 && filteredAlbums[0] === form.album;
                    setAlbumSearchOpen(filteredAlbums.length > 0 && !isSingleExactMatch);
                  }}
                  onBlur={() => setTimeout(() => setAlbumSearchOpen(false), 200)}
                  disabled={loading}
                  autoComplete="off"
                  {...comboboxInputAria('song-album-list', albumSearchOpen, selectedAlbumIndex)}
                />
                {albumSearchOpen && suggestedAlbums.length > 0 && (
                  <div ref={albumListRef} id="song-album-list" role="listbox" className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
                    {suggestedAlbums
                      .filter(album =>
                        !form.album || album.toLowerCase().includes(form.album.toLowerCase())
                      )
                      .map((album, index) => (
                      <button
                        key={album}
                        type="button"
                        {...comboboxOptionAria('song-album-list', index, selectedAlbumIndex)}
                        className={`w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-600 last:border-b-0 ${
                          index === selectedAlbumIndex ? 'bg-brand-100 dark:bg-brand-900/40' : ''
                        }`}
                        onMouseEnter={() => setSelectedAlbumIndex(index)}
                        onClick={() => {
                          onChange({
                            target: { name: 'album', value: album }
                          } as React.ChangeEvent<HTMLInputElement>);
                          setAlbumSearchOpen(false);
                          setSelectedAlbumIndex(-1);
                        }}
                      >
                        {album}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label htmlFor="language-search" className="block text-sm font-medium text-gray-700 dark:text-gray-100 mb-2">Languages</label>
              <div className="relative z-20">
                <input
                  id="language-search"
                  type="text"
                  placeholder="Search or select a language"
                  value={languageSearchQuery}
                  onChange={(e) => { setLanguageSearchQuery(e.target.value); setSelectedLanguageIndex(-1); }}
                  onFocus={() => setLanguageSearchOpen(true)}
                  onBlur={() => setTimeout(() => setLanguageSearchOpen(false), 200)}
                  onKeyDown={(e) => handleComboKeyDown(
                    e, filteredLanguageOptions, selectedLanguageIndex, setSelectedLanguageIndex, setLanguageSearchOpen,
                    (language) => { onToggleLanguage(language); setLanguageSearchQuery(''); setLanguageSearchOpen(false); setSelectedLanguageIndex(-1); },
                  )}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-gray-100"
                  disabled={loading}
                  {...comboboxInputAria('song-languages-list', languageSearchOpen, selectedLanguageIndex)}
                />
                {languageSearchOpen && (
                    <div ref={languageListRef} id="song-languages-list" role="listbox" className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg max-h-32 overflow-y-auto">
                      {filteredLanguageOptions.map((language, index) => (
                          <button
                            key={language}
                            type="button"
                            {...comboboxOptionAria('song-languages-list', index, selectedLanguageIndex)}
                            onMouseEnter={() => setSelectedLanguageIndex(index)}
                            onClick={() => {
                              onToggleLanguage(language);
                              setLanguageSearchQuery('');
                              setLanguageSearchOpen(false);
                              setSelectedLanguageIndex(-1);
                            }}
                            className={`w-full text-left px-3 py-2 text-gray-700 dark:text-gray-100 ${
                              index === selectedLanguageIndex ? 'bg-brand-100 dark:bg-brand-900/40' : ''
                            }`}
                            disabled={loading}
                          >
                            {language}
                          </button>
                        ))}
                      {filteredLanguageOptions.length === 0 && (
                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No languages found</div>
                      )}
                    </div>
                )}
              </div>
              {currentLanguages.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {currentLanguages.map(language => (
                    <button
                      key={language}
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full bg-brand-500 text-white px-3 py-1 text-sm hover:bg-brand-600 disabled:opacity-50"
                      onClick={() => onToggleLanguage(language)}
                      disabled={loading}
                      title={language}
                    >
                      <span className="truncate">{language}</span>
                      <span>✕</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="song-duration" className="block text-sm font-medium text-gray-700 dark:text-gray-100">Duration (m:ss)</label>
                <input
                  id="song-duration"
                  className={`mt-1 block w-full rounded-md border ${durationError ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'} p-2 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-gray-100`}
                  name="durationSeconds"
                  type="text"
                  inputMode="numeric"
                  value={durationText}
                  aria-invalid={durationError ? true : undefined}
                  aria-describedby={durationError ? 'song-duration-error' : undefined}
                  onChange={(e) => {
                    setDurationText(e.target.value);
                    if (durationError) setDurationError(null);
                  }}
                  onBlur={() => {
                    const trimmed = durationText.trim();
                    if (trimmed === '') {
                      // Cleared on purpose — no error, commit "no duration".
                      setDurationError(null);
                      setDurationText('');
                      lastCommittedSeconds.current = null;
                      onSetDurationSeconds?.(null);
                      return;
                    }
                    const seconds = parseDurationToSeconds(durationText);
                    if (seconds === null) {
                      // Keep what the user typed and tell them what's wrong.
                      setDurationError('Use m:ss (e.g. 3:30) or whole minutes; seconds must be 0–59.');
                      return;
                    }
                    setDurationError(null);
                    setDurationText(formatSecondsToMmss(seconds)); // canonicalise (3:3 → 3:30)
                    lastCommittedSeconds.current = seconds;
                    onSetDurationSeconds?.(seconds);
                  }}
                  disabled={loading}
                />
                {durationError && (
                  <p id="song-duration-error" className="mt-1 text-sm text-red-600 dark:text-red-400">{durationError}</p>
                )}
              </div>
              <div>
                <label htmlFor="song-bpm" className="block text-sm font-medium text-gray-700 dark:text-gray-100">BPM</label>
                <input
                  id="song-bpm"
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-gray-100"
                  name="bpm"
                  type="number"
                  value={form.bpm ?? ''}
                  onChange={onChange}
                  min={0}
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="song-time-signature" className="block text-sm font-medium text-gray-700 dark:text-gray-100">Time Signature</label>
                <select
                  id="song-time-signature"
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-gray-100"
                  name="timeSignature"
                  value={form.timeSignature || ''}
                  onChange={onChange}
                  disabled={loading}
                >
                  <option value="">Select a time signature</option>
                  {timeSignatureOptions.map(ts => (
                    <option key={ts} value={ts}>{ts}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="song-key" className="block text-sm font-medium text-gray-700 dark:text-gray-100">Key</label>
                <select
                  id="song-key"
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-gray-100"
                  name="key"
                  value={form.key || ''}
                  onChange={onChange}
                  disabled={loading}
                >
                  <option value="">Select a key</option>
                  {keyOptions.map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="song-mode" className="block text-sm font-medium text-gray-700 dark:text-gray-100">Mode</label>
                <select
                  id="song-mode"
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-gray-100"
                  name="mode"
                  value={form.mode || ''}
                  onChange={onChange}
                  disabled={loading}
                >
                  <option value="">Select a mode</option>
                  {modeOptions.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="song-pitch-standard" className="block text-sm font-medium text-gray-700 dark:text-gray-100">Pitch Standard (Hz)</label>
                <input
                  id="song-pitch-standard"
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-gray-100"
                  name="pitchStandard"
                  type="number"
                  value={form.pitchStandard ?? 440}
                  onChange={onChange}
                  min={400}
                  max={500}
                  disabled={loading}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      <div>
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-100 mb-2">Instruments</span>
        <SongFormInstruments
          currentInstruments={currentInstruments}
          capo={form.capo ?? null}
          instrumentDifficulty={form.instrumentDifficulty || {}}
          instrumentTuning={form.instrumentTuning || {}}
          currentTechniques={currentTechniques}
          instrumentLinks={form.instrumentLinks || null}
          myInstrumentUid={form.myInstrumentUid}
          onChangeInstruments={onChangeInstruments}
          onSetInstrumentDifficulty={onSetInstrumentDifficulty}
          onSetCapo={(capo) => {
            onChange({
              target: {
                name: 'capo',
                value: capo === null ? '' : String(capo),
              },
            } as React.ChangeEvent<HTMLInputElement>);
          }}
          onSetInstrumentTuning={onSetInstrumentTuning}
          onToggleTechnique={onToggleTechnique}
          onSetInstrumentLinksForInstrument={onSetInstrumentLinksForInstrument}
          onSetMyInstrumentUid={onSetMyInstrumentUid}
          onMarkAsPlayedNow={onMarkAsPlayedNow}
          myInstruments={myInstruments}
          songPlays={songPlays}
          formatLastPlayed={formatLastPlayed}
          mode={mode}
          loading={loading}
          expandedInstruments={expandedInstruments}
          setExpandedInstruments={setExpandedInstruments}
        />
        
        <div className="mt-4">
          <label htmlFor="add-instrument" className="block text-sm font-medium text-gray-700 dark:text-gray-100 mb-2">Add an instrument</label>
          <select
            id="add-instrument"
            value={selectedInstrumentType}
            onChange={(e) => {
              const value = e.target.value;
              if (value && !currentInstruments.includes(value)) {
                onChangeInstruments([...currentInstruments, value]);
                setExpandedInstruments(new Set([...expandedInstruments, value]));
              }
              setSelectedInstrumentType('');
            }}
            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-gray-100"
            disabled={loading}
          >
            <option value="">Select an instrument to add</option>
            {instrumentTypeOptions.filter(inst => !currentInstruments.includes(inst)).map(inst => (
              <option key={inst} value={inst}>{inst}</option>
            ))}
          </select>
        </div>
      </div>

      {playlistSlot}

      <div>
        <label htmlFor="song-notes" className="block text-sm font-medium text-gray-700 dark:text-gray-100">Notes</label>
        <textarea
          id="song-notes"
          className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-gray-100"
          name="notes"
          value={form.notes}
          onChange={onChange}
          rows={2}
          disabled={loading}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div>
          {mode === 'edit' && onDelete && (
            <button
              type="button"
              className="inline-flex items-center rounded-md bg-red-600 text-white px-3 py-2 hover:bg-red-700 disabled:opacity-50"
              onClick={onDelete}
              disabled={loading}
            >
              Delete
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-2 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-brand-500 text-white px-3 py-2 hover:bg-brand-600 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Loading...' : mode === 'edit' ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </form>
  );
}
