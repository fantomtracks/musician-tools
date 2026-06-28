import { render, screen, fireEvent } from '@testing-library/react';
import { SongForm } from '../components/SongForm';
import type { CreateSongDTO } from '../services/songService';

const baseForm: CreateSongDTO = {
  title: '',
  artist: '',
  album: '',
  notes: '',
  bpm: null,
  key: '',
  mode: '',
  timeSignature: '',
  pitchStandard: undefined,
  genre: [],
  technique: [],
  instrument: [],
  instrumentDifficulty: {},
  instrumentTuning: {},
  instrumentLinks: {},
  streamingLinks: []
};

function renderForm(overrides: Partial<CreateSongDTO> = {}, extraProps: Partial<React.ComponentProps<typeof SongForm>> = {}) {
  const form = { ...baseForm, ...overrides } as CreateSongDTO;
  const onChange = jest.fn();
  const onSetDurationSeconds = jest.fn();
  const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
  render(
    <SongForm
      mode="add"
      form={form}
      loading={false}
      onChange={onChange}
      onSetDurationSeconds={onSetDurationSeconds}
      onToggleGenre={jest.fn()}
      onToggleLanguage={jest.fn()}
      onChangeInstruments={jest.fn()}
      onSetTechniques={jest.fn()}
      onSetMyInstrumentUid={jest.fn()}
      onToggleTechnique={jest.fn()}
      onSubmit={onSubmit}
      onCancel={jest.fn()}
      suggestedAlbums={extraProps.suggestedAlbums || ['Revolver']}
      suggestedArtists={extraProps.suggestedArtists || ['The Beatles']}
    />
  );
  return { onChange, onSetDurationSeconds };
}

test('updates time signature select and calls onChange', () => {
  const { onChange } = renderForm();
  fireEvent.click(screen.getByText('Details'));
  const select = screen.getByLabelText('Time Signature') as HTMLSelectElement;
  fireEvent.change(select, { target: { value: '4/4' } });
  expect(onChange).toHaveBeenCalled();
});

test('renders the Duration (m:ss) field and shows stored seconds as m:ss', () => {
  renderForm({ durationSeconds: 210 }); // 3:30
  fireEvent.click(screen.getByText('Details'));
  const input = screen.getByLabelText('Duration (m:ss)') as HTMLInputElement;
  expect(input.value).toBe('3:30');
});

test('an empty duration renders blank', () => {
  renderForm({ durationSeconds: null });
  fireEvent.click(screen.getByText('Details'));
  const input = screen.getByLabelText('Duration (m:ss)') as HTMLInputElement;
  expect(input.value).toBe('');
});

test('parses m:ss input and commits seconds on blur, canonicalising the display', () => {
  const { onSetDurationSeconds } = renderForm({ durationSeconds: null });
  fireEvent.click(screen.getByText('Details'));
  const input = screen.getByLabelText('Duration (m:ss)') as HTMLInputElement;
  fireEvent.change(input, { target: { value: '3:30' } });
  fireEvent.blur(input);
  expect(onSetDurationSeconds).toHaveBeenCalledWith(210);
  expect(input.value).toBe('3:30');
});

test('reads a bare number as whole minutes', () => {
  const { onSetDurationSeconds } = renderForm({ durationSeconds: null });
  fireEvent.click(screen.getByText('Details'));
  const input = screen.getByLabelText('Duration (m:ss)') as HTMLInputElement;
  fireEvent.change(input, { target: { value: '4' } });
  fireEvent.blur(input);
  expect(onSetDurationSeconds).toHaveBeenCalledWith(240);
  expect(input.value).toBe('4:00');
});

test('a single-digit seconds part is read as tens (3:3 → 3:30)', () => {
  const { onSetDurationSeconds } = renderForm({ durationSeconds: null });
  fireEvent.click(screen.getByText('Details'));
  const input = screen.getByLabelText('Duration (m:ss)') as HTMLInputElement;
  fireEvent.change(input, { target: { value: '3:3' } });
  fireEvent.blur(input);
  expect(onSetDurationSeconds).toHaveBeenCalledWith(210);
  expect(input.value).toBe('3:30');
});

test('invalid input shows an error, keeps the text, and does not commit', () => {
  const { onSetDurationSeconds } = renderForm({ durationSeconds: null });
  fireEvent.click(screen.getByText('Details'));
  const input = screen.getByLabelText('Duration (m:ss)') as HTMLInputElement;
  fireEvent.change(input, { target: { value: '3,3' } });
  fireEvent.blur(input);
  expect(onSetDurationSeconds).not.toHaveBeenCalled(); // value left unchanged
  expect(input.value).toBe('3,3'); // text preserved for correction
  expect(screen.getByText(/seconds must be 0–59/i)).toBeInTheDocument();
});

test('seconds over 59 are rejected with an error (3:60)', () => {
  const { onSetDurationSeconds } = renderForm({ durationSeconds: null });
  fireEvent.click(screen.getByText('Details'));
  const input = screen.getByLabelText('Duration (m:ss)') as HTMLInputElement;
  fireEvent.change(input, { target: { value: '3:60' } });
  fireEvent.blur(input);
  expect(onSetDurationSeconds).not.toHaveBeenCalled();
  expect(screen.getByText(/seconds must be 0–59/i)).toBeInTheDocument();
});

