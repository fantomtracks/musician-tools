import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SongForm } from '../components/SongForm';
import SongsList from '../components/SongsList';
import { songService, type CreateSongDTO, type UpdateSongDTO, type Song } from '../services/songService';
import { instrumentService, type Instrument } from '../services/instrumentService';
import { songPlayService, type SongPlay } from '../services/songPlayService';
import { playlistService, PlaylistConflictError, type Playlist } from '../services/playlistService';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { instrumentTechniquesMap, instrumentTuningsMap, instrumentTypeOptions } from '../constants/instrumentTypes';
import { applySongFilters, NO_INSTRUMENT } from '../utils/songFilters';
import { handleComboKeyDown, useScrollHighlightIntoView, comboboxInputAria, comboboxOptionAria } from '../utils/comboboxKeyboard';
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
  const [editingUid, setEditingUid] = useState<string | null>(null);
  // Story 13.1: serialization of the form as last loaded/saved, used to skip
  // redundant auto-saves (compared form-to-form, so it's stable). null = not editing.
  const [editBaselineJson, setEditBaselineJson] = useState<string | null>(null);
  // Story 13.1: ambient auto-save status shown next to the title while editing.
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
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
  const [page, setPage] = useState<'list' | 'form'>('list');
  // True when the edit form was opened by following the "already exists" link
  // from the add form — drives the "reset your filters" hint, since a song
  // reached that way is typically hidden from the list by a filter.
  const [cameFromDuplicate, setCameFromDuplicate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSongs, setSelectedSongs] = useState<Set<string>>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsSelectedUids') : null;
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [bulkPlaylistOpen, setBulkPlaylistOpen] = useState(false);
  const [bulkPlaylistSelection, setBulkPlaylistSelection] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'single' | 'multiple' | null>(null);
  const [deleteUid, setDeleteUid] = useState<string | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataSource, setMetadataSource] = useState<string | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsSidebarExpanded') : null;
    return saved === 'false' ? false : true; // default to expanded unless persisted false
  });
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

  const hasActiveFilters = Boolean(
    instrumentFilter ||
    myInstrumentFilter ||
    instrumentDifficultyFilter ||
    capoFilter !== '' ||
    tuningFilter ||
    keyFilter ||
    bpmMinFilter ||
    bpmMaxFilter ||
    pitchStandardMinFilter ||
    pitchStandardMaxFilter ||
    timeSignatureFilter ||
    modeFilter ||
    languageFilters.size > 0 ||
    playlistFilter ||
    techniqueFilters.size > 0 ||
    genreFilters.size > 0
  );

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

  // Reset to list view when clicking on Songs in header
  useEffect(() => {
    if (location.state?.resetToList) {
      // Story 13.1: this switches to the list without unmounting, so flush any
      // pending auto-save here too (the unmount-flush effect won't fire).
      void flushOnUnmountRef.current();
      setPage('list');
      setEditingUid(null);
      setEditBaselineJson(null);
      setSaveStatus('idle');
      // Clear the state to avoid triggering again
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);



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

  useEffect(() => {
    try {
      window.localStorage.setItem('songsSelectedUids', JSON.stringify(Array.from(selectedSongs)));
    } catch { /* ignore */ }
  }, [selectedSongs]);

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

  // Story 13.1 — Auto-save: persist the edited song WITHOUT leaving the screen.
  // While a live duplicate is active, the identity fields (title/artist) are
  // FROZEN (excluded from the payload → the server keeps their previous value),
  // so every OTHER field keeps auto-saving (decision 🅰️). Returns true on success.
  // In-flight guard + a shared debounce timer (in a ref) so flush / Mark / rapid
  // edits can't overlap or leave a pending save uncancelled.
  const savingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoSaveSong = async (): Promise<boolean> => {
    if (editingUid === null) return false;
    if (savingRef.current) return false; // a save is already in flight
    const payload: UpdateSongDTO = {
      ...form,
      instrument: form.instrument && form.instrument.length > 0 ? form.instrument : null,
      technique: form.technique && form.technique.length > 0 ? form.technique : [],
      genre: form.genre && form.genre.length > 0 ? form.genre : [],
      myInstrumentUid: form.myInstrumentUid ? form.myInstrumentUid : undefined,
      instrumentDifficulty: form.instrumentDifficulty || {},
      instrumentTuning: form.instrumentTuning || {},
    };
    // `lastPlayed` is server-managed (set by Mark as Played), never edited in the
    // form — never send it, or the auto-save would clobber a fresh play.
    delete payload.lastPlayed;
    const frozen = !!liveDuplicate;
    if (frozen) {
      // 🅰️: freeze the identity fields while a duplicate is shown; the rest saves.
      delete payload.title;
      delete payload.artist;
    }
    const snapshot = JSON.stringify(form);
    savingRef.current = true;
    const startedAt = Date.now();
    try {
      setSaveStatus('saving');
      const updatedSong = await songService.updateSong(editingUid, payload);
      setSongs(prev => prev.map(song => (song.uid === editingUid ? updatedSong : song)));
      setEditBaselineJson(snapshot); // the form is now the saved state
      // Keep "Saving…" perceptible even on an instant (local) save, so every save
      // produces a visible Saving→Saved transition. On a slow server it just stays
      // until the response, which already shows progress.
      const elapsed = Date.now() - startedAt;
      if (elapsed < 500) await new Promise(res => setTimeout(res, 500 - elapsed));
      // Don't claim "Saved ✓" while the title is frozen — the duplicate warning is
      // the real signal that the identity wasn't persisted.
      if (frozen) {
        setSaveStatus('idle');
      } else {
        setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        setSaveStatus('saved');
      }
      return true;
    } catch (err) {
      console.error(err);
      setSaveStatus('error'); // ⚠️ Not saved — surfaced ambiently, retried on the next edit
      return false;
    } finally {
      savingRef.current = false;
    }
  };

  // Always call the latest autoSaveSong from effects/handlers without re-subscribing.
  const autoSaveRef = useRef(autoSaveSong);
  autoSaveRef.current = autoSaveSong;

  // Debounced auto-save (~1.2 s). The timer lives in a ref so flush can cancel it.
  useEffect(() => {
    if (editingUid === null) return;
    if (editBaselineJson !== null && JSON.stringify(form) === editBaselineJson) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void autoSaveRef.current(); }, 1200);
    return () => { if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; } };
  }, [form, editingUid, editBaselineJson]);

  // Flush a pending auto-save (Back / Cancel / Enter / Mark / unmount). Cancels the
  // debounce timer first so it can't fire a second, overlapping save. Returns false
  // only when a save was attempted and FAILED.
  const flushAutoSave = async (): Promise<boolean> => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (editingUid !== null && editBaselineJson !== null && JSON.stringify(form) !== editBaselineJson) {
      return autoSaveRef.current();
    }
    return true;
  };

  // Flush the latest pending edit on unmount — covers the "Musician Tools" link and
  // any route change that doesn't go through Back/Cancel.
  const flushOnUnmountRef = useRef(flushAutoSave);
  flushOnUnmountRef.current = flushAutoSave;
  useEffect(() => () => { void flushOnUnmountRef.current(); }, []);

  // Story 13.1: leave the edit screen explicitly (sticky "Back to songlist" / Cancel).
  const backToList = async (): Promise<void> => {
    const ok = await flushAutoSave();
    setEditingUid(null);
    setForm(initialSong);
    setEditBaselineJson(null);
    setMetadataSource(null);
    setCameFromDuplicate(false);
    setSaveStatus('idle');
    setPage('list');
    if (!ok) {
      setToastMessage('Some changes could not be saved');
      setTimeout(() => setToastMessage(null), 2500);
    }
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
      setSelectedSongs(new Set());
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
  const openSongForEdit = (song: Song, fromDuplicate = false) => {
    setEditingUid(song.uid);
    const builtForm: CreateSongDTO = {
      ...song,
      capo: normalizeCapoValue(song.capo),
      instrument: Array.isArray(song.instrument) ? song.instrument : (song.instrument ? [song.instrument] : []),
      technique: Array.isArray(song.technique) ? song.technique : [],
      language: Array.isArray(song.language) ? song.language : (song.language ? [song.language] : []),
      genre: Array.isArray(song.genre) ? song.genre : (song.genre ? [song.genre] : []),
    };
    setForm(builtForm);
    // Story 13.1: baseline = the just-loaded form, so auto-save only fires once
    // the user actually changes something.
    setEditBaselineJson(JSON.stringify(builtForm));
    setSaveStatus('idle');
    setLastSavedAt(null);
    setMetadataSource(null);
    setCameFromDuplicate(fromDuplicate);
    setError(null);
    setPage('form');
  };

  // Open a song's edit form when navigated here from the session history (story 9.4).
  // Waits for songs to load, then clears the router state via navigate() — a raw
  // history.replaceState would NOT update useLocation().state, so the effect would
  // re-fire (and re-open the form, clobbering edits) on every later songs reload.
  useEffect(() => {
    const editUid = location.state?.editUid;
    if (!editUid || songs.length === 0) return;
    const song = songs.find(s => s.uid === editUid);
    if (song) openSongForEdit(song);
    navigate(location.pathname + location.search, { replace: true, state: null });
    // openSongForEdit is recreated each render; the navigate() above clears the state
    // so this runs once per navigation, hence it is omitted from the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, songs]);

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

    // Story 13.1: in EDIT mode there is no Save button — pressing Enter just
    // flushes the pending auto-save and STAYS on the song (no redirect).
    if (editingUid !== null) {
      await flushAutoSave();
      return;
    }

    // CREATE mode (explicit "Add"): validation + duplicate guard + redirect to list.
    const payload: CreateSongDTO = {
      ...form,
      instrument: form.instrument && form.instrument.length > 0 ? form.instrument : null,
      technique: form.technique && form.technique.length > 0 ? form.technique : [],
      genre: form.genre && form.genre.length > 0 ? form.genre : [],
      myInstrumentUid: form.myInstrumentUid ? form.myInstrumentUid : undefined,
      instrumentDifficulty: form.instrumentDifficulty || {},
      instrumentTuning: form.instrumentTuning || {},
    };

    try {
      setLoading(true);
      setError(null);

      if (liveDuplicate) {
        setError('This song already exists in your songlist.');
        setLoading(false);
        return;
      }

      const newSong = await songService.createSong(payload);

      // Add new song to selected playlists
      await Promise.all(
        playlists.map(async playlist => {
          const shouldHaveSong = selectedPlaylistUids.has(playlist.uid);
          if (shouldHaveSong) {
            const nextSongUids = [...(playlist.songUids || []), newSong.uid];
            await playlistService.updatePlaylist(playlist.uid, { songUids: nextSongUids });
          }
        })
      );

      // Reset playlist filter so the new song is visible
      setPlaylistFilter('');

      setForm(initialSong);
      setMetadataSource(null);
      setCameFromDuplicate(false);
      setPage('list');
    } catch (err) {
      setError('Error while saving');
      console.error(err);
    } finally {
      setLoading(false);
    }
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
      setSelectedSongs(prev => {
        const next = new Set(prev);
        next.delete(uidToDelete);
        return next;
      });
      
      setDeleteDialogOpen(false);
      setDeleteUid(null);
      setDeleteMode(null);
      
      // If we're editing this song, return to list
      if (editingUid === uidToDelete) {
        setEditingUid(null);
        setForm(initialSong);
        setPage('list');
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
      setSelectedSongs(new Set());
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

  const toggleSelectSong = (uid: string) => {
    setSelectedSongs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(uid)) {
        newSet.delete(uid);
      } else {
        newSet.add(uid);
      }
      return newSet;
    });
  };

  const selectAllSongs = () => {
    setSelectedSongs(new Set(displayedSongs.map(song => song.uid)));
  };

  const deselectAllSongs = () => {
    setSelectedSongs(new Set());
  };

  const toggleSelectAll = () => {
    if (displayedSongs.every(song => selectedSongs.has(song.uid))) {
      deselectAllSongs();
    } else {
      selectAllSongs();
    }
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

  const allDisplayedSelected = displayedSongs.length > 0 && displayedSongs.every(song => selectedSongs.has(song.uid));

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

      {page === 'list' ? (
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
          onAddNew={() => {
            setForm(initialSong);
            setEditingUid(null);
            setMetadataSource(null);
            setCameFromDuplicate(false);
            setPage('form');
          }}
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
          <div className="sticky top-16 z-20 mb-4 px-4 py-3 rounded-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between gap-3">
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => { void backToList(); }}
            >
              <span aria-hidden="true">←</span> Back to songlist
            </button>
            {editingUid && (
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
                  <span className="text-red-600 dark:text-red-400">⚠️ Not saved — retry</span>
                )}
              </span>
            )}
          </div>
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
            onCancel={() => { void backToList(); }}
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
