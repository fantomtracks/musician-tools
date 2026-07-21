import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import { SongForm } from '../components/SongForm';
import SongsList from '../components/SongsList';
import { songService, SongConflictError, type CreateSongDTO, type UpdateSongDTO, type Song } from '../services/songService';
import { instrumentService, type Instrument } from '../services/instrumentService';
import { songPlayService, type SongPlay } from '../services/songPlayService';
import { playlistService, PlaylistConflictError, type Playlist } from '../services/playlistService';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { instrumentTechniquesMap, instrumentTuningsMap, instrumentTypeOptions } from '../constants/instrumentTypes';
import { applySongFilters, countActiveFilters, NO_INSTRUMENT } from '../utils/songFilters';
import { handleComboKeyDown, useScrollHighlightIntoView, comboboxInputAria, comboboxOptionAria } from '../utils/comboboxKeyboard';
import { useAutosave } from '../hooks/useAutosave';
import { useRowSelection } from '../hooks/useRowSelection';
import EmptySonglistCollections from '../components/EmptySonglistCollections';
import { StickyActionBar } from '../components/StickyActionBar';
import { findDuplicateSong } from '../utils/songDuplicate';
import { formatLocalDate } from '../utils/heatmap';

const initialSong: CreateSongDTO = {
  title: '',
  bpm: null,
  durationSeconds: null,
  key: '',
  capo: null,
  notes: '',
  instrument: [],
  instrumentDifficulty: {},
  instrumentTuning: {},
  artist: '',
  album: '',
  language: [],
  genre: [],
  technique: [],
  pitchStandard: 440,
  timeSignature: '',
  mode: '',
  lastPlayed: undefined,
};