test('correcting the input clears the error on change', () => {
  renderForm({ durationSeconds: null });
  fireEvent.click(screen.getByText('Details'));
  const input = screen.getByLabelText('Duration (m:ss)') as HTMLInputElement;
  fireEvent.change(input, { target: { value: '3:60' } });
  fireEvent.blur(input);
  expect(screen.getByText(/seconds must be 0–59/i)).toBeInTheDocument();
  fireEvent.change(input, { target: { value: '3:30' } });
  expect(screen.queryByText(/seconds must be 0–59/i)).not.toBeInTheDocument();
});

test('hides artist suggestions when exact single match', () => {
  renderForm({ artist: '' }, { suggestedArtists: ['The Beatles'] });
  const input = screen.getByLabelText('Artist') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'The Beatles' } });
  // Wait a tick for UI update
  // The dropdown should not be visible because it's a single exact match
  const dropdowns = screen.queryAllByRole('button', { name: 'The Beatles' });
  expect(dropdowns.length).toBe(0);
});

test('hides album suggestions when exact single match (parity with artist)', () => {
  renderForm({ album: '' }, { suggestedAlbums: ['Revolver'] });
  fireEvent.click(screen.getByText('Details'));
  const input = screen.getByLabelText('Album') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'Revolver' } });
  const dropdowns = screen.queryAllByRole('button', { name: 'Revolver' });
  expect(dropdowns.length).toBe(0);
});

// Keyboard navigation on the multi-select search comboboxes (Genres, Languages).
// Regression: typing then ArrowDown highlighted nothing and Enter submitted the
// form instead of selecting a suggestion.
function renderWithCallbacks() {
  const onToggleGenre = jest.fn();
  const onToggleLanguage = jest.fn();
  const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
  render(
    <SongForm
      mode="add"
      form={baseForm}
      loading={false}
      onChange={jest.fn()}
      onSetDurationSeconds={jest.fn()}
      onToggleGenre={onToggleGenre}
      onToggleLanguage={onToggleLanguage}
      onChangeInstruments={jest.fn()}
      onSetTechniques={jest.fn()}
      onSetMyInstrumentUid={jest.fn()}
      onToggleTechnique={jest.fn()}
      onSubmit={onSubmit}
      onCancel={jest.fn()}
      suggestedAlbums={[]}
      suggestedArtists={[]}
    />,
  );
  return { onToggleGenre, onToggleLanguage, onSubmit };
}

test('genre combobox: ArrowDown highlights then Enter selects it, without submitting the form', () => {
  const { onToggleGenre, onSubmit } = renderWithCallbacks();
  fireEvent.click(screen.getByText('Details'));
  const input = screen.getByPlaceholderText('Search or select a genre');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'blues' } });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onToggleGenre).toHaveBeenCalledWith('Blues');
  expect(onSubmit).not.toHaveBeenCalled();
});

test('genre combobox: Enter with no highlight neither selects nor submits', () => {
  const { onToggleGenre, onSubmit } = renderWithCallbacks();
  fireEvent.click(screen.getByText('Details'));
  const input = screen.getByPlaceholderText('Search or select a genre');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'blues' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onToggleGenre).not.toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
});

test('language combobox: ArrowDown + Enter selects the highlighted language (parity with genre)', () => {
  const { onToggleLanguage, onSubmit } = renderWithCallbacks();
  fireEvent.click(screen.getByText('Details'));
  const input = screen.getByPlaceholderText('Search or select a language');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'french' } });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onToggleLanguage).toHaveBeenCalledWith('French');
  expect(onSubmit).not.toHaveBeenCalled();
});

test('genre combobox: arrowing down scrolls the highlighted option into view', () => {
  // jsdom doesn't implement scrollIntoView; install a spy to assert the wiring.
  const scrollSpy = jest.fn();
  (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollSpy;
  try {
    renderWithCallbacks();
    fireEvent.click(screen.getByText('Details'));
    const input = screen.getByPlaceholderText('Search or select a genre');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'a' } }); // matches several genres
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest' });
  } finally {
    delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
  }
});

test('genre combobox: ARIA wiring + hovering an option makes it the single active descendant', () => {
  renderWithCallbacks();
  fireEvent.click(screen.getByText('Details'));
  const input = screen.getByPlaceholderText('Search or select a genre');
  // Editable-combobox ARIA: focus stays on the input, options are referenced.
  expect(input).toHaveAttribute('role', 'combobox');
  expect(input).toHaveAttribute('aria-controls', 'song-genres-list');

  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'a' } }); // several matches
  const before = screen.getAllByRole('option');
  expect(before.length).toBeGreaterThan(1);

  // Mouse and keyboard share ONE active state: hovering sets the active descendant.
  fireEvent.mouseEnter(before[1]);
  const options = screen.getAllByRole('option');
  expect(options[1]).toHaveAttribute('aria-selected', 'true');
  expect(input).toHaveAttribute('aria-activedescendant', options[1].id);
  // exactly one option is active at a time
  expect(options.filter(o => o.getAttribute('aria-selected') === 'true')).toHaveLength(1);
});