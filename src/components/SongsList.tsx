import { Link } from 'react-router-dom';
import type { Song } from '../services/songService';
import type { ReactNode } from 'react';
import SongsSidebar from './SongsSidebar';
import FiltersDisclosureButton from './FiltersDisclosureButton';
import { BulkActionBar } from './BulkActionBar';
import { RowSelectionCheckbox, SelectAllCheckbox } from './SelectionCheckbox';
import { selectionCell } from '../utils/selectionCell';

export interface SongsListProps {
  // State
  songs: Song[];
  filteredSongs: Song[];
  displayedSongs: Song[];
  loading: boolean;
  
  // Search & filters
  searchQuery: string;
  instrumentFilter: string;
  myInstrumentFilter: string;
  instrumentDifficultyFilter: number | '';
  capoFilter: number | '';
  tuningFilter: string;
  technicianFilters: Set<string>;
  techniqueMatchMode: 'all' | 'any';
  genreFilters: Set<string>;
  genreMatchMode: 'all' | 'any';
  keyFilter: string;
  bpmMinFilter: string;
  bpmMaxFilter: string;
  pitchStandardMinFilter: string;
  pitchStandardMaxFilter: string;
  playlistFilter: string;
  timeSignatureFilter: string;
  modeFilter: string;
  languageFilters: Set<string>;
  languageMatchMode: 'all' | 'any';
  languageFilterOptions: string[];
  selectedSongs: Set<string>;
  
  // UI state
  sidebarExpanded: boolean;
  mobileFiltersOpen: boolean;
  setMobileFiltersOpen: (o: boolean) => void;
  filtersAccordionOpen: boolean;
  playlistAccordionOpen: boolean;
  tuningAccordionOpen: boolean;
  difficultyAccordionOpen: boolean;
  capoAccordionOpen: boolean;
  techniqueAccordionOpen: boolean;
  genreAccordionOpen: boolean;
  keyAccordionOpen: boolean;
  bpmAccordionOpen: boolean;
  pitchAccordionOpen: boolean;
  timeSignatureAccordionOpen: boolean;
  modeAccordionOpen: boolean;
  languageAccordionOpen: boolean;
  bulkPlaylistOpen: boolean;
  
  // Data
  playlists: Array<{ uid: string; name: string; songUids?: string[] }>;
  myInstruments: Array<{ uid: string; type?: string; name: string }>;
  instrumentTypeOptions: string[];
  tuningFilterOptions: Array<{ value: string; label: string }>;
  genreOptions: string[];
  availableTechniqueFilters: string[];
  allDisplayedSelected: boolean;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  showTuningFilters: boolean;
  bulkPlaylistSelection: Set<string>;
  
  // Handlers
  setSearchQuery: (q: string) => void;
  setInstrumentFilter: (f: string) => void;
  setMyInstrumentFilter: (f: string) => void;
  setInstrumentDifficultyFilter: (f: number | '') => void;
  setCapoFilter: (f: number | '') => void;
  setTuningFilter: (f: string) => void;
  toggleTechniqueFilter: (t: string) => void;
  setTechniqueMatchMode: (m: 'all' | 'any') => void;
  toggleGenreFilter: (g: string) => void;
  setGenreMatchMode: (m: 'all' | 'any') => void;
  setKeyFilter: (f: string) => void;
  setBpmMinFilter: (v: string) => void;
  setBpmMaxFilter: (v: string) => void;
  setPitchStandardMinFilter: (v: string) => void;
  setPitchStandardMaxFilter: (v: string) => void;
  setPlaylistFilter: (f: string) => void;
  setTimeSignatureFilter: (f: string) => void;
  setModeFilter: (f: string) => void;
  toggleLanguageFilter: (l: string) => void;
  setLanguageMatchMode: (m: 'all' | 'any') => void;
  setLanguageAccordionOpen: (o: boolean) => void;
  setSidebarExpanded: (e: boolean) => void;
  setFiltersAccordionOpen: (o: boolean) => void;
  setPlaylistAccordionOpen: (o: boolean) => void;
  setTuningAccordionOpen: (o: boolean) => void;
  setDifficultyAccordionOpen: (o: boolean) => void;
  setCapoAccordionOpen: (o: boolean) => void;
  setTechniqueAccordionOpen: (o: boolean) => void;
  setGenreAccordionOpen: (o: boolean) => void;
  setKeyAccordionOpen: (o: boolean) => void;
  setBpmAccordionOpen: (o: boolean) => void;
  setPitchAccordionOpen: (o: boolean) => void;
  setTimeSignatureAccordionOpen: (o: boolean) => void;
  setModeAccordionOpen: (o: boolean) => void;
  setBulkPlaylistOpen: (o: boolean) => void;
  toggleSelectSong: (uid: string) => void;
  toggleSelectAll: () => void;
  toggleBulkPlaylistSelection: (uid: string) => void;
  handleApplySelectedToPlaylists: () => void;
  handleMarkSelectedAsPlayedNow: () => void;
  handleDeleteSelected: () => void;
  clearAllFilters: () => void;
  
