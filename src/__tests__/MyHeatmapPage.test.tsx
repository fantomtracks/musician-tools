import { render, screen, fireEvent, within, act } from '@testing-library/react';
import MyHeatmapPage from '../pages/MyHeatmapPage';
import { practiceSessionService } from '../services/practiceSessionService';
import { buildYearGrid } from '../utils/heatmap';

jest.mock('../services/practiceSessionService', () => ({
  practiceSessionService: {
    getHeatmap: jest.fn(),
  },
}));

const mockedService = practiceSessionService as jest.Mocked<typeof practiceSessionService>;

const YEAR = new Date().getFullYear();
const isLeap = (YEAR % 4 === 0 && YEAR % 100 !== 0) || YEAR % 400 === 0;
const DAYS_IN_YEAR = isLeap ? 366 : 365;

beforeEach(() => {
  jest.clearAllMocks();
  mockedService.getHeatmap.mockResolvedValue([]);
});

test('renders one gridcell per day of the current year', async () => {
  render(<MyHeatmapPage />);

  const grid = await screen.findByRole('grid', { name: `Practice heatmap ${YEAR}` });
  expect(within(grid).getAllByRole('gridcell')).toHaveLength(DAYS_IN_YEAR);
  expect(mockedService.getHeatmap).toHaveBeenCalledWith(YEAR);
});

test('active days carry textual alternatives, empty days stay neutral (FR18/NFR6)', async () => {
  mockedService.getHeatmap.mockResolvedValue([
    { date: `${YEAR}-03-10`, totalMinutes: 120, sessionCount: 2 },
    { date: `${YEAR}-03-11`, totalMinutes: 1, sessionCount: 1 },
  ]);

  render(<MyHeatmapPage />);

  expect(await screen.findByLabelText(`${YEAR}-03-10 — 120 minutes, 2 sessions`)).toBeInTheDocument();
  expect(screen.getByLabelText(`${YEAR}-03-11 — 1 minute, 1 session`)).toBeInTheDocument();
  expect(screen.getByLabelText(`${YEAR}-01-15 — no practice`)).toBeInTheDocument();
});

test('a zero-minute session day lights up at the minimal level (FR15)', async () => {
  mockedService.getHeatmap.mockResolvedValue([
    { date: `${YEAR}-03-10`, totalMinutes: 0, sessionCount: 1 },
    { date: `${YEAR}-03-11`, totalMinutes: 100, sessionCount: 1 },
  ]);

  render(<MyHeatmapPage />);

  const minimal = await screen.findByLabelText(`${YEAR}-03-10 — 0 minutes, 1 session`);
  expect(minimal.className).toContain('bg-green-200');
  // An empty day stays neutral gray — never red, never aggressive
  const empty = screen.getByLabelText(`${YEAR}-01-15 — no practice`);
  expect(empty.className).toContain('bg-gray-200');
});

test('the relative scale puts the user top day at the highest level (FR15)', async () => {
  mockedService.getHeatmap.mockResolvedValue([
    { date: `${YEAR}-03-01`, totalMinutes: 10, sessionCount: 1 },
    { date: `${YEAR}-03-02`, totalMinutes: 20, sessionCount: 1 },
    { date: `${YEAR}-03-03`, totalMinutes: 30, sessionCount: 1 },
    { date: `${YEAR}-03-04`, totalMinutes: 40, sessionCount: 1 },
  ]);

  render(<MyHeatmapPage />);

  const top = await screen.findByLabelText(`${YEAR}-03-04 — 40 minutes, 1 session`);
  expect(top.className).toContain('bg-green-800');
});

test('FR20: with zero sessions the grid still renders with a neutral message', async () => {
  render(<MyHeatmapPage />);

  expect(await screen.findByRole('grid', { name: `Practice heatmap ${YEAR}` })).toBeInTheDocument();
  expect(screen.getByText(`No practice logged in ${YEAR} yet.`)).toBeInTheDocument();
});

test('a failed load shows an error and no misleading grid', async () => {
  mockedService.getHeatmap.mockRejectedValue(new Error('Failed to fetch heatmap'));

  render(<MyHeatmapPage />);

  expect(await screen.findByText('Heatmap could not be loaded.')).toBeInTheDocument();
  expect(screen.queryByRole('grid')).not.toBeInTheDocument();
});

test('arrow keys move the roving focus between day cells (NFR6)', async () => {
  render(<MyHeatmapPage />);

  const grid = await screen.findByRole('grid', { name: `Practice heatmap ${YEAR}` });
  const firstCell = screen.getByLabelText(`${YEAR}-01-01 — no practice`);
  expect(firstCell).toHaveAttribute('tabindex', '0');

  act(() => firstCell.focus());
  fireEvent.keyDown(grid, { key: 'ArrowDown' });
  expect(screen.getByLabelText(`${YEAR}-01-02 — no practice`)).toHaveFocus();

  fireEvent.keyDown(grid, { key: 'ArrowRight' });
  expect(screen.getByLabelText(`${YEAR}-01-09 — no practice`)).toHaveFocus();

  fireEvent.keyDown(grid, { key: 'ArrowUp' });
  expect(screen.getByLabelText(`${YEAR}-01-08 — no practice`)).toHaveFocus();

  // APG: at an edge, focus does NOT move (no clamping into another row)
  const first = screen.getByLabelText(`${YEAR}-01-01 — no practice`);
  act(() => first.focus());
  fireEvent.keyDown(grid, { key: 'ArrowUp' });
  expect(first).toHaveFocus();
  fireEvent.keyDown(grid, { key: 'ArrowLeft' });
  expect(first).toHaveFocus();

  // Modifier chords (browser back…) are not hijacked
  fireEvent.keyDown(grid, { key: 'ArrowRight', altKey: true });
  expect(first).toHaveFocus();

  // End jumps to the last same-weekday cell of the year, Home back to the first
  let endIndex = 0;
  while (endIndex + 7 < DAYS_IN_YEAR) endIndex += 7;
  const endDate = buildYearGrid(YEAR).days[endIndex];
  fireEvent.keyDown(grid, { key: 'End' });
  expect(screen.getByLabelText(`${endDate} — no practice`)).toHaveFocus();
  fireEvent.keyDown(grid, { key: 'Home' });
  expect(first).toHaveFocus();
});
