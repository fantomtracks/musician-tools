import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SongForm } from '../components/SongForm';
import { songService, type CreateSongDTO, type Song } from '../services/songService';
import { useAuth } from '../contexts/AuthContext';
import { toSlug } from '../utils/slug';
import { ConfirmDialog } from '../components/ConfirmDialog';

const initialSong: CreateSongDTO = {
  title: '',
  bpm: 120,
  key: '',
  chords: '',
  tabs: '',
  instrument: '',
  artist: '',
  album: '',
  tunning: '',
  lastPlayed: undefined,
};

function SongsPage() {
  const navigate = useNavigate();
  const [songs, setSongs] = useState<Song[]>([]);
  const [form, setForm] = useState<CreateSongDTO>(initialSong);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [sortByLastPlayed, setSortByLastPlayed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState<'list' | 'form'>('list');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSongs, setSelectedSongs] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'single' | 'multiple' | null>(null);
  const [deleteUid, setDeleteUid] = useState<string | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsSidebarExpanded') : null;
    return saved === 'false' ? false : true; // default to expanded unless persisted false
  });
  const [instrumentFilters, setInstrumentFilters] = useState<Set<string>>(new Set());
  const [instrumentMatchMode, setInstrumentMatchMode] = useState<'any' | 'all'>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('songsInstrumentMatchMode') : null;
    return saved === 'any' ? 'any' : 'all'; // default to 'all' for exclusive filtering
  });
  const [tunningFilter, setTunningFilter] = useState<string>('');
  const [keyFilter, setKeyFilter] = useState<string>('');
  const [filtersAccordionOpen, setFiltersAccordionOpen] = useState<boolean>(true);
  const [tunningAccordionOpen, setTunningAccordionOpen] = useState<boolean>(true);
  const [keyAccordionOpen, setKeyAccordionOpen] = useState<boolean>(true);
  const [bpmMinFilter, setBpmMinFilter] = useState<string>('');
  const [bpmMaxFilter, setBpmMaxFilter] = useState<string>('');
  const { user, logout } = useAuth();

  const toggleInstrumentFilter = (instrument: string) => {
    setInstrumentFilters(prev => {
      const next = new Set(prev);
      if (next.has(instrument)) next.delete(instrument);
      else next.add(instrument);
      return next;
    });
  };

  const clearTunningFilter = () => setTunningFilter('');

  useEffect(() => {
    loadSongs();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsSidebarExpanded', sidebarExpanded ? 'true' : 'false');
    } catch {}
  }, [sidebarExpanded]);

  useEffect(() => {
    try {
      window.localStorage.setItem('songsInstrumentMatchMode', instrumentMatchMode);
    } catch {}
  }, [instrumentMatchMode]);

  const loadSongs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await songService.getAllSongs();
      setSongs(data);
    } catch (err) {
      setError('Error while loading songs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const markPlayedNow = async (uid: string) => {
    try {
      const updatedSong = await songService.updateSong(uid, {
        lastPlayed: new Date().toISOString(),
      });
      setSongs(songs.map(song => (song.uid === uid ? updatedSong : song)));
    } catch (err) {
      setError('Error while updating');
      console.error(err);
    }
  };

  const handleMarkSelectedAsPlayedNow = async () => {
    try {
      setLoading(true);
      setError(null);
      const now = new Date().toISOString();
      
      await Promise.all(
        Array.from(selectedSongs).map(uid =>
          songService.updateSong(uid, { lastPlayed: now })
        )
      );
      
      const updatedSongs = songs.map(song =>
        selectedSongs.has(song.uid) ? { ...song, lastPlayed: now } : song
      );
      setSongs(updatedSongs);
      setSelectedSongs(new Set());
    } catch (err) {
      setError('Error while updating songs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: name === 'bpm' ? Number(value) : value });
  };

  const toggleFormInstrument = (instrument: string) => {
    const current = Array.isArray(form.instrument) ? form.instrument : (form.instrument ? [form.instrument] : []);
    const updated = current.includes(instrument)
      ? current.filter(i => i !== instrument)
      : [...current, instrument];
    setForm({ ...form, instrument: updated as any });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      if (editingUid !== null) {
        const updatedSong = await songService.updateSong(editingUid, form);
        setSongs(songs.map(song => (song.uid === editingUid ? updatedSong : song)));
        setEditingUid(null);
      } else {
        const newSong = await songService.createSong(form);
        setSongs([...songs, newSong]);
      }

      setForm(initialSong);
      setPage('list');
    } catch (err) {
      setError('Error while saving');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (uid: string) => {
    const song = songs.find(s => s.uid === uid);
    if (song) {
      const { uid: _uid, createdAt, updatedAt, ...rest } = song;
      setForm(rest);
      setEditingUid(uid);
    }
  };

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
      setDeleteDialogOpen(false);
      setDeleteUid(null);
      setDeleteMode(null);
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

  const sortedSongs = sortByLastPlayed
    ? [...songs].sort((a, b) => {
        if (!a.lastPlayed && !b.lastPlayed) return 0;
        if (!a.lastPlayed) return 1;
        if (!b.lastPlayed) return -1;
        return new Date(b.lastPlayed).getTime() - new Date(a.lastPlayed).getTime();
      })
    : songs;

  const filteredSongs = sortedSongs.filter(song => {
    const query = searchQuery.toLowerCase();
    const passesSearch = (
      song.title.toLowerCase().includes(query) ||
      song.artist?.toLowerCase().includes(query) ||
      song.album?.toLowerCase().includes(query)
    );
    const selected = Array.from(instrumentFilters);
    const songInstruments = Array.isArray(song.instrument)
      ? song.instrument
      : (song.instrument ? [song.instrument] : []);
    const passesInstrument =
      selected.length === 0 ||
      (instrumentMatchMode === 'all'
        ? selected.every(inst => songInstruments.includes(inst))
        : selected.some(inst => songInstruments.includes(inst)));
    const passesTunning = !tunningFilter || song.tunning === tunningFilter;
    const passesKey = !keyFilter || song.key === keyFilter;
    const min = bpmMinFilter ? parseInt(bpmMinFilter, 10) : undefined;
    const max = bpmMaxFilter ? parseInt(bpmMaxFilter, 10) : undefined;
    const bpm = song.bpm;
    const passesBpm = (
      (min === undefined || (typeof bpm === 'number' && bpm >= min)) &&
      (max === undefined || (typeof bpm === 'number' && bpm <= max))
    );
    return passesSearch && passesInstrument && passesTunning && passesKey && passesBpm;
  });

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortByColumnFunc = (items: Song[]) => {
    if (!sortColumn) return items;

    return [...items].sort((a, b) => {
      let aVal: any = (a as any)[sortColumn];
      let bVal: any = (b as any)[sortColumn];

      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      if (typeof aVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });
  };

  const displayedSongs = sortByColumnFunc(filteredSongs);

  const allDisplayedSelected = displayedSongs.length > 0 && displayedSongs.every(song => selectedSongs.has(song.uid));

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

  const SortHeader = ({ column, label }: { column: string; label: string }) => (
    <th
      className="text-left p-2 border-b cursor-pointer hover:bg-gray-100"
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortColumn === column && (
          <span className="text-sm">{sortDirection === 'asc' ? '▲' : '▼'}</span>
        )}
      </div>
    </th>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
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
          <button className="rounded-md px-2 py-1 hover:bg-red-100" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      {page === 'list' ? (
        <>
          <div className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-6">
              <Link to="/" className="text-2xl font-semibold text-gray-900 hover:text-brand-500 transition">Musician Tools</Link>
              <div className="flex items-center gap-3">
                {user && <span className="text-sm text-gray-600">Hello, {user.name}</span>}
                <button
                  className="inline-flex items-center rounded-md bg-brand-500 text-white px-3 py-2 hover:bg-brand-600 disabled:opacity-50"
                  onClick={() => {
                    setForm(initialSong);
                    setEditingUid(null);
                    setPage('form');
                  }}
                  disabled={loading}
                >
                  Add a song
                </button>
                <button
                  className="inline-flex items-center rounded-md bg-gray-300 text-gray-800 px-3 py-2 hover:bg-gray-400 disabled:opacity-50"
                  onClick={async () => {
                    await logout();
                    window.location.href = '/';
                  }}
                  disabled={loading}
                >
                  Logout
                </button>
              </div>
            </div>
            <div className="flex gap-4 items-stretch">
              <aside
                id="songs-sidebar"
                className={`${sidebarExpanded ? 'w-full md:w-64 fixed md:static inset-0 z-40' : 'w-10 md:w-10 relative'} shrink-0 min-w-[40px] overflow-hidden transition-all duration-200 border border-gray-200 bg-white rounded-md min-h-screen`}
                aria-hidden={false}
              >
                {/* Collapsed rail shows only toggle button */}
                {!sidebarExpanded ? (
                  <div className="p-2 flex items-center justify-center">
                    <button
                      type="button"
                      className="inline-flex items-center rounded-md bg-gray-100 text-gray-800 px-2 py-1 hover:bg-gray-200"
                      aria-label="Expand sidebar"
                      onClick={() => setSidebarExpanded(true)}
                    >
                      »
                    </button>
                  </div>
                ) : (
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold">Filters</h3>
                      <button
                        type="button"
                        className="inline-flex items-center rounded-md bg-gray-100 text-gray-800 px-2 py-1 hover:bg-gray-200"
                        aria-label="Collapse sidebar"
                        onClick={() => setSidebarExpanded(false)}
                      >
                        «
                      </button>
                    </div>
                    <div className="border border-gray-200 rounded-md">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between p-2 text-sm font-medium hover:bg-gray-50"
                        aria-expanded={filtersAccordionOpen}
                        onClick={() => setFiltersAccordionOpen(prev => !prev)}
                      >
                        <span>Instrument filters</span>
                        <span>{filtersAccordionOpen ? '▾' : '▸'}</span>
                      </button>
                      {filtersAccordionOpen && (
                        <div className="p-3 border-t">
                          <div className="text-xs font-semibold text-gray-700 mb-2">Filter by instrument</div>
                          <div className="flex flex-col gap-2">
                            {['Guitar','Piano','Bass','Drums','Vocals','Other'].map(inst => (
                              <label key={inst} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={instrumentFilters.has(inst)}
                                  onChange={() => toggleInstrumentFilter(inst)}
                                />
                                <span className="cursor-pointer">{inst}</span>
                              </label>
                            ))}
                          </div>
                          <div className="mt-3">
                            <div className="text-xs font-semibold text-gray-700 mb-1">Match mode</div>
                            <div className="flex items-center gap-3">
                              <label className="inline-flex items-center gap-1 text-xs cursor-pointer">
                                <input
                                  type="radio"
                                  name="instrument-match-mode"
                                  value="all"
                                  className="h-3 w-3"
                                  checked={instrumentMatchMode === 'all'}
                                  onChange={() => setInstrumentMatchMode('all')}
                                />
                                <span>All</span>
                              </label>
                              <label className="inline-flex items-center gap-1 text-xs cursor-pointer">
                                <input
                                  type="radio"
                                  name="instrument-match-mode"
                                  value="any"
                                  className="h-3 w-3"
                                  checked={instrumentMatchMode === 'any'}
                                  onChange={() => setInstrumentMatchMode('any')}
                                />
                                <span>Any</span>
                              </label>
                            </div>
                          </div>
                          <div className="mt-3">
                            <button
                              type="button"
                              className="inline-flex items-center rounded-md bg-gray-100 text-gray-800 px-2 py-1 hover:bg-gray-200"
                              onClick={() => setInstrumentFilters(new Set())}
                            >
                              Clear filters
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="border border-gray-200 rounded-md mt-3">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between p-2 text-sm font-medium hover:bg-gray-50"
                        aria-expanded={tunningAccordionOpen}
                        onClick={() => setTunningAccordionOpen(prev => !prev)}
                      >
                        <span>Tunning filters</span>
                        <span>{tunningAccordionOpen ? '▾' : '▸'}</span>
                      </button>
                      {tunningAccordionOpen && (
                        <div className="p-3 border-t">
                          <div className="text-xs font-semibold text-gray-700 mb-2">Filter by tunning</div>
                          <select
                            className="w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            value={tunningFilter}
                            onChange={e => setTunningFilter(e.target.value)}
                          >
                            <option value="">All tunings</option>
                            <option value="EADGBE">EADGBE (Standard)</option>
                            <option value="DADGBE">DADGBE (Drop D)</option>
                            <option value="EbAbDbGbBbEb">EbAbDbGbBbEb (Half-step down)</option>
                            <option value="DADGAD">DADGAD</option>
                            <option value="DGDGBD">DGDGBD (Open G)</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="border border-gray-200 rounded-md mt-3">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between p-2 text-sm font-medium hover:bg-gray-50"
                        aria-expanded={keyAccordionOpen}
                        onClick={() => setKeyAccordionOpen(prev => !prev)}
                      >
                        <span>Key filters</span>
                        <span>{keyAccordionOpen ? '▾' : '▸'}</span>
                      </button>
                      {keyAccordionOpen && (
                        <div className="p-3 border-t">
                          <div className="text-xs font-semibold text-gray-700 mb-2">Filter by key</div>
                          <select
                            className="w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            value={keyFilter}
                            onChange={e => setKeyFilter(e.target.value)}
                          >
                            <option value="">All keys</option>
                            <option value="C">C</option>
                            <option value="C#">C#</option>
                            <option value="Db">Db</option>
                            <option value="D">D</option>
                            <option value="Eb">Eb</option>
                            <option value="E">E</option>
                            <option value="F">F</option>
                            <option value="F#">F#</option>
                            <option value="Gb">Gb</option>
                            <option value="G">G</option>
                            <option value="Ab">Ab</option>
                            <option value="A">A</option>
                            <option value="Bb">Bb</option>
                            <option value="B">B</option>
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="border border-gray-200 rounded-md mt-3">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between p-2 text-sm font-medium hover:bg-gray-50"
                        aria-expanded={true}
                        onClick={() => {}}
                      >
                        <span>BPM filters</span>
                        <span>▾</span>
                      </button>
                      <div className="p-3 border-t">
                        <div className="text-xs font-semibold text-gray-700 mb-2">Filter by BPM</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label htmlFor="bpm-min" className="block text-xs text-gray-700">Min</label>
                            <input
                              id="bpm-min"
                              type="number"
                              min={1}
                              placeholder="e.g. 90"
                              className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                              value={bpmMinFilter}
                              onChange={e => setBpmMinFilter(e.target.value)}
                            />
                          </div>
                          <div>
                            <label htmlFor="bpm-max" className="block text-xs text-gray-700">Max</label>
                            <input
                              id="bpm-max"
                              type="number"
                              min={1}
                              placeholder="e.g. 140"
                              className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                              value={bpmMaxFilter}
                              onChange={e => setBpmMaxFilter(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </aside>
              <div className="flex-1">
                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Search by title, artist, or album..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                {selectedSongs.size > 0 && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-blue-900">{selectedSongs.size} song(s) selected</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center rounded-md bg-green-600 text-white px-3 py-1.5 text-sm hover:bg-green-700 disabled:opacity-50"
                          onClick={handleMarkSelectedAsPlayedNow}
                          disabled={loading}
                        >
                          Mark as played now
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center rounded-md bg-red-600 text-white px-3 py-1.5 text-sm hover:bg-red-700 disabled:opacity-50"
                          onClick={handleDeleteSelected}
                          disabled={loading}
                        >
                          Delete selected
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <h2 className="text-lg font-medium mb-2">Song list</h2>
                {loading ? (
                  <p>Loading...</p>
                ) : filteredSongs.length === 0 ? (
                  <p>{searchQuery ? 'No songs match your search.' : 'No songs saved.'}</p>
                ) : (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="text-left p-2 border-b w-10">
                          <button
                            type="button"
                            className="text-xs rounded px-1.5 py-0.5 bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                            onClick={toggleSelectAll}
                            disabled={loading}
                            title={allDisplayedSelected ? "Deselect all" : "Select all"}
                          >
                            {allDisplayedSelected ? 'None' : 'All'}
                          </button>
                        </th>
                        <SortHeader column="artist" label="Artist" />
                        <SortHeader column="title" label="Title" />
                        <SortHeader column="lastPlayed" label="Last played" />
                        <th className="text-left p-2 border-b">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedSongs.map(song => (
                        <tr key={song.uid} className={`border-b cursor-pointer ${selectedSongs.has(song.uid) ? 'bg-blue-100 hover:bg-blue-200' : 'hover:bg-gray-100'}`} onClick={() => toggleSelectSong(song.uid)}>
                          <td className="p-2 align-top w-10" onClick={e => e.stopPropagation()}>
                            <input
                              className="h-4 w-4 cursor-pointer"
                              type="checkbox"
                              checked={selectedSongs.has(song.uid)}
                              onChange={() => toggleSelectSong(song.uid)}
                              disabled={loading}
                            />
                          </td>
                          <td className="p-2 align-top max-w-xs truncate" title={song.artist}>{song.artist}</td>
                          <td className="p-2 align-top max-w-sm truncate" title={song.title}>{song.title}</td>
                          <td className="p-2 align-top max-w-32">{formatLastPlayed(song.lastPlayed)}</td>
                          <td className="p-2 align-top">
                            <button
                              type="button"
                              className="inline-flex items-center rounded-md bg-blue-600 text-white px-2 py-1 hover:bg-blue-700 disabled:opacity-50"
                              onClick={() => {
                                navigate(`/song/${toSlug(song.artist)}/${toSlug(song.title)}`);
                              }}
                              disabled={loading}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="max-w-2xl mx-auto p-6">
          <div className="mb-6">
            <Link to="/" className="text-2xl font-semibold text-gray-900 hover:text-brand-500 transition">Musician Tools</Link>
            <p className="text-sm text-gray-600">{editingUid ? 'Edit a song' : 'Add a song'}</p>
          </div>
          <SongForm
            mode={editingUid ? 'edit' : 'add'}
            form={form}
            loading={loading}
            onChange={handleChange}
            onToggleInstrument={toggleFormInstrument}
            onSubmit={handleSubmit}
            onCancel={() => {
              setEditingUid(null);
              setForm(initialSong);
              setPage('list');
            }}
            onDelete={editingUid ? () => handleDelete(editingUid) : undefined}
          />
        </div>
      )}
    </div>
  );
}

export default SongsPage;