  // Callbacks
  onEdit: (song: Song) => void;
  onAddNew: () => void;
  
  // Additional handlers
  getLastPlayedForSong: (uid: string) => string | undefined;
  formatLastPlayed: (date: string | undefined) => string;
  SortHeader: (props: { column: string; label: string; align?: 'left' | 'right' }) => ReactNode;
}

export default function SongsList(props: SongsListProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <FiltersDisclosureButton
          open={props.mobileFiltersOpen}
          onToggle={() => props.setMobileFiltersOpen(!props.mobileFiltersOpen)}
          activeFilterCount={props.activeFilterCount}
        />
        <SongsSidebar
          mobileFiltersOpen={props.mobileFiltersOpen}
          sidebarExpanded={props.sidebarExpanded}
          setSidebarExpanded={props.setSidebarExpanded}
          filtersAccordionOpen={props.filtersAccordionOpen}
          setFiltersAccordionOpen={props.setFiltersAccordionOpen}
          playlistAccordionOpen={props.playlistAccordionOpen}
          setPlaylistAccordionOpen={props.setPlaylistAccordionOpen}
          tuningAccordionOpen={props.tuningAccordionOpen}
          setTuningAccordionOpen={props.setTuningAccordionOpen}
          difficultyAccordionOpen={props.difficultyAccordionOpen}
          setDifficultyAccordionOpen={props.setDifficultyAccordionOpen}
          capoAccordionOpen={props.capoAccordionOpen}
          setCapoAccordionOpen={props.setCapoAccordionOpen}
          techniqueAccordionOpen={props.techniqueAccordionOpen}
          setTechniqueAccordionOpen={props.setTechniqueAccordionOpen}
          genreAccordionOpen={props.genreAccordionOpen}
          setGenreAccordionOpen={props.setGenreAccordionOpen}
          keyAccordionOpen={props.keyAccordionOpen}
          setKeyAccordionOpen={props.setKeyAccordionOpen}
          bpmAccordionOpen={props.bpmAccordionOpen}
          setBpmAccordionOpen={props.setBpmAccordionOpen}
          pitchAccordionOpen={props.pitchAccordionOpen}
          setPitchAccordionOpen={props.setPitchAccordionOpen}
          timeSignatureAccordionOpen={props.timeSignatureAccordionOpen}
          setTimeSignatureAccordionOpen={props.setTimeSignatureAccordionOpen}
          modeAccordionOpen={props.modeAccordionOpen}
          setModeAccordionOpen={props.setModeAccordionOpen}
          instrumentFilter={props.instrumentFilter}
          myInstrumentFilter={props.myInstrumentFilter}
          instrumentDifficultyFilter={props.instrumentDifficultyFilter}
          capoFilter={props.capoFilter}
          tuningFilter={props.tuningFilter}
          technicianFilters={props.technicianFilters}
          techniqueMatchMode={props.techniqueMatchMode}
          genreFilters={props.genreFilters}
          genreMatchMode={props.genreMatchMode}
          keyFilter={props.keyFilter}
          bpmMinFilter={props.bpmMinFilter}
          bpmMaxFilter={props.bpmMaxFilter}
          pitchStandardMinFilter={props.pitchStandardMinFilter}
          pitchStandardMaxFilter={props.pitchStandardMaxFilter}
          playlistFilter={props.playlistFilter}
          timeSignatureFilter={props.timeSignatureFilter}
          modeFilter={props.modeFilter}
          languageFilters={props.languageFilters}
          languageMatchMode={props.languageMatchMode}
          languageAccordionOpen={props.languageAccordionOpen}
          languageFilterOptions={props.languageFilterOptions}
          setInstrumentFilter={props.setInstrumentFilter}
          setMyInstrumentFilter={props.setMyInstrumentFilter}
          setInstrumentDifficultyFilter={props.setInstrumentDifficultyFilter}
          setCapoFilter={props.setCapoFilter}
          setTuningFilter={props.setTuningFilter}
          toggleTechniqueFilter={props.toggleTechniqueFilter}
          setTechniqueMatchMode={props.setTechniqueMatchMode}
          toggleGenreFilter={props.toggleGenreFilter}
          setGenreMatchMode={props.setGenreMatchMode}
          setKeyFilter={props.setKeyFilter}
          setBpmMinFilter={props.setBpmMinFilter}
          setBpmMaxFilter={props.setBpmMaxFilter}
          setPitchStandardMinFilter={props.setPitchStandardMinFilter}
          setPitchStandardMaxFilter={props.setPitchStandardMaxFilter}
          setPlaylistFilter={props.setPlaylistFilter}
          setTimeSignatureFilter={props.setTimeSignatureFilter}
          setModeFilter={props.setModeFilter}
          toggleLanguageFilter={props.toggleLanguageFilter}
          setLanguageMatchMode={props.setLanguageMatchMode}
          setLanguageAccordionOpen={props.setLanguageAccordionOpen}
          playlists={props.playlists}
          myInstruments={props.myInstruments}
          instrumentTypeOptions={props.instrumentTypeOptions}
          tuningFilterOptions={props.tuningFilterOptions}
          genreOptions={props.genreOptions}
          availableTechniqueFilters={props.availableTechniqueFilters}
          hasActiveFilters={props.hasActiveFilters}
          showTuningFilters={props.showTuningFilters}
          clearAllFilters={props.clearAllFilters}
        />
        <div className="w-full lg:flex-1 min-w-0 space-y-4">
          <div className="card-base glass-effect p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Songlist</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Manage your songs, filters, and playlists.</p>
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={props.onAddNew}
                disabled={props.loading}
              >
                Add a song
              </button>
            </div>
            <div className="mt-4">
              <label htmlFor="songs-search" className="block text-sm font-medium text-gray-700 dark:text-gray-100 mb-1">
                Search
              </label>
              <div className="relative">
              <input
                id="songs-search"
                type="text"
                placeholder="Search by title, artist, or album..."
                value={props.searchQuery}
                onChange={e => props.setSearchQuery(e.target.value)}
                className="input-base pr-10"
              />
              {props.searchQuery && (
                <button
                  type="button"
                  onClick={() => props.setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
              </div>
            </div>
          </div>
          {/* Bulk actions: the shared bar (22.1) hides itself when nothing is selected. */}
          <BulkActionBar count={props.selectedSongs.size} noun="song(s)">
            <div className="relative">
              <button
                type="button"
                className="btn-primary text-sm px-3 py-1.5"
                onClick={() => props.setBulkPlaylistOpen(!props.bulkPlaylistOpen)}
                disabled={props.loading || props.playlists.length === 0}
              >
                Add to playlist
              </button>
              {props.bulkPlaylistOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 shadow-lg z-20 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-700 dark:text-gray-200">Select playlists</p>
                    <button
                      type="button"
                      className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                      onClick={() => props.setBulkPlaylistOpen(false)}
                    >
                      ✕
                    </button>
                  </div>
                  {props.playlists.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No playlists found.{' '}
                      <Link to="/my-playlists" className="text-brand-500 dark:text-brand-400 hover:text-brand-600 dark:hover:text-brand-300">Create one</Link>
                    </p>
                  ) : (
                    <>
                      <div className="max-h-48 overflow-y-auto space-y-1 mb-3">
                        {props.playlists.map(pl => (
                          <label
                            key={pl.uid}
                            className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-1 rounded"
                          >
                            <input
                              type="checkbox"
                              checked={props.bulkPlaylistSelection.has(pl.uid)}
                              onChange={() => props.toggleBulkPlaylistSelection(pl.uid)}
                              className="rounded border-gray-300 accent-brand-500 dark:accent-brand-400"
                            />
                            <span className="text-sm text-gray-900 dark:text-gray-100">{pl.name}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{(pl.songUids || []).length}</span>
                          </label>
                        ))}
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="text-sm px-3 py-1 rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                          onClick={() => props.setBulkPlaylistOpen(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="text-sm px-3 py-1 rounded-md bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
                          onClick={props.handleApplySelectedToPlaylists}
                          disabled={props.bulkPlaylistSelection.size === 0 || props.loading}
                        >
                          Add
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            {props.instrumentFilter && (
              <button
                type="button"
                className="btn-primary text-sm px-3 py-1.5"
                onClick={props.handleMarkSelectedAsPlayedNow}
                disabled={props.loading}
              >
                {`Mark as played on ${props.instrumentFilter}`}
              </button>
            )}
            <button
              type="button"
              className="inline-flex items-center rounded-md bg-red-600 text-white px-3 py-1.5 text-sm hover:bg-red-700 disabled:opacity-50"
              onClick={props.handleDeleteSelected}
              disabled={props.loading}
            >
              Delete selected
            </button>
          </BulkActionBar>
          {props.loading ? (
            <div className="card-base p-6 text-sm text-gray-600 dark:text-gray-400">Loading...</div>
          ) : props.filteredSongs.length === 0 ? (
            <div className="card-base p-6 text-center text-gray-600 dark:text-gray-400">
              {props.searchQuery ? 'No songs match your search.' : 'No songs saved.'}
            </div>
          ) : (
            <div className="card-base overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 shadow-sm">
                    <tr>
                      <th className={selectionCell('text-center p-2 border-b dark:border-gray-700 w-12')}>
                        <SelectAllCheckbox
                          allSelected={props.allDisplayedSelected}
                          onToggle={props.toggleSelectAll}
                          disabled={props.loading}
                        />
                      </th>
                      <props.SortHeader column="artist" label="Artist" />
                      <props.SortHeader column="title" label="Title" />
                      <props.SortHeader column="lastPlayed" label="Last played" align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {props.displayedSongs.map(song => (
                      <tr
                        key={song.uid}
                        className={`border-b dark:border-gray-700 cursor-pointer ${props.selectedSongs.has(song.uid) ? 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-900 dark:hover:bg-blue-800' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                        // Row click opens the song (its edit form); selection is
                        // reserved to the checkbox, which stops propagation below
                        onClick={() => props.onEdit(song)}
                      >
                        <td className={selectionCell('p-2 text-center w-12')}>
                          <RowSelectionCheckbox
                            checked={props.selectedSongs.has(song.uid)}
                            onChange={() => props.toggleSelectSong(song.uid)}
                            label={song.artist ? `${song.title} by ${song.artist}` : song.title}
                            disabled={props.loading}
                          />
                        </td>
                        <td className="p-2 align-middle max-w-xs truncate" title={song.artist}>{song.artist}</td>
                        <td className="p-2 align-middle max-w-sm truncate" title={song.title}>{song.title}</td>
                        <td className="p-2 pr-4 align-middle text-right whitespace-nowrap w-px">
                          {props.instrumentFilter ? props.formatLastPlayed(props.getLastPlayedForSong(song.uid)) : 'Select instrument'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
