import { render, screen, fireEvent } from '@testing-library/react';
import SongsSidebar, { type SongsSidebarProps } from '../components/SongsSidebar';

function makeProps(overrides: Partial<SongsSidebarProps> = {}): SongsSidebarProps {
  return {
    // UI state
    sidebarExpanded: true,
    setSidebarExpanded: jest.fn(),
    filtersAccordionOpen: true,
    setFiltersAccordionOpen: jest.fn(),
    playlistAccordionOpen: false,
    setPlaylistAccordionOpen: jest.fn(),
    tuningAccordionOpen: false,
    setTuningAccordionOpen: jest.fn(),
    difficultyAccordionOpen: true,
    setDifficultyAccordionOpen: jest.fn(),
    capoAccordionOpen: true,
    setCapoAccordionOpen: jest.fn(),
    techniqueAccordionOpen: false,
    setTechniqueAccordionOpen: jest.fn(),
    genreAccordionOpen: false,
    setGenreAccordionOpen: jest.fn(),
    keyAccordionOpen: true,
    setKeyAccordionOpen: jest.fn(),
    bpmAccordionOpen: false,
    setBpmAccordionOpen: jest.fn(),
    pitchAccordionOpen: false,
    setPitchAccordionOpen: jest.fn(),
    timeSignatureAccordionOpen: false,
    setTimeSignatureAccordionOpen: jest.fn(),
    modeAccordionOpen: true,
    setModeAccordionOpen: jest.fn(),
    languageAccordionOpen: false,
    setLanguageAccordionOpen: jest.fn(),

    // Filters
    instrumentFilter: '',
    myInstrumentFilter: '',
    instrumentDifficultyFilter: '',
    capoFilter: '',
    tuningFilter: '',
    technicianFilters: new Set<string>(),
    techniqueMatchMode: 'any',
    genreFilters: new Set<string>(),
    genreMatchMode: 'any',
    keyFilter: '',
    bpmMinFilter: '',
    bpmMaxFilter: '',
    pitchStandardMinFilter: '',
    pitchStandardMaxFilter: '',
    playlistFilter: '',
    timeSignatureFilter: '',
    modeFilter: '',
    languageFilters: new Set<string>(),
    languageMatchMode: 'any',

    // Filter setters
    setInstrumentFilter: jest.fn(),
    setMyInstrumentFilter: jest.fn(),
    setInstrumentDifficultyFilter: jest.fn(),
    setCapoFilter: jest.fn(),
    setTuningFilter: jest.fn(),
    toggleTechniqueFilter: jest.fn(),
    setTechniqueMatchMode: jest.fn(),
    toggleGenreFilter: jest.fn(),
    setGenreMatchMode: jest.fn(),
    setKeyFilter: jest.fn(),
    setBpmMinFilter: jest.fn(),
    setBpmMaxFilter: jest.fn(),
    setPitchStandardMinFilter: jest.fn(),
    setPitchStandardMaxFilter: jest.fn(),
    setPlaylistFilter: jest.fn(),
    setTimeSignatureFilter: jest.fn(),
    setModeFilter: jest.fn(),
    toggleLanguageFilter: jest.fn(),
    setLanguageMatchMode: jest.fn(),

    // Data
    playlists: [],
    myInstruments: [],
    instrumentTypeOptions: [],
    tuningFilterOptions: [],
    genreOptions: [],
    availableTechniqueFilters: [],
    languageFilterOptions: [],
    hasActiveFilters: false,
    showTuningFilters: false,
    clearAllFilters: jest.fn(),
    ...overrides
  };
}

test('renders time signature and BPM accordions and toggles open state', () => {
  const props = makeProps();
  render(<SongsSidebar {...props} />);
  const tsButton = screen.getByText('Time signature filters');
  fireEvent.click(tsButton);
  expect(props.setTimeSignatureAccordionOpen).toHaveBeenCalledWith(true);

  const bpmButton = screen.getByText('BPM filters');
  fireEvent.click(bpmButton);
  expect(props.setBpmAccordionOpen).toHaveBeenCalledWith(true);
});

test('clear all triggers callback when active filters', () => {
  const props = makeProps({ hasActiveFilters: true });
  render(<SongsSidebar {...props} />);
  const clear = screen.getByText('Clear all');
  fireEvent.click(clear);
  expect(props.clearAllFilters).toHaveBeenCalled();
});