function Songs() {
  const normalizeCapoValue = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) return null;
    return parsed;
  };

  const [songs, setSongs] = useState<Song[]>([]);
  const [form, setForm] = useState<CreateSongDTO>(initialSong);
  // Story 18.2: editingUid + the list/form mode are DERIVED from the URL (see the
  // useParams block below), not useState — /songs (list), /songs/new (add),
  // /songs/:uid (edit). Refresh keeps the open song; the browser Back button is
  // handled by useBlocker.
  // Story 13.1: serialization of the form as last loaded/saved, used to skip
  // redundant auto-saves (compared form-to-form, so it's stable). null = not editing.
  const [editBaselineJson, setEditBaselineJson] = useState<string | null>(null);
  // Story 13.1: ambient auto-save status shown next to the title while editing.
  // Story 17.2: 'conflict' = a duplicate (title+artist) blocked the write (client
  // guard or a server 409) — distinct from 'error' (a retryable network/500 failure).
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle');
  // Local clock time (HH:MM) of the last successful save — reassurance that it landed.
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  // Removed unused sortByLastPlayed
  const [sortColumn, setSortColumn] = useState<string | null>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsSortColumn') : null;
    return saved ? saved : null;
  });
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsSortDirection') : null;
    return saved === 'desc' ? 'desc' : 'asc';
  });
  const [genreFilters, setGenreFilters] = useState<Set<string>>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsGenreFilters') : null;
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [genreMatchMode, setGenreMatchMode] = useState<'any' | 'all'>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsGenreMatchMode') : null;
    return saved === 'any' ? 'any' : 'all';
  });
  // Story 18.2: deep-link to /songs/:uid with an unknown/foreign uid → getSong 404
  // (scoped, story 7.5) → "Song not found" screen.
  const [notFound, setNotFound] = useState(false);
  // True only once the edit form actually represents its /songs/:uid target (record
  // built or fetch resolved) — NOT while a deep-link is still loading and NOT on a 404.
  // Gates the empty-title guards so an unbuilt/not-found form is never mistaken for a
  // fresh titleless draft and silently deleted (code-review 18.2, HIGH).
  const [formReady, setFormReady] = useState(false);
  // True when the edit form was opened by following the "already exists" link
  // from the add form — drives the "reset your filters" hint, since a song
  // reached that way is typically hidden from the list by a filter.
  const [cameFromDuplicate, setCameFromDuplicate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Persistent row selection (survives refresh via localStorage) — shared hook (19.9).
  const songSelection = useRowSelection({ persistKey: 'songsSelectedUids' });
  const selectedSongs = songSelection.selected; // the live Set — .size / .has / Array.from stay as-is
  const [bulkPlaylistOpen, setBulkPlaylistOpen] = useState(false);
  const [bulkPlaylistSelection, setBulkPlaylistSelection] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  // Story 17.2: popup shown when leaving a song whose title was emptied AND it has
  // value (other fields / practice / playlist). A "fresh" titleless draft is deleted
  // silently instead (Seuil 1).
  const [emptyTitleDialogOpen, setEmptyTitleDialogOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'single' | 'multiple' | null>(null);
  const [deleteUid, setDeleteUid] = useState<string | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataSource, setMetadataSource] = useState<string | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsSidebarExpanded') : null;
    return saved === 'false' ? false : true; // default to expanded unless persisted false
  });
  // Mobile-only "Filters" disclosure (< lg). Ephemeral by design — never persisted (D7).
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [instrumentFilter, setInstrumentFilter] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsInstrumentFilter') : null;
    return saved ? saved : '';
  });
  const [instrumentDifficultyFilter, setInstrumentDifficultyFilter] = useState<number | ''>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsInstrumentDifficultyFilter') : null;
    return saved ? Number(saved) : '';
  });
  const [capoFilter, setCapoFilter] = useState<number | ''>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsCapoFilter') : null;
    const normalized = saved !== null ? normalizeCapoValue(saved) : null;
    return normalized === null ? '' : normalized;
  });
  const [myInstrumentFilter, setMyInstrumentFilter] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsMyInstrumentFilter') : null;
    return saved ? saved : '';
  });
  const [myInstruments, setMyInstruments] = useState<Instrument[]>([]);
  const [instrumentMatchMode, setInstrumentMatchMode] = useState<'any' | 'all'>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsInstrumentMatchMode') : null;
    return saved === 'any' ? 'any' : 'all'; // default to 'all' for exclusive filtering
  });
  const [techniqueFilters, setTechniqueFilters] = useState<Set<string>>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsTechniqueFilters') : null;
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [techniqueMatchMode, setTechniqueMatchMode] = useState<'any' | 'all'>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsTechniqueMatchMode') : null;
    return saved === 'any' ? 'any' : 'all';
  });
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsSearchQuery') : null;
    return saved || '';
  });
  const [tuningFilter, setTuningFilter] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsTuningFilter') : null;
    return saved || '';
  });
  const [keyFilter, setKeyFilter] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsKeyFilter') : null;
    return saved || '';
  });
  const [bpmMinFilter, setBpmMinFilter] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsBpmMinFilter') : null;
    return saved || '';
  });
  const [bpmMaxFilter, setBpmMaxFilter] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsBpmMaxFilter') : null;
    return saved || '';
  });
  const [pitchStandardMinFilter, setPitchStandardMinFilter] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsPitchStandardMinFilter') : null;
    return saved || '';
  });
  const [pitchStandardMaxFilter, setPitchStandardMaxFilter] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsPitchStandardMaxFilter') : null;
    return saved || '';
  });
  const [filtersAccordionOpen, setFiltersAccordionOpen] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsFiltersAccordionOpen') : null;
    return saved === 'false' ? false : true;
  });
  const [tuningAccordionOpen, setTuningAccordionOpen] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsTuningAccordionOpen') : null;
    return saved === 'false' ? false : true;
  });
  const [difficultyAccordionOpen, setDifficultyAccordionOpen] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsDifficultyAccordionOpen') : null;
    return saved === 'false' ? false : true;
  });
  const [capoAccordionOpen, setCapoAccordionOpen] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsCapoAccordionOpen') : null;
    return saved === 'false' ? false : true;
  });
  const [keyAccordionOpen, setKeyAccordionOpen] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsKeyAccordionOpen') : null;
    return saved === 'false' ? false : true;
  });
  const [techniqueAccordionOpen, setTechniqueAccordionOpen] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsTechniqueAccordionOpen') : null;
    return saved === 'false' ? false : true;
  });
  const [songPlays, setSongPlays] = useState<Map<string, SongPlay[]>>(new Map());
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistFilter, setPlaylistFilter] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsPlaylistFilter') : null;
    return saved ? saved : '';
  });
  const [playlistAccordionOpen, setPlaylistAccordionOpen] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsPlaylistAccordionOpen') : null;
    return saved === 'false' ? false : true;
  });
  const [genreAccordionOpen, setGenreAccordionOpen] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsGenreAccordionOpen') : null;
    return saved === 'false' ? false : true;
  });
  const [bpmAccordionOpen, setBpmAccordionOpen] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsBpmAccordionOpen') : null;
    return saved === 'false' ? false : true;
  });
  const [pitchAccordionOpen, setPitchAccordionOpen] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsPitchAccordionOpen') : null;
    return saved === 'false' ? false : true;
  });
  const [timeSignatureAccordionOpen, setTimeSignatureAccordionOpen] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsTimeSignatureAccordionOpen') : null;
    return saved === 'false' ? false : true;
  });
  const [modeAccordionOpen, setModeAccordionOpen] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsModeAccordionOpen') : null;
    return saved === 'false' ? false : true;
  });
  const [timeSignatureFilter, setTimeSignatureFilter] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsTimeSignatureFilter') : null;
    return saved || '';
  });
  const [modeFilter, setModeFilter] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsModeFilter') : null;
    return saved || '';
  });
  const [languageFilters, setLanguageFilters] = useState<Set<string>>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsLanguageFilters') : null;
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [languageMatchMode, setLanguageMatchMode] = useState<'any' | 'all'>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsLanguageMatchMode') : null;
    return saved === 'any' ? 'any' : 'all';
  });
  const [languageAccordionOpen, setLanguageAccordionOpen] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsLanguageAccordionOpen') : null;
    return saved === 'false' ? false : true;
  });
  // States for editing song plays and playlists
  const [editingSongPlays, setEditingSongPlays] = useState<SongPlay[]>([]);
  const [selectedPlaylistUids, setSelectedPlaylistUids] = useState<Set<string>>(new Set());
  const [playlistSearchOpen, setPlaylistSearchOpen] = useState(false);
  const [playlistSearchQuery, setPlaylistSearchQuery] = useState('');
  const [selectedPlaylistIndex, setSelectedPlaylistIndex] = useState(-1);
  const playlistListRef = useRef<HTMLDivElement>(null);
  // Tracks which editingUid we've already seeded the playlist selection for, so a
  // later `playlists` change (e.g. creating a playlist on the fly) does NOT reset
  // the user's unsaved toggles. See the editing-data effect.
  const seededPlaylistsForEditRef = useRef<string | null>(null);
  // Same filtered list the dropdown renders, so the keyboard highlight matches.
  // Trim the query so a trailing space can't desync this from the create-detection.
  const filteredPlaylists = playlists.filter(
    p => !selectedPlaylistUids.has(p.uid) && p.name.toLowerCase().includes(playlistSearchQuery.trim().toLowerCase()),
  );
  // Story 10.2: offer "Create playlist" when the typed name matches NO existing
  // playlist (case-insensitive, same folding as the server's lower(name) index).
  // Compare against ALL playlists, not filteredPlaylists (which hides selected ones).
  const rawCreatePlaylistText = playlistSearchQuery.trim();
  const hasExactPlaylist = playlists.some(
    p => p.name.trim().toLowerCase() === rawCreatePlaylistText.toLowerCase(),
  );
  const showCreatePlaylist = playlistSearchOpen && rawCreatePlaylistText !== '' && !hasExactPlaylist;
  // The keyboard list MUST equal the rendered list (index alignment): existing
  // options first, then the Create option last when shown.
  const CREATE_PLAYLIST_OPTION = { __createPlaylist: true } as const;
  type PlaylistPickerOption = Playlist | typeof CREATE_PLAYLIST_OPTION;
  const playlistPickerOptions: PlaylistPickerOption[] = showCreatePlaylist
    ? [...filteredPlaylists, CREATE_PLAYLIST_OPTION]
    : filteredPlaylists;
  useScrollHighlightIntoView(playlistListRef, selectedPlaylistIndex, playlistSearchOpen);
  const [suggestedAlbums, setSuggestedAlbums] = useState<string[]>([]);
  const [suggestedArtists, setSuggestedArtists] = useState<string[]>([]);
  const [languageFilterOptions, setLanguageFilterOptions] = useState<string[]>([]);
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);
  // Removed unused user, logout from useAuth
  
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();

  // Story 18.2 — mode derived from the URL. /songs → list ; /songs/new → add
  // (editingUid null) ; /songs/:uid → edit. (react-router prefers the static
  // 'songs/new' route over 'songs/:uid', so params.uid is never 'new'.)
  const isNewSongRoute = location.pathname === '/songs/new';
  const editingUid = params.uid ?? null;
  const page: 'list' | 'form' = editingUid !== null || isNewSongRoute ? 'form' : 'list';
  // Which song uid the `form` currently represents ('__new__' = the blank add draft,
  // undefined = nothing). Lets the load effect skip rebuilding the form when the URL
  // already matches it — e.g. right after an auto-create, so live typing isn't clobbered.
  const loadedFormUidRef = useRef<string | null | undefined>(undefined);
  // Live pathname + mount flag, read by the in-flight-create guard so it decides
  // "did the user leave /songs/new?" against the CURRENT location, not a value frozen
  // in the closure when the debounce fired (code-review 18.2).
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;
  const isMountedRef = useRef(true);
  // Set true in SETUP (not just default) so StrictMode's mount→unmount→mount in dev —
  // whose cleanup flips it false — leaves it true after the re-mount. Otherwise the
  // in-flight-create guard reads a permanently-false mount flag and skips the
  // add→edit navigate, stranding the form in add mode (self-duplicate on every title).
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);
  // True while a DELIBERATE delete-then-navigate is in progress, so the empty-title
  // useBlocker doesn't fire a second "no title" popup on top of the delete (the leave
  // is intentional — the song is being removed). Read live in the blocker predicate.
  const deletingRef = useRef(false);

  // Single source of truth: the count drives both the boolean and the mobile "Filters · N" badge.
  const activeFilterCount = countActiveFilters({
    instrumentFilter,
    myInstrumentFilter,
    instrumentDifficultyFilter,
    capoFilter,
    tuningFilter,
    keyFilter,
    bpmMinFilter,
    bpmMaxFilter,
    pitchStandardMinFilter,
    pitchStandardMaxFilter,
    timeSignatureFilter,
    modeFilter,
    languageFilters,
    playlistFilter,
    techniqueFilters,
    genreFilters,
  });
  const hasActiveFilters = activeFilterCount > 0;

  const clearAllFilters = () => {
    setInstrumentFilter('');
    setMyInstrumentFilter('');
    setInstrumentDifficultyFilter('');
    setCapoFilter('');
    setInstrumentMatchMode('all');
    setTechniqueFilters(new Set());
    setTechniqueMatchMode('all');
    setGenreFilters(new Set());
    setGenreMatchMode('all');
    setTuningFilter('');
    setKeyFilter('');
    setBpmMinFilter('');
    setBpmMaxFilter('');
    setPitchStandardMinFilter('');
    setPitchStandardMaxFilter('');
    setTimeSignatureFilter('');
    setModeFilter('');
    setLanguageFilters(new Set());
    setLanguageMatchMode('all');
    setPlaylistFilter('');
  };



  const toggleTechniqueFilter = (technique: string) => {
    setTechniqueFilters(prev => {
      const next = new Set(prev);
      if (next.has(technique)) next.delete(technique);
      else next.add(technique);
      return next;
    });
  };

  const toggleGenreFilter = (genre: string) => {
    setGenreFilters(prev => {
      const next = new Set(prev);
      if (next.has(genre)) next.delete(genre);
      else next.add(genre);
      return next;
    });
  };

  const toggleLanguageFilter = (language: string) => {
    setLanguageFilters(prev => {
      const next = new Set(prev);
      if (next.has(language)) next.delete(language);
      else next.add(language);
      return next;
    });
  };

  // Story 18.2: the "Songs" header link now just navigates to /songs (the list route)
  // — no more location.state resetToList mechanism. Leaving the form flushes via the
  // unmount-flush effect + useBlocker; the URL is the source of truth.


  useEffect(() => {
    const loadSongs = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await songService.getAllSongs();
        setSongs(data);
        // Charger les plays pour toutes les chansons
        const playsMap = new Map<string, SongPlay[]>();
        await Promise.all(
          data.map(async (song) => {
            try {
              const plays = await songPlayService.getPlays(song.uid);
              playsMap.set(song.uid, plays);
            } catch (err) {
              console.error(`Failed to load plays for ${song.uid}:`, err);
              playsMap.set(song.uid, []);
            }
          })
        );
        setSongPlays(playsMap);
      } catch (err) {
        setError('Error while loading songs');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    const loadPlaylists = async () => {
      try {
        const list = await playlistService.getAllPlaylists();
        setPlaylists(list);
      } catch (err) {
        console.error('Error loading playlists:', err);
      }
    };
    loadSongs();
    loadPlaylists();
    (async () => {
      try {
        const list = await instrumentService.getAll();
        setMyInstruments(list);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsSidebarExpanded', sidebarExpanded ? 'true' : 'false');
    } catch { /* ignore */ }
  }, [sidebarExpanded]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsInstrumentMatchMode', instrumentMatchMode);
    } catch { /* ignore */ }
  }, [instrumentMatchMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsInstrumentFilter', instrumentFilter);
    } catch { /* ignore */ }
  }, [instrumentFilter]);

  useEffect(() => {
    try {
      if (instrumentDifficultyFilter === '') {
        window.localStorage.removeItem('songsInstrumentDifficultyFilter');
      } else {
        window.localStorage.setItem('songsInstrumentDifficultyFilter', String(instrumentDifficultyFilter));
      }
    } catch { /* ignore */ }
  }, [instrumentDifficultyFilter]);

  useEffect(() => {
    try {
      if (capoFilter === '') {
        window.localStorage.removeItem('songsCapoFilter');
      } else {
        window.localStorage.setItem('songsCapoFilter', String(capoFilter));
      }
    } catch { /* ignore */ }
  }, [capoFilter]);

  useEffect(() => {
    if (instrumentFilter !== 'Guitar') {
      setCapoFilter('');
    }

    if (!instrumentFilter) {
      setInstrumentDifficultyFilter('');
      setTechniqueFilters(new Set());
      setTuningFilter('');
      return;
    }

    const allowedTechniques = new Set(instrumentTechniquesMap[instrumentFilter] || []);
    setTechniqueFilters(prev => {
      const next = new Set(Array.from(prev).filter(t => allowedTechniques.has(t)));
      const isSame = next.size === prev.size && Array.from(next).every(t => prev.has(t));
      return isSame ? prev : next;
    });

    const allowedTunings = new Set((instrumentTuningsMap[instrumentFilter] || []).map(t => t.value));
    setTuningFilter(prev => (prev && !allowedTunings.has(prev) ? '' : prev));
  }, [instrumentFilter]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsMyInstrumentFilter', myInstrumentFilter);
    } catch { /* ignore */ }
  }, [myInstrumentFilter]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsFiltersAccordionOpen', filtersAccordionOpen ? 'true' : 'false');
    } catch { /* ignore */ }
  }, [filtersAccordionOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsTuningAccordionOpen', tuningAccordionOpen ? 'true' : 'false');
    } catch { /* ignore */ }
  }, [tuningAccordionOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsDifficultyAccordionOpen', difficultyAccordionOpen ? 'true' : 'false');
    } catch { /* ignore */ }
  }, [difficultyAccordionOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsCapoAccordionOpen', capoAccordionOpen ? 'true' : 'false');
    } catch { /* ignore */ }
  }, [capoAccordionOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsKeyAccordionOpen', keyAccordionOpen ? 'true' : 'false');
    } catch { /* ignore */ }
  }, [keyAccordionOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsBpmAccordionOpen', bpmAccordionOpen ? 'true' : 'false');
    } catch { /* ignore */ }
  }, [bpmAccordionOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsPitchAccordionOpen', pitchAccordionOpen ? 'true' : 'false');
    } catch { /* ignore */ }
  }, [pitchAccordionOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsTimeSignatureAccordionOpen', timeSignatureAccordionOpen ? 'true' : 'false');
    } catch { /* ignore */ }
  }, [timeSignatureAccordionOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsModeAccordionOpen', modeAccordionOpen ? 'true' : 'false');
    } catch { /* ignore */ }
  }, [modeAccordionOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsTechniqueFilters', JSON.stringify(Array.from(techniqueFilters)));
    } catch { /* ignore */ }
  }, [techniqueFilters]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsTechniqueMatchMode', techniqueMatchMode);
    } catch { /* ignore */ }
  }, [techniqueMatchMode]);

    useEffect(() => {
      try {
        window.localStorage.setItem('songsGenreFilters', JSON.stringify(Array.from(genreFilters)));
      } catch { /* ignore */ }
    }, [genreFilters]);

    useEffect(() => {
      try {
        window.localStorage.setItem('songsGenreMatchMode', genreMatchMode);
      } catch { /* ignore */ }
    }, [genreMatchMode]);

    useEffect(() => {
      try {
        window.localStorage.setItem('songsGenreAccordionOpen', genreAccordionOpen ? 'true' : 'false');
      } catch { /* ignore */ }
    }, [genreAccordionOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsTechniqueAccordionOpen', techniqueAccordionOpen ? 'true' : 'false');
    } catch { /* ignore */ }
  }, [techniqueAccordionOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsSortColumn', sortColumn ?? '');
    } catch { /* ignore */ }
  }, [sortColumn]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsSortDirection', sortDirection);
    } catch { /* ignore */ }
  }, [sortDirection]);

  // When returning to the list page, reload songs from server
  useEffect(() => {
    if (page === 'list') {
      const reloadData = async () => {
        try {
          const data = await songService.getAllSongs();
          setSongs(data);

          // Reload playlists
          const playlists = await playlistService.getAllPlaylists();
          setPlaylists(playlists);

          // Reload song plays
          const playsMap = new Map<string, SongPlay[]>();
          await Promise.all(
            data.map(async (song) => {
              try {
                const plays = await songPlayService.getPlays(song.uid);
                playsMap.set(song.uid, plays);
              } catch (err) {
                console.error(`Failed to load plays for ${song.uid}:`, err);
                playsMap.set(song.uid, []);
              }
            })
          );
          setSongPlays(playsMap);
        } catch (err) {
          console.error('Error reloading data:', err);
        }
      };
      reloadData();
    }
  }, [page]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsSearchQuery', searchQuery);
    } catch { /* ignore */ }
  }, [searchQuery]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsTuningFilter', tuningFilter);
    } catch { /* ignore */ }
  }, [tuningFilter]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsKeyFilter', keyFilter);
    } catch { /* ignore */ }
  }, [keyFilter]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsBpmMinFilter', bpmMinFilter);
    } catch { /* ignore */ }
  }, [bpmMinFilter]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsBpmMaxFilter', bpmMaxFilter);
    } catch { /* ignore */ }
  }, [bpmMaxFilter]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsPitchStandardMinFilter', pitchStandardMinFilter);
    } catch { /* ignore */ }
  }, [pitchStandardMinFilter]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsPitchStandardMaxFilter', pitchStandardMaxFilter);
    } catch { /* ignore */ }
  }, [pitchStandardMaxFilter]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsTimeSignatureFilter', timeSignatureFilter);
    } catch { /* ignore */ }
  }, [timeSignatureFilter]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsModeFilter', modeFilter);
    } catch { /* ignore */ }
  }, [modeFilter]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsLanguageFilters', JSON.stringify(Array.from(languageFilters)));
    } catch { /* ignore */ }
  }, [languageFilters]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsLanguageMatchMode', languageMatchMode);
    } catch { /* ignore */ }
  }, [languageMatchMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsLanguageAccordionOpen', languageAccordionOpen ? 'true' : 'false');
    } catch { /* ignore */ }
  }, [languageAccordionOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsPlaylistFilter', playlistFilter);
    } catch { /* ignore */ }
  }, [playlistFilter]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsPlaylistAccordionOpen', playlistAccordionOpen ? 'true' : 'false');
    } catch { /* ignore */ }
  }, [playlistAccordionOpen]);

  // Story 18.2: build the form from a loaded Song (list click / deep-link fetch).
  const buildFormFromSong = (song: Song, fromDuplicate: boolean): void => {
    const builtForm: CreateSongDTO = {
      ...song,
      capo: normalizeCapoValue(song.capo),
      instrument: Array.isArray(song.instrument) ? song.instrument : (song.instrument ? [song.instrument] : []),
      technique: Array.isArray(song.technique) ? song.technique : [],
      language: Array.isArray(song.language) ? song.language : (song.language ? [song.language] : []),
      genre: Array.isArray(song.genre) ? song.genre : (song.genre ? [song.genre] : []),
    };
    setForm(builtForm);
    setEditBaselineJson(JSON.stringify(builtForm));
    setSaveStatus('idle');
    setLastSavedAt(null);
    conflictKeyRef.current = null;
    setMetadataSource(null);
    setCameFromDuplicate(fromDuplicate);
    setError(null);
    setNotFound(false);
    setFormReady(true); // the form now represents a real, loaded editing target
  };

  // Story 18.2 — the open target is driven by the URL. Build the form when it changes,
  // UNLESS the form already represents it (loadedFormUidRef) — so an auto-create
  // navigate('/songs/:uid') doesn't reload & clobber the just-typed form.
  useEffect(() => {
    if (page === 'list') { loadedFormUidRef.current = undefined; setNotFound(false); setFormReady(false); deletingRef.current = false; return; }
    if (isNewSongRoute) {
      if (loadedFormUidRef.current !== '__new__') {
        setForm(initialSong);
        setEditBaselineJson(null);
        setSaveStatus('idle');
        setLastSavedAt(null);
        setMetadataSource(null);
        setCameFromDuplicate(false);
        setNotFound(false);
        setFormReady(false); // add draft, no editing session yet (editingUid === null)
        conflictKeyRef.current = null;
        loadedFormUidRef.current = '__new__';
      }
      return;
    }
    // /songs/:uid — edit. Skip if the form already matches (just created / already open).
    if (loadedFormUidRef.current === editingUid) return;
    const record = songs.find(s => s.uid === editingUid);
    const fromDuplicate = !!(location.state as { fromDuplicate?: boolean } | null)?.fromDuplicate;
    if (record) {
      buildFormFromSong(record, fromDuplicate);
      loadedFormUidRef.current = editingUid;
      return;
    }
    // Not in the loaded list → deep-link. Mark as loaded up-front so a later `songs`
    // change doesn't re-fetch (and clobber a 404). The form isn't ready until this
    // resolves, so the empty-title guards stay disarmed meanwhile (no spurious delete).
    // If the effect is torn down BEFORE resolving (StrictMode double-invoke, uid change),
    // roll the marker back so the re-run actually refetches instead of skipping forever.
    loadedFormUidRef.current = editingUid;
    setFormReady(false);
    setNotFound(false);
    let cancelled = false;
    let settled = false;
    songService.getSong(editingUid as string)
      .then(song => { if (!cancelled) { settled = true; buildFormFromSong(song, false); } })
      .catch(() => { if (!cancelled) { settled = true; setNotFound(true); } });
    return () => { cancelled = true; if (!settled) loadedFormUidRef.current = undefined; };
    // buildFormFromSong is stable enough; deps cover the URL target + the songs list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, isNewSongRoute, editingUid, songs, location.state]);

  // Load plays and playlists for song being edited
  useEffect(() => {
    if (!editingUid) {
      setEditingSongPlays([]);
      setSelectedPlaylistUids(new Set());
      seededPlaylistsForEditRef.current = null;
      return;
    }

    const loadEditingData = async () => {
      try {
        // Load plays for the song being edited
        const plays = await songPlayService.getPlays(editingUid);
        setEditingSongPlays(plays);
      } catch (err) {
        console.error('Error loading editing data:', err);
      }
    };

    loadEditingData();

    // Seed the playlist selection from persisted membership ONCE per edit session.
    // Re-seeding on every `playlists` change would clobber unsaved toggles and the
    // just-created / 409-selected playlist (story 10.2 set `playlists` mid-edit).
    // Lock only once playlists are actually loaded, so the initial-load race still
    // seeds correctly.
    if (seededPlaylistsForEditRef.current !== editingUid) {
      const songPlaylists = playlists.filter(pl => pl.songUids?.includes(editingUid));
      setSelectedPlaylistUids(new Set(songPlaylists.map(pl => pl.uid)));
      if (playlists.length > 0) {
        seededPlaylistsForEditRef.current = editingUid;
      }
    }
  }, [editingUid, playlists]);




  const handleTogglePlaylist = async (playlistUid: string) => {
    const wasIn = selectedPlaylistUids.has(playlistUid);
    const next = new Set(selectedPlaylistUids);
    if (wasIn) next.delete(playlistUid); else next.add(playlistUid);
    setSelectedPlaylistUids(next);
    // Story 13.1: no more Save button — in edit mode, membership is persisted
    // immediately on toggle (like inline playlist creation). In add mode there's
    // no song uid yet, so it's committed on Add (handleSubmit create branch).
    if (editingUid !== null) {
      try {
        if (wasIn) await playlistService.removeSongFromPlaylist(playlistUid, editingUid);
        else await playlistService.addSongToPlaylist(playlistUid, editingUid);
      } catch (err) {
        console.error(err);
        // Roll back the optimistic toggle so the UI matches the server.
        setSelectedPlaylistUids(prev => {
          const reverted = new Set(prev);
          if (wasIn) reverted.add(playlistUid); else reverted.delete(playlistUid);
          return reverted;
        });
        setToastMessage('Could not update playlist');
        setTimeout(() => setToastMessage(null), 2500);
      }
    }
  };

  // Select a playlist (existing or just-created) into the edited song and reset
  // the picker's search — shared by the create flow and its 409 fallback.
  const selectPlaylistIntoSong = (playlist: Playlist) => {
    setPlaylists(prev => (prev.some(p => p.uid === playlist.uid) ? prev : [playlist, ...prev]));
    setSelectedPlaylistUids(prev => {
      const next = new Set(prev);
      next.add(playlist.uid);
      return next;
    });
    setPlaylistSearchQuery('');
    setPlaylistSearchOpen(false);
    setSelectedPlaylistIndex(-1);
  };

  // Story 10.2: create a new playlist on the fly (with the edited song already in
  // it) without leaving the form. The on-Save diff then sees it already has the
  // song → no double-add. A 409 (stale catalog raced server-side) selects the
  // existing playlist instead of erroring.
  // In-flight guard (10-2 deferred): a fast double Enter/click would otherwise fire
  // two concurrent createPlaylist calls — the 2nd 409s and re-selects the 1st
  // (harmless given server-side uniqueness from 10.1, but a possible flicker).
  // Mirrors savingRef. Released in finally so a failure never wedges the picker.
  const creatingPlaylistRef = useRef(false);

  const handleCreatePlaylist = async (rawText: string) => {
    const name = rawText.trim();
    if (!name) return;
    if (creatingPlaylistRef.current) return; // a create is already in flight
    creatingPlaylistRef.current = true;
    try {
      const created = await playlistService.createPlaylist({
        name,
        songUids: editingUid ? [editingUid] : [],
      });
      selectPlaylistIntoSong(created);
    } catch (err) {
      if (err instanceof PlaylistConflictError && err.existingPlaylist) {
        selectPlaylistIntoSong(err.existingPlaylist);
        return;
      }
      setToastMessage('Could not create playlist');
      setTimeout(() => setToastMessage(null), 2500);
    } finally {
      creatingPlaylistRef.current = false;
    }
  };

  // Story 13.1 + 17.2 + 19.7 — Auto-persist the current form WITHOUT leaving the screen,
  // via the shared useAutosave engine. ADD mode (editingUid === null) auto-CREATEs at the
  // debounce; EDIT mode auto-UPDATEs. The hook owns the in-flight guard + shared debounce
  // timer (a create and an update can never overlap, a pending save is always cancellable)
  // + the baseline no-op + the unmount flush; the callbacks below are the Song-specific
  // bits (payload shaping, the invisible add→edit transition, list reconciliation, the
  // duplicate rule, the server-409 handling).
  //   • Empty (trimmed) title  -> never persisted (a titleless form is not a song).
  //   • Duplicate (title+artist, client guard OR server 409) -> BLOCKED entirely,
  //     no create and no partial update (17.2 hardens 13.1). status 'conflict' + the
  //     SongForm banner tell the user nothing was written.
  //   • `lastPlayed` is server-managed -> never sent (HIGH from 13.1).
  // Story 17.2: the folded (title|artist) key that last hit a server 409. Suppresses
  // re-firing a create on every keystroke when the 409 body carried no existing song
  // (so the client-side liveDuplicate guard couldn't pick it up). Cleared implicitly
  // by comparing against the current key — a differentiated title/artist no longer matches.
  const conflictKeyRef = useRef<string | null>(null);
  const foldedTitleArtistKey = (): string =>
    `${(form.title || '').trim().toLowerCase()}|${(form.artist || '').trim().toLowerCase()}`;

  // `lastPlayed` is server-managed → never sent; empty collections normalized (HIGH 13.1).
  const buildAutosavePayload = (f: CreateSongDTO): UpdateSongDTO => {
    const payload: UpdateSongDTO = {
      ...f,
      instrument: f.instrument && f.instrument.length > 0 ? f.instrument : null,
      technique: f.technique && f.technique.length > 0 ? f.technique : [],
      genre: f.genre && f.genre.length > 0 ? f.genre : [],
      myInstrumentUid: f.myInstrumentUid ? f.myInstrumentUid : undefined,
      instrumentDifficulty: f.instrumentDifficulty || {},
      instrumentTuning: f.instrumentTuning || {},
    };
    delete payload.lastPlayed;
    return payload;
  };

  const { flush: flushAutoSave, savingRef } = useAutosave<CreateSongDTO>({
    form,
    editingUid,
    baseline: editBaselineJson,
    deps: [form, editingUid, editBaselineJson],
    minVisibleMs: 500, // keep "Saving…" perceptible even on an instant (local) save
    unmount: 'flush', // add mode CAN create on unmount (quitter = garder — the created song is kept)
    scheduleWhen: () =>
      editingUid === null
        ? !!form.title?.trim() // add: nothing to create until a (trimmed) title
        : editBaselineJson === null || JSON.stringify(form) !== editBaselineJson, // edit: only when diverged
    flushWhen: () =>
      editingUid === null
        ? !!(form.title?.trim() && JSON.stringify(form) !== JSON.stringify(initialSong))
        : editBaselineJson !== null && JSON.stringify(form) !== editBaselineJson,
    blockedStatus: () => {
      // Emptied title → clear the stale "Saved ✓" (nothing is persisted for a titleless form).
      if (!form.title?.trim()) return 'idle';
      // Symmetric duplicate block (17.2): a client-side live dup OR a remembered server 409.
      if (liveDuplicate || conflictKeyRef.current === foldedTitleArtistKey()) return 'conflict';
      return null;
    },
    setSaveStatus,
    onCreate: async (f, snapshot) => {
      // Auto-create, then the INVISIBLE add→edit transition: inject the song, flip to edit
      // mode, seed the baseline. The panel stays, no reload — later keystrokes UPDATE.
      const created = await songService.createSong(buildAutosavePayload(f) as CreateSongDTO);
      setSongs(prev => (prev.some(s => s.uid === created.uid) ? prev : [created, ...prev]));
      if (!isMountedRef.current || pathnameRef.current !== '/songs/new') {
        // The user left /songs/new while this create was in flight (quitter = garder):
        // keep the created song in the list, but DON'T yank them back to it. Checked
        // against the LIVE location/mount (refs), not the frozen closure value — else
        // leaving via a header link / browser Back would drag them into the new song.
        return { finalize: false };
      }
      // Seed the baseline + mark the form as representing the new uid BEFORE navigating,
      // so the build-form effect skips reloading (no clobber of live typing), then replace
      // /songs/new → /songs/:uid.
      setEditBaselineJson(snapshot);
      loadedFormUidRef.current = created.uid;
      setFormReady(true); // now a real editing session (empty-title guards may arm)
      setPlaylistFilter(''); // parity with the old create flow: keep the new song visible
      navigate('/songs/' + created.uid, { replace: true });
      return { finalize: true };
    },
    onUpdate: async (uid, f, snapshot) => {
      const updatedSong = await songService.updateSong(uid, buildAutosavePayload(f));
      setSongs(prev => prev.map(song => (song.uid === uid ? updatedSong : song)));
      setEditBaselineJson(snapshot);
    },
    onStatusSaved: () => {
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    },
    onError: (err) => {
      // Server-authoritative duplicate (stale client list raced the unique index):
      // block, reconcile the local list so the client guard now sees it too, and
      // surface the conflict — retrying wouldn't help until the user differentiates.
      if (err instanceof SongConflictError) {
        const existing = err.existingSong;
        if (existing) {
          setSongs(prev => (prev.some(s => s.uid === existing.uid) ? prev : [existing, ...prev]));
        }
        // Remember this collision so we don't re-fire a create/update on every
        // keystroke — even when the 409 body carried no song to reconcile locally.
        conflictKeyRef.current = foldedTitleArtistKey();
        return 'conflict';
      }
      console.error(err);
      return 'error'; // ⚠️ Not saved — retried on the next edit
    },
  });

  // Story 17.2 — Seuil 1: a song is "fresh" if the only thing that ever happened to
  // it is the (now-emptied) title — no other field filled, no practice, no playlist.
  // Such a draft is deleted silently on leave; anything with value gets the popup.
  // Empty for the purpose of "did the user fill this?": null / undefined / '' /
  // empty array / empty object all count as no content. Lets a form rebuilt from a
  // server record (null vs '', {} vs missing) still read as untouched.
  const isEmptyValue = (v: unknown): boolean =>
    v === null || v === undefined || v === '' ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0);

  const isFreshSong = (): boolean => {
    if (editingUid === null) return false;
    // Seuil 1 (17.2): "fresh" = the only thing that ever happened is the (now-emptied)
    // title — no other CONTENT field filled, no practice, no playlist. Compare content
    // only: the form may have been rebuilt from the server record, which carries
    // uid/userUid/timestamps and null-vs-'' quirks that an exact JSON compare would trip on.
    const f = form as Record<string, unknown>;
    const contentFilled =
      !isEmptyValue(f.bpm) || !isEmptyValue(f.durationSeconds) || !isEmptyValue(f.key) ||
      !isEmptyValue(f.capo) || !isEmptyValue(f.notes) || !isEmptyValue(f.instrument) ||
      !isEmptyValue(f.instrumentDifficulty) || !isEmptyValue(f.instrumentTuning) ||
      !isEmptyValue(f.artist) || !isEmptyValue(f.album) || !isEmptyValue(f.language) ||
      !isEmptyValue(f.genre) || !isEmptyValue(f.technique) || !isEmptyValue(f.timeSignature) ||
      !isEmptyValue(f.mode) || !isEmptyValue(f.streamingLinks) || !isEmptyValue(f.instrumentLinks) ||
      !isEmptyValue(f.myInstrumentUid) ||
      // pitchStandard has a non-empty default (440); only a deviation counts as filled.
      (!isEmptyValue(f.pitchStandard) && f.pitchStandard !== 440);
    if (contentFilled) return false;
    if (editingSongPlays.length > 0) return false; // has practice history
    const record = songs.find(s => s.uid === editingUid);
    if (record?.lastPlayed) return false;
    if (playlists.some(pl => pl.songUids?.includes(editingUid))) return false; // in a playlist
    return true;
  };

  // Delete the song currently open in the form (its title was emptied). Best-effort:
  // a failed delete still lets the user leave — the song keeps its last server value.
  const deleteEditingSong = async (): Promise<void> => {
    const uid = editingUid;
    if (uid === null) return;
    try {
      await songService.deleteSong(uid);
      setSongs(prev => prev.filter(s => s.uid !== uid));
    } catch (err) {
      console.error(err);
    }
  };

  // Story 18.2 — leaving a song whose title is empty is intercepted by useBlocker
  // (data-router), which — unlike the removed 17.2 custom guard — ALSO catches the
  // browser Back button / popstate. Block only when leaving the form (route change)
  // with an editing song and an empty title.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      page === 'form' &&
      editingUid !== null &&
      formReady && // only a genuinely loaded edit session — never a loading/404 form
      !deletingRef.current && // a deliberate delete-then-navigate isn't a guarded leave
      !form.title?.trim() &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    // Fresh titleless draft → delete it silently and let the navigation proceed;
    // a song with value → ask before leaving (the ConfirmDialog resolves the blocker).
    if (isFreshSong()) {
      void deleteEditingSong().then(() => blocker.proceed());
    } else {
      setEmptyTitleDialogOpen(true);
    }
    // isFreshSong/deleteEditingSong read live state; re-run only on blocker transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker]);

  // Story 17.2 — the one exit useBlocker can't intercept (browser refresh / tab close)
  // gets the native beforeunload prompt while a titleless draft is open.
  useEffect(() => {
    if (editingUid === null || !formReady || form.title?.trim()) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [editingUid, formReady, form.title]);

  // Story 18.2: leave the form via the URL. Flush a pending (non-empty) edit first;
  // the empty-title case is handled by useBlocker (fires on this navigation).
  const backToList = async (): Promise<void> => {
    const ok = await flushAutoSave();
    // A genuine save FAILURE toasts. A `false` from an in-flight create/save (savingRef
    // held) isn't a failure — that op is still resolving on its own.
    if (!ok && !savingRef.current) {
      setToastMessage('Some changes could not be saved');
      setTimeout(() => setToastMessage(null), 2500);
    }
    navigate('/songs');
  };

  // The actual mark — reads the song server-side, so the form must be saved
  // first for fresh fields (e.g. duration) to count.
  const performMarkAsPlayed = async (instrumentType: string) => {
    if (!editingUid) return;
    try {
      setLoading(true);
      setError(null);
      // The play's day is the device's local date (FR19/FR21), never the server clock
      await songPlayService.markPlayed(editingUid, { instrumentType, playedOn: formatLocalDate(new Date()) });
      const plays = await songPlayService.getPlays(editingUid);
      setEditingSongPlays(plays);
      // Keep the list-wide plays map in sync too, otherwise the "last played"
      // sort reads stale data after a mark from the edit panel
      setSongPlays(prev => new Map(prev).set(editingUid, plays));
      const now = new Date().toISOString();
      await songService.updateSong(editingUid, { lastPlayed: now });
      // Update the song in the list
      setSongs(songs.map(song =>
        song.uid === editingUid ? { ...song, lastPlayed: now } : song
      ));
    } catch (err) {
      setError('Error while marking as played');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Story 13.1: under auto-save the form is always persisted, so "Mark as played"
  // marks right away — the old "unsaved changes" guard/dialog is obsolete. Flush
  // any pending edit first so the server-side mark reads fresh fields (e.g. duration).
  const handleMarkAsPlayedNow = async (instrumentType: string) => {
    if (!editingUid) return;
    await flushAutoSave();
    await performMarkAsPlayed(instrumentType);
  };

  // Update suggested albums when artist changes
  useEffect(() => {
    if (!form.artist) {
      setSuggestedAlbums([]);
      return;
    }
    // Get all unique albums from songs with the same artist
    const artistAlbums = songs
      .filter(song => song.artist?.toLowerCase().trim() === form.artist?.toLowerCase().trim())
      .map(song => song.album)
      .filter((album): album is string => !!album && album.trim() !== '')
      .reduce((unique, album) => {
        if (!unique.includes(album)) {
          unique.push(album);
        }
        return unique;
      }, [] as string[])
      .sort();
    setSuggestedAlbums(artistAlbums);
  }, [form.artist, songs]);

  // Update suggested artists when songs change
  useEffect(() => {
    const artists = songs
      .map(song => song.artist)
      .filter((artist): artist is string => !!artist && artist.trim() !== '')
      .reduce((unique, artist) => {
        if (!unique.includes(artist)) {
          unique.push(artist);
        }
        return unique;
      }, [] as string[])
      .sort();
    setSuggestedArtists(artists);
  }, [songs]);

  useEffect(() => {
    const languages = songs
      .flatMap(song => Array.isArray(song.language) ? song.language : (song.language ? [song.language] : []))
      .filter((language): language is string => !!language && language.trim() !== '')
      .reduce((unique, language) => {
        if (!unique.includes(language)) {
          unique.push(language);
        }
        return unique;
      }, [] as string[])
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    setLanguageFilterOptions(languages);
  }, [songs]);

  useEffect(() => {
    const genres = songs
      .flatMap(song => Array.isArray(song.genre) ? song.genre : (song.genre ? [song.genre] : []))
      .filter((genre): genre is string => !!genre && genre.trim() !== '')
      .reduce((unique, genre) => {
        if (!unique.includes(genre)) {
          unique.push(genre);
        }
        return unique;
      }, [] as string[])
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    setAvailableGenres(genres);
  }, [songs]);

  const handleMarkSelectedAsPlayedNow = async () => {
    try {
      setLoading(true);
      setError(null);
      const playedOn = formatLocalDate(new Date());
      // The "No instrument" sentinel is a filter, never a real instrument — don't persist it.
      const instrumentTypeForPlay = instrumentFilter && instrumentFilter !== NO_INSTRUMENT ? instrumentFilter : undefined;

      // Serialize, do NOT Promise.all: concurrent marks for the same day +
      // instrument each find no session and each create one → duplicate day
      // sessions (find-or-create has no unique guard, and one cannot be added
      // since multiple sessions per day/instrument are legitimate). One at a
      // time also gives each song a distinct lastPlayed so the sort stays
      // orderable.
      const newPlays: { songUid: string; play: SongPlay; lastPlayed: string }[] = [];
      for (const uid of Array.from(selectedSongs)) {
        const play = await songPlayService.markPlayed(uid, { instrumentType: instrumentTypeForPlay, playedOn });
        const lastPlayed = new Date().toISOString();
        await songService.updateSong(uid, { lastPlayed });
        newPlays.push({ songUid: uid, play, lastPlayed });
      }

      const lastPlayedByUid = new Map(newPlays.map(({ songUid, lastPlayed }) => [songUid, lastPlayed]));
      setSongs(songs.map(song =>
        lastPlayedByUid.has(song.uid) ? { ...song, lastPlayed: lastPlayedByUid.get(song.uid) } : song
      ));
      setSongPlays(prev => {
        const next = new Map(prev);
        newPlays.forEach(({ songUid, play }) => {
          const existing = next.get(songUid) || [];
          next.set(songUid, [play, ...existing]);
        });
        return next;
      });
      songSelection.clear();
    } catch (err) {
      setError('Error while updating songs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleBulkPlaylistSelection = (playlistUid: string) => {
    setBulkPlaylistSelection(prev => {
      const next = new Set(prev);
      if (next.has(playlistUid)) next.delete(playlistUid);
      else next.add(playlistUid);
      return next;
    });
  };

  const handleApplySelectedToPlaylists = async () => {
    if (bulkPlaylistSelection.size === 0 || selectedSongs.size === 0) {
      setBulkPlaylistOpen(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const selectedSongArray = Array.from(selectedSongs);

      // Use addSongToPlaylist to reuse server logic and avoid partial updates
      await Promise.all(
        Array.from(bulkPlaylistSelection).flatMap(playlistUid =>
          selectedSongArray.map(songUid => playlistService.addSongToPlaylist(playlistUid, songUid))
        )
      );

      // Refresh playlists locally so counts reflect the change
      const refreshed = await playlistService.getAllPlaylists();
      setPlaylists(refreshed);

      setBulkPlaylistOpen(false);
      setBulkPlaylistSelection(new Set());
      setToastMessage('Added to playlist');
      setTimeout(() => setToastMessage(null), 2500);
    } catch (err) {
      setError('Error while adding to playlists');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'bpm') {
      setForm({ ...form, bpm: value === '' ? null : Number(value) });
    } else if (name === 'capo') {
      setForm({ ...form, capo: normalizeCapoValue(value) });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  // Song duration is parsed (m:ss or decimal minutes) inside SongForm and
  // committed here as whole seconds, or null when cleared/unparseable.
  const setDurationSeconds = (seconds: number | null) => {
    setForm(prevForm => ({ ...prevForm, durationSeconds: seconds }));
  };

  // Removed unused toggleFormInstrument

  const toggleFormTechnique = (technique: string) => {
    setForm(prevForm => {
      const current = Array.isArray(prevForm.technique) ? prevForm.technique : (prevForm.technique ? [prevForm.technique] : []);
      const updated = current.includes(technique)
        ? current.filter(t => t !== technique)
        : [...current, technique];
      return { ...prevForm, technique: updated };
    });
  };

  const toggleFormGenre = (genre: string) => {
    setForm(prevForm => {
      const current = Array.isArray(prevForm.genre) ? prevForm.genre : (prevForm.genre ? [prevForm.genre] : []);
      const updated = current.includes(genre)
        ? current.filter(g => g !== genre)
        : [...current, genre];
      return { ...prevForm, genre: updated };
    });
  };

  const toggleFormLanguage = (language: string) => {
    setForm(prevForm => {
      const current = Array.isArray(prevForm.language) ? prevForm.language : (prevForm.language ? [prevForm.language] : []);
      const updated = current.includes(language)
        ? current.filter(l => l !== language)
        : [...current, language];
      return { ...prevForm, language: updated };
    });
  };

  const setFormInstruments = (instruments: string[]) => {
    setForm(prevForm => {
      const nextDifficulty = { ...(prevForm.instrumentDifficulty || {}) } as Record<string, number | null>;
      Object.keys(nextDifficulty).forEach(key => {
        if (!instruments.includes(key)) {
          delete nextDifficulty[key];
        }
      });

      return {
        ...prevForm,
        instrument: instruments,
        instrumentDifficulty: nextDifficulty,
        capo: instruments.includes('Guitar') ? (prevForm.capo ?? null) : null,
      };
    });
  };

  const setInstrumentDifficulty = (instrumentType: string, difficulty: number | null) => {
    setForm(prevForm => {
      const next = { ...(prevForm.instrumentDifficulty || {}) } as Record<string, number | null>;
      if (difficulty === null || Number.isNaN(difficulty)) {
        delete next[instrumentType];
      } else {
        next[instrumentType] = difficulty;
      }
      return { ...prevForm, instrumentDifficulty: next };
    });
  };

  const setFormMyInstrumentUid = (uid: string | undefined) => {
    setForm(prevForm => ({ ...prevForm, myInstrumentUid: uid }));
  };

  const setFormTechniques = (techniques: string[]) => {
    setForm(prevForm => ({ ...prevForm, technique: techniques }));
  };

  const setInstrumentTuning = (
    instrumentType: string,
    tuning: string | null
  ) => {
    setForm(prev => {
      const next = { ...(prev.instrumentTuning || {}) };
      if (tuning === null || tuning === '') {
        delete next[instrumentType];
      } else {
        next[instrumentType] = tuning;
      }
      return { ...prev, instrumentTuning: next };
    });
  };

  // Removed unused setFormTuning

  const setInstrumentLinksForInstrument = (instrumentType: string, links: Array<{ label?: string; url: string }>) => {
    setForm(prev => ({
      ...prev,
      instrumentLinks: {
        ...(prev.instrumentLinks || {}),
        [instrumentType]: links
      }
    }));
  };

  const setStreamingLinks = (links: Array<{ label: string; url: string }>) => {
    setForm(prev => ({
      ...prev,
      streamingLinks: links
    }));
  };

  // Removed unused handleFetchStreamingLinks

  // Opens a song in the edit form. `fromDuplicate` is set when navigating here
  // from the add form's "already exists" link, so the edit screen can remind the
  // user their filters may be hiding it from the list.
  // Story 18.2: open a song = navigate to its route; the build-form effect loads it.
  // `fromDuplicate` (from the "already exists" link) rides in the router state.
  const openSongForEdit = (song: Song, fromDuplicate = false) => {
    navigate(`/songs/${song.uid}`, fromDuplicate ? { state: { fromDuplicate: true } } : undefined);
  };

  // Live "this song already exists" detection. Single source of truth: it drives
  // both the form warning AND the submit guard, so the two can never disagree.
  // Gate on title only (findDuplicateSong's own requirement); matching still needs
  // an exact artist match, so a song that has an artist only warns once that
  // artist is typed, and artist-less duplicates are covered too.
  // Works in edit mode as well: excludeUid skips the song being edited, and a
  // pre-existing twin is ignored while the identity is unchanged — so we only
  // flag a collision once the user actually renames a song into one.
  const liveDuplicate = useMemo(() => {
    if (!form.title?.trim()) return null;
    const match = findDuplicateSong(songs, { title: form.title, artist: form.artist }, editingUid);
    if (!match) return null;
    if (editingUid !== null) {
      const original = songs.find(song => song.uid === editingUid);
      if (original && findDuplicateSong([original], { title: form.title, artist: form.artist })) return null;
    }
    return match;
  }, [editingUid, songs, form.title, form.artist]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Story 17.2: there is no more Add/Save button — pressing Enter just flushes the
    // pending auto-save (CREATE in add mode, UPDATE in edit mode) and STAYS on the
    // song (no redirect). The debounce would have persisted it anyway.
    await flushAutoSave();
  };

  // handleEdit supprimé (non utilisé)

  const handleDelete = async (uid: string) => {
    setDeleteDialogOpen(true);
    setDeleteMode('single');
    setDeleteUid(uid);
  };

  const handleConfirmDelete = async (uidToDelete: string) => {
    try {
      setLoading(true);
      setError(null);
      await songService.deleteSong(uidToDelete);
      setSongs(songs.filter(song => song.uid !== uidToDelete));
      
      // Remove from selected songs if it was selected
      songSelection.removeMany([uidToDelete]);
      
      setDeleteDialogOpen(false);
      setDeleteUid(null);
      setDeleteMode(null);
      
      // Story 18.2: if we're editing the deleted song, go back to the list route.
      // Flag the leave as a deliberate delete so the empty-title blocker (the song's
      // title may be blank) doesn't pop a second "no title" dialog over this navigation.
      if (editingUid === uidToDelete) {
        deletingRef.current = true;
        navigate('/songs');
      }
    } catch (err) {
      setError('Error while deleting');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSelected = async () => {
    setDeleteDialogOpen(true);
    setDeleteMode('multiple');
  };

  const generateStreamingLinks = (title: string, artist: string) => {
    const searchQuery = `${artist || ''} ${title || ''}`.trim();
    if (!searchQuery) return [];
    
    const links = [
      { label: 'YouTube', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}` },
      { label: 'Spotify', url: `https://open.spotify.com/search/${encodeURIComponent(searchQuery)}` },
      { label: 'Apple Music', url: `https://music.apple.com/us/search?term=${encodeURIComponent(searchQuery)}` },
      { label: 'Deezer', url: `https://www.deezer.com/search/${encodeURIComponent(searchQuery)}` },
      { label: 'Tidal', url: `https://tidal.com/search?q=${encodeURIComponent(searchQuery)}&types=TRACKS` },
      { label: 'Qobuz', url: `https://www.qobuz.com/us-en/search?q=${encodeURIComponent(searchQuery)}` }
    ];
    return links;
  };

  const handleConfirmDeleteSelected = async () => {
    try {
      setLoading(true);
      setError(null);
      
      await Promise.all(Array.from(selectedSongs).map(uid => songService.deleteSong(uid)));
      
      setSongs(songs.filter(song => !selectedSongs.has(song.uid)));
      songSelection.clear();
      setDeleteDialogOpen(false);
      setDeleteMode(null);
    } catch (err) {
      setError('Error while deleting songs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLookupMetadata = async () => {
    if (!form.title?.trim() || !form.artist?.trim()) {
      setToastMessage('Add a title and artist to auto-fill.');
      setTimeout(() => setToastMessage(null), 2500);
      return;
    }

    console.log('>>> Frontend: Calling lookupMetadata with:', {
      title: form.title.trim(),
      artist: form.artist.trim()
    });

    setMetadataLoading(true);
    try {
      const meta = await songService.lookupMetadata(form.title.trim(), form.artist.trim());
      console.log('>>> Frontend: Metadata response:', meta);
      setMetadataSource(meta?.source || null);

      // Generate streaming links regardless of metadata found
      const newStreamingLinks = generateStreamingLinks(form.title.trim(), form.artist.trim());
      const currentStreamingLinks = form.streamingLinks || [];
      const existingUrls = new Set(currentStreamingLinks.map(l => l.url));
      const linksToAdd = newStreamingLinks.filter(link => !existingUrls.has(link.url));
      const mergedStreamingLinks = [...currentStreamingLinks, ...linksToAdd];

      // Check if meta has any useful data
      const hasUsefulData = meta && (
        meta.bpm || meta.key || meta.mode || meta.timeSignature || meta.album || meta.durationSeconds ||
        (Array.isArray(meta.genres) && meta.genres.length > 0)
      );

      if (!meta || (!hasUsefulData && meta.source === 'none')) {
        console.log('>>> Frontend: No metadata found, but adding streaming links');
        setToastMessage('No metadata found online.');
        setTimeout(() => setToastMessage(null), 2500);
        
        // Still add streaming links even if no metadata
        setForm(prev => ({
          ...prev,
          streamingLinks: mergedStreamingLinks,
        }));
        return;
      }

      console.log('>>> Frontend: Album from API:', meta.album);
      console.log('>>> Frontend: Genres from API:', meta.genres);

      const mergedGenres = (Array.isArray(form.genre) && form.genre.length > 0)
        ? form.genre
        : (Array.isArray(meta.genres) && meta.genres.length > 0 ? meta.genres : form.genre);

      console.log('>>> Frontend: Merged genres:', mergedGenres);

      // Fill form with all available data from meta
      setForm(prev => ({
        ...prev,
        bpm: prev.bpm ?? meta.bpm ?? prev.bpm,
        key: prev.key || meta.key || '',
        mode: prev.mode || meta.mode || '',
        timeSignature: prev.timeSignature || meta.timeSignature || '',
        album: prev.album || meta.album || '',
        durationSeconds: prev.durationSeconds ?? meta.durationSeconds,
        genre: mergedGenres,
        streamingLinks: mergedStreamingLinks,
      }));
    } catch (err) {
      console.error('>>> Frontend: Error during lookup:', err);
      setToastMessage('Auto-fill unavailable at the moment.');
      setTimeout(() => setToastMessage(null), 2500);
    } finally {
      setMetadataLoading(false);
    }
  };

  const toggleSelectSong = songSelection.toggle;

  // Select-all is "replace": exactly the displayed (filtered) songs — matches the prior
  // `new Set(displayed)`, so a selection filtered out of view is dropped.
  const toggleSelectAll = () => {
    if (displayedSongs.every(song => selectedSongs.has(song.uid))) songSelection.clear();
    else songSelection.selectOnly(displayedSongs.map(song => song.uid));
  };

  const sortedSongs = songs;

  const filteredSongs = applySongFilters(sortedSongs, {
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
  });

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const formatLastPlayed = (dateString: string | undefined) => {
    if (!dateString) return '-';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getLastPlayedForSong = (songUid: string): string | undefined => {
    const plays = songPlays.get(songUid) || [];
    if (plays.length === 0) return undefined;

    // When filtering by a real instrument type, find the last play for that type.
    // The "No instrument" sentinel is not a type, so fall through to all-instruments.
    if (instrumentFilter && instrumentFilter !== NO_INSTRUMENT) {
      const instrumentPlays = plays.filter(p => p.instrumentType === instrumentFilter);
      return instrumentPlays.length > 0 ? instrumentPlays[0].playedAt : undefined;
    }

    // Sinon, retourner le dernier play toutes instruments confondus
    return plays[0].playedAt;
  };

  const sortByColumnFunc = (items: Song[]) => {
    if (!sortColumn) return items;

    return [...items].sort((a, b) => {
      // Special handling for lastPlayed to use instrument-filtered times from songPlays
      if (sortColumn === 'lastPlayed') {
        const aLastPlayed = getLastPlayedForSong(a.uid);
        const bLastPlayed = getLastPlayedForSong(b.uid);
        const aTime = aLastPlayed ? new Date(aLastPlayed).getTime() : 0;
        const bTime = bLastPlayed ? new Date(bLastPlayed).getTime() : 0;
        if (aTime !== bTime) return sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
        // Tiebreak on the denormalized global lastPlayed: it carries distinct
        // real instants even when older per-instrument plays collide on the
        // same timestamp, so the sort never looks frozen
        const aGlobal = a.lastPlayed ? new Date(a.lastPlayed).getTime() : 0;
        const bGlobal = b.lastPlayed ? new Date(b.lastPlayed).getTime() : 0;
        return sortDirection === 'asc' ? aGlobal - bGlobal : bGlobal - aGlobal;
      }

      let aVal = (a as Record<string, unknown>)[sortColumn];
      let bVal = (b as Record<string, unknown>)[sortColumn];

      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? (aVal as string).localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal as string);
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc'
          ? (aVal as number) - (bVal as number)
          : (bVal as number) - (aVal as number);
      }

      return 0;
    });
  };

  const displayedSongs = sortByColumnFunc(filteredSongs);

  const allDisplayedSelected = songSelection.allDisplayedSelected(displayedSongs.map(song => song.uid));

  const SortHeader = ({ column, label, align = 'left' }: { column: string; label: string; align?: 'left' | 'right' }) => (
    <th
      className={`p-2 border-b dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 whitespace-nowrap ${align === 'right' ? 'text-right pr-4' : 'text-left'}`}
      onClick={() => handleSort(column)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        {sortColumn === column && (
          <span className="text-sm">{sortDirection === 'asc' ? '▲' : '▼'}</span>
        )}
      </div>
    </th>
  );

  const availableTechniqueFilters = instrumentFilter ? instrumentTechniquesMap[instrumentFilter] || [] : [];
  const availableTuningFilters = instrumentFilter ? instrumentTuningsMap[instrumentFilter] || [] : [];
  const tuningFilterOptions = availableTuningFilters.filter(opt => opt.value);
  const showTuningFilters = !!(instrumentFilter && instrumentFilter !== 'Drums' && instrumentFilter !== NO_INSTRUMENT);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-950 text-gray-900 dark:text-gray-100">
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        title="Delete song(s)"
        message={deleteMode === 'single' ? 'Are you sure you want to delete this song?' : `Are you sure you want to delete ${selectedSongs.size} song(s)?`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onConfirm={() => {
          if (deleteMode === 'single' && deleteUid) {
            handleConfirmDelete(deleteUid);
          } else if (deleteMode === 'multiple') {
            handleConfirmDeleteSelected();
          }
        }}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setDeleteMode(null);
          setDeleteUid(null);
        }}
      />

      {/* Story 17.2: leaving a valued song whose title was emptied. Delete removes
          it; Continue editing keeps you on the form (re-checked on the next exit). */}
      <ConfirmDialog
        isOpen={emptyTitleDialogOpen}
        title="This song has no title"
        message="Your song has no title anymore. Delete it, or continue editing to give it one?"
        confirmText="Delete"
        cancelText="Continue editing"
        isDangerous
        onConfirm={async () => {
          setEmptyTitleDialogOpen(false);
          await deleteEditingSong();
          if (blocker.state === 'blocked') blocker.proceed(); // let the navigation through
        }}
        onCancel={() => {
          setEmptyTitleDialogOpen(false);
          if (blocker.state === 'blocked') blocker.reset(); // stay on the form; re-checked next exit
        }}
      />

      {error && (
        <div className="mx-4 my-4 rounded-md border border-red-300 bg-red-50 text-red-700 p-3 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded shadow-lg z-50 animate-fade-in">
          {toastMessage}
        </div>
      )}

      {page === 'form' && notFound ? (
        // Story 18.2: deep-link to an unknown/foreign song uid → scoped 404 (story 7.5).
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h1 className="mb-3 text-2xl font-semibold text-gray-900 dark:text-gray-100">Song not found</h1>
          <p className="mb-6 text-gray-600 dark:text-gray-300">This song doesn't exist, or it isn't in your songlist.</p>
          <button type="button" className="btn-secondary" onClick={() => navigate('/songs')}>
            <span aria-hidden="true">←</span> Back to songlist
          </button>
        </div>
      ) : page === 'list' && songs.length === 0 && !loading && !error ? (
        // Story 19.4 (DL-13): a genuinely empty songlist points to the Catalog. Only
        // when loaded with no error (degrades to the normal list/error UI otherwise).
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h1 className="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-100">Your songlist is empty</h1>
          <p className="mb-6 text-gray-600 dark:text-gray-300">Browse the Catalog to fill it in seconds.</p>
          <button type="button" className="btn-primary" onClick={() => navigate('/catalog')}>Browse the Catalog</button>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            or{' '}
            <button type="button" className="text-brand-600 dark:text-brand-400 hover:underline" onClick={() => navigate('/songs/new')}>add a song manually</button>
          </p>
          {/* Story 20.4: preview a few Collections (self-contained, degrades to nothing). */}
          <EmptySonglistCollections />
        </div>
      ) : page === 'list' ? (
        <SongsList
          songs={songs}
          filteredSongs={filteredSongs}
          displayedSongs={displayedSongs}
          loading={loading}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          instrumentFilter={instrumentFilter}
          setInstrumentFilter={setInstrumentFilter}
          myInstrumentFilter={myInstrumentFilter}
          setMyInstrumentFilter={setMyInstrumentFilter}
          instrumentDifficultyFilter={instrumentDifficultyFilter}
          setInstrumentDifficultyFilter={setInstrumentDifficultyFilter}
          capoFilter={capoFilter}
          setCapoFilter={setCapoFilter}
          tuningFilter={tuningFilter}
          setTuningFilter={setTuningFilter}
          technicianFilters={techniqueFilters}
          toggleTechniqueFilter={toggleTechniqueFilter}
          techniqueMatchMode={techniqueMatchMode}
          setTechniqueMatchMode={setTechniqueMatchMode}
          genreFilters={genreFilters}
          toggleGenreFilter={toggleGenreFilter}
          genreMatchMode={genreMatchMode}
          setGenreMatchMode={setGenreMatchMode}
          keyFilter={keyFilter}
          setKeyFilter={setKeyFilter}
          bpmMinFilter={bpmMinFilter}
          setBpmMinFilter={setBpmMinFilter}
          bpmMaxFilter={bpmMaxFilter}
          setBpmMaxFilter={setBpmMaxFilter}
          pitchStandardMinFilter={pitchStandardMinFilter}
          setPitchStandardMinFilter={setPitchStandardMinFilter}
          pitchStandardMaxFilter={pitchStandardMaxFilter}
          setPitchStandardMaxFilter={setPitchStandardMaxFilter}
          playlistFilter={playlistFilter}
          setPlaylistFilter={setPlaylistFilter}
          selectedSongs={selectedSongs}
          sidebarExpanded={sidebarExpanded}
          setSidebarExpanded={setSidebarExpanded}
          filtersAccordionOpen={filtersAccordionOpen}
          setFiltersAccordionOpen={setFiltersAccordionOpen}
          playlistAccordionOpen={playlistAccordionOpen}
          setPlaylistAccordionOpen={setPlaylistAccordionOpen}
          tuningAccordionOpen={tuningAccordionOpen}
          setTuningAccordionOpen={setTuningAccordionOpen}
          difficultyAccordionOpen={difficultyAccordionOpen}
          setDifficultyAccordionOpen={setDifficultyAccordionOpen}
          capoAccordionOpen={capoAccordionOpen}
          setCapoAccordionOpen={setCapoAccordionOpen}
          techniqueAccordionOpen={techniqueAccordionOpen}
          setTechniqueAccordionOpen={setTechniqueAccordionOpen}
          genreAccordionOpen={genreAccordionOpen}
          setGenreAccordionOpen={setGenreAccordionOpen}
          keyAccordionOpen={keyAccordionOpen}
          setKeyAccordionOpen={setKeyAccordionOpen}
          bpmAccordionOpen={bpmAccordionOpen}
          setBpmAccordionOpen={setBpmAccordionOpen}
          pitchAccordionOpen={pitchAccordionOpen}
          setPitchAccordionOpen={setPitchAccordionOpen}
          timeSignatureAccordionOpen={timeSignatureAccordionOpen}
          setTimeSignatureAccordionOpen={setTimeSignatureAccordionOpen}
          modeAccordionOpen={modeAccordionOpen}
          setModeAccordionOpen={setModeAccordionOpen}
          timeSignatureFilter={timeSignatureFilter}
          setTimeSignatureFilter={setTimeSignatureFilter}
          modeFilter={modeFilter}
          setModeFilter={setModeFilter}
          languageFilters={languageFilters}
          toggleLanguageFilter={toggleLanguageFilter}
          languageMatchMode={languageMatchMode}
          setLanguageMatchMode={setLanguageMatchMode}
          languageAccordionOpen={languageAccordionOpen}
          setLanguageAccordionOpen={setLanguageAccordionOpen}
          languageFilterOptions={languageFilterOptions}
          bulkPlaylistOpen={bulkPlaylistOpen}
          setBulkPlaylistOpen={setBulkPlaylistOpen}
          playlists={playlists}
          myInstruments={myInstruments}
          instrumentTypeOptions={instrumentTypeOptions}
          tuningFilterOptions={tuningFilterOptions}
          genreOptions={availableGenres}
          availableTechniqueFilters={availableTechniqueFilters}
          allDisplayedSelected={allDisplayedSelected}
          hasActiveFilters={hasActiveFilters}
          activeFilterCount={activeFilterCount}
          mobileFiltersOpen={mobileFiltersOpen}
          setMobileFiltersOpen={setMobileFiltersOpen}
          showTuningFilters={showTuningFilters}
          bulkPlaylistSelection={bulkPlaylistSelection}
          toggleSelectSong={toggleSelectSong}
          toggleSelectAll={toggleSelectAll}
          toggleBulkPlaylistSelection={toggleBulkPlaylistSelection}
          handleApplySelectedToPlaylists={handleApplySelectedToPlaylists}
          handleMarkSelectedAsPlayedNow={handleMarkSelectedAsPlayedNow}
          handleDeleteSelected={handleDeleteSelected}
          clearAllFilters={clearAllFilters}
          onEdit={(song) => openSongForEdit(song)}
          // Story 18.2: "Add a song" navigates to /songs/new; the build-form effect
          // arms a clean blank add-mode session.
          onAddNew={() => navigate('/songs/new')}
          getLastPlayedForSong={getLastPlayedForSong}
          formatLastPlayed={formatLastPlayed}
          SortHeader={SortHeader}
        />
      ) : (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Story 13.1: the sticky bar lives OUTSIDE the glass card — .glass-effect
              uses backdrop-filter, which makes the card a containing block and
              would break `position: sticky` for a child (it would stick to the
              card, which scrolls away, instead of the viewport). */}
          <StickyActionBar>
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => { void backToList(); }}
            >
              <span aria-hidden="true">←</span> Back to songlist
            </button>
            {(editingUid || saveStatus !== 'idle') && (
              <span className="text-xs font-medium" role="status" aria-live="polite">
                {saveStatus === 'saving' && (
                  <span className="inline-flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-pulse" aria-hidden="true" />
                    Saving…
                  </span>
                )}
                {saveStatus === 'saved' && (
                  // key on the time so the fade-in replays on every save (a visible "blip").
                  <span key={lastSavedAt ?? 'saved'} className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 animate-fade-in">
                    Saved ✓{lastSavedAt ? ` · ${lastSavedAt}` : ''}
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className="text-red-600 dark:text-red-400">⚠️ Not saved — retrying</span>
                )}
                {saveStatus === 'conflict' && (
                  <span className="text-amber-600 dark:text-amber-400">⚠️ Not saved — already exists</span>
                )}
              </span>
            )}
          </StickyActionBar>
          <div className="card-base glass-effect p-6">
            <h1 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {editingUid ? 'Edit song' : 'Add song'}
            </h1>
          {editingUid && cameFromDuplicate && (
            <div className="mb-4 rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 p-3 text-sm text-blue-800 dark:text-blue-100">
              If you couldn't find this song in your songlist, remember to reset your filters.
            </div>
          )}
          <SongForm
            mode={editingUid ? 'edit' : 'add'}
            form={form}
            loading={loading}
            onChange={handleChange}
            onSetDurationSeconds={setDurationSeconds}
            onChangeInstruments={setFormInstruments}
            onSetMyInstrumentUid={setFormMyInstrumentUid}
            onSetTechniques={setFormTechniques}
            onToggleGenre={toggleFormGenre}
            onToggleLanguage={toggleFormLanguage}
            onSetInstrumentDifficulty={setInstrumentDifficulty}
            onSetInstrumentTuning={setInstrumentTuning}
            onToggleTechnique={toggleFormTechnique}
            onSetInstrumentLinksForInstrument={setInstrumentLinksForInstrument}
            onSetStreamingLinks={setStreamingLinks}
            onSubmit={handleSubmit}
            duplicate={liveDuplicate}
            onEditDuplicate={liveDuplicate ? () => openSongForEdit(liveDuplicate, editingUid === null) : undefined}
            onDelete={editingUid ? () => handleDelete(editingUid) : undefined}
            onMarkAsPlayedNow={editingUid ? handleMarkAsPlayedNow : undefined}
            songPlays={editingUid ? editingSongPlays : undefined}
            formatLastPlayed={formatLastPlayed}
            myInstruments={myInstruments.map(i => ({
              uid: i.uid,
              name: i.name,
              type: i.type,
            }))}
            suggestedAlbums={suggestedAlbums}
            suggestedArtists={suggestedArtists}
            metadataLoading={metadataLoading}
            metadataSource={metadataSource}
            onAutoFillMetadata={handleLookupMetadata}
            playlistSlot={editingUid ? (
              <div className="mt-8 space-y-3">
                <h2 className="text-sm font-semibold tracking-wide text-gray-700 dark:text-gray-100">Add to playlists</h2>
                {/* Story 10.2: the combobox always renders (even with no playlists yet)
                    so a new playlist can be created on the fly by typing a name. */}
                <div>
                    <div className="relative z-30">
                      <input
                        type="text"
                        placeholder="Search, select or create a playlist"
                        value={playlistSearchQuery}
                        onChange={(e) => { setPlaylistSearchQuery(e.target.value); setSelectedPlaylistIndex(-1); }}
                        onFocus={() => setPlaylistSearchOpen(true)}
                        onBlur={() => setTimeout(() => setPlaylistSearchOpen(false), 200)}
                        onKeyDown={(e) => handleComboKeyDown(
                          e, playlistPickerOptions, selectedPlaylistIndex, setSelectedPlaylistIndex, setPlaylistSearchOpen,
                          (option) => {
                            if ('__createPlaylist' in option) {
                              handleCreatePlaylist(rawCreatePlaylistText);
                            } else {
                              handleTogglePlaylist(option.uid);
                              setPlaylistSearchQuery('');
                              setPlaylistSearchOpen(false);
                              setSelectedPlaylistIndex(-1);
                            }
                          },
                        )}
                        className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-gray-100"
                        {...comboboxInputAria('song-playlists-list', playlistSearchOpen, selectedPlaylistIndex)}
                      />
                      {playlistSearchOpen && (
                          <div ref={playlistListRef} id="song-playlists-list" role="listbox" className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg max-h-32 overflow-y-auto">
                            {filteredPlaylists.map((playlist, index) => (
                                <button
                                  key={playlist.uid}
                                  type="button"
                                  {...comboboxOptionAria('song-playlists-list', index, selectedPlaylistIndex)}
                                  onMouseEnter={() => setSelectedPlaylistIndex(index)}
                                  onClick={() => {
                                    handleTogglePlaylist(playlist.uid);
                                    setPlaylistSearchQuery('');
                                    setPlaylistSearchOpen(false);
                                    setSelectedPlaylistIndex(-1);
                                  }}
                                  className={`w-full text-left px-3 py-2 text-gray-700 dark:text-gray-100 ${
                                    index === selectedPlaylistIndex ? 'bg-brand-100 dark:bg-brand-900/40' : ''
                                  }`}
                                >
                                  {playlist.name}
                                </button>
                              ))}
                            {showCreatePlaylist && (
                              <button
                                key="__create-playlist"
                                type="button"
                                {...comboboxOptionAria('song-playlists-list', filteredPlaylists.length, selectedPlaylistIndex)}
                                onMouseEnter={() => setSelectedPlaylistIndex(filteredPlaylists.length)}
                                onClick={() => handleCreatePlaylist(rawCreatePlaylistText)}
                                className={`w-full text-left px-3 py-2 text-brand-600 dark:text-brand-400 ${
                                  filteredPlaylists.length === selectedPlaylistIndex ? 'bg-brand-100 dark:bg-brand-900/40' : ''
                                }`}
                              >
                                Create playlist "{rawCreatePlaylistText}"
                              </button>
                            )}
                            {filteredPlaylists.length === 0 && !showCreatePlaylist && (
                              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                {playlists.length === 0 ? 'Type a name to create your first playlist' : 'No playlists found'}
                              </div>
                            )}
                          </div>
                      )}
                    </div>
                    {selectedPlaylistUids.size > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {playlists.filter(p => selectedPlaylistUids.has(p.uid)).map(playlist => (
                          <button
                            key={playlist.uid}
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full bg-brand-500 text-white px-3 py-1 text-sm hover:bg-brand-600"
                            onClick={() => handleTogglePlaylist(playlist.uid)}
                            title={playlist.name}
                          >
                            <span className="truncate">{playlist.name}</span>
                            <span>✕</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
              </div>
            ) : undefined}
          />
          </div>
        </div>
      )}
    </div>
  );
}

export default Songs;
