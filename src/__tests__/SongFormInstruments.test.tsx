import { render, screen, fireEvent } from '@testing-library/react';
import SongFormInstruments from '../components/SongFormInstruments';
import { instrumentTechniquesMap, instrumentTuningsMap } from '../constants/instrumentTypes';

const baseProps = {
  currentInstruments: ['Guitar'],
  capo: null,
  instrumentDifficulty: {},
  instrumentTuning: {},
  currentTechniques: [],
  instrumentLinks: {},
  myInstrumentUid: undefined,
  onChangeInstruments: jest.fn(),
  onSetInstrumentDifficulty: jest.fn(),
  onSetInstrumentTuning: jest.fn(),
  onToggleTechnique: jest.fn(),
  onSetInstrumentLinksForInstrument: jest.fn(),
  onSetMyInstrumentUid: jest.fn(),
  onMarkAsPlayedNow: jest.fn(),
  myInstruments: [],
  songPlays: [],
  formatLastPlayed: undefined,
  mode: 'edit' as const,
  loading: false,
  expandedInstruments: new Set(['Guitar']),
  setExpandedInstruments: jest.fn(),
};

function renderInstrument(overrides = {}) {
  const props = { ...baseProps, ...overrides };
  render(<SongFormInstruments {...props} />);
  return props;
}

test('clicking a technique toggles callback', () => {
  const props = renderInstrument();
  const technique = instrumentTechniquesMap['Guitar'][0];
  const btn = screen.getByText(technique);
  fireEvent.click(btn);
  expect(props.onToggleTechnique).toHaveBeenCalledWith(technique);
});

test('clicking difficulty star calls setter', () => {
  const props = renderInstrument();
  const star = screen.getByTitle('Difficulty 3');
  fireEvent.click(star);
  expect(props.onSetInstrumentDifficulty).toHaveBeenCalledWith('Guitar', 3);
});

test('remove instrument button removes instrument', () => {
  const props = renderInstrument();
  const remove = screen.getByTitle('Remove this instrument');
  fireEvent.click(remove);
  expect(props.onChangeInstruments).toHaveBeenCalledWith([]);
});

test('mark as played triggers callback and shows last played text', () => {
  const props = renderInstrument({
    songPlays: [{ instrumentType: 'Guitar', playedAt: '2024-01-01T00:00:00Z' }],
    formatLastPlayed: (d: string | undefined) => `Last: ${d}`,
  });

  const markBtn = screen.getByText('Mark as played');
  fireEvent.click(markBtn);
  expect(props.onMarkAsPlayedNow).toHaveBeenCalledWith('Guitar');

  expect(screen.getByText(/Last:/)).toBeInTheDocument();
});

test('tuning select calls setter', () => {
  const props = renderInstrument({
    instrumentTuning: { Guitar: '' },
  });
  const select = screen.getAllByRole('combobox').find(el => el instanceof HTMLSelectElement);
  expect(select).toBeDefined();
  if (!select) throw new Error('select not found');
  fireEvent.change(select, { target: { value: 'DADGBE' } });
  expect(props.onSetInstrumentTuning).toHaveBeenCalledWith('Guitar', 'DADGBE');
});

test('Bass tunings include the half-step-down 4- and 5-string options (16.2)', () => {
  const bass = instrumentTuningsMap['Bass'];
  const values = bass.map(t => t.value);
  expect(values).toContain('EbAbDbGb');
  expect(values).toContain('BbEbAbDbGb');
  // labels are user-facing (English) and disambiguate the string count
  expect(bass.find(t => t.value === 'EbAbDbGb')?.label).toBe('EbAbDbGb (Half-step down 4-string)');
  expect(bass.find(t => t.value === 'BbEbAbDbGb')?.label).toBe('BbEbAbDbGb (Half-step down 5-string)');
  // placed after Drop D, before Other (standards → altered → Other)
  expect(values.indexOf('EbAbDbGb')).toBeGreaterThan(values.indexOf('DADG'));
  expect(values.indexOf('BbEbAbDbGb')).toBeLessThan(values.indexOf('Other'));
});