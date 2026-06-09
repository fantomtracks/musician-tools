import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyHeatmapPage from '../pages/MyHeatmapPage';
import { practiceSessionService } from '../services/practiceSessionService';
import { buildYearGrid, formatLocalDate } from '../utils/heatmap';

jest.mock('../services/practiceSessionService', () => ({
  practiceSessionService: {
    getHeatmap: jest.fn(),
    getAll: jest.fn(),
    getDayPlays: jest.fn(),
    remove: jest.fn(),
  },
}));

const mockedService = practiceSessionService as jest.Mocked<typeof practiceSessionService>;

const YEAR = new Date().getFullYear();
const isLeap = (YEAR % 4 === 0 && YEAR % 100 !== 0) || YEAR % 400 === 0;
const DAYS_IN_YEAR = isLeap ? 366 : 365;
const TODAY = formatLocalDate(new Date());

beforeEach(() => {
  jest.clearAllMocks();
  mockedService.getHeatmap.mockResolvedValue([]);
  mockedService.getAll.mockResolvedValue([]);
  mockedService.getDayPlays.mockResolvedValue([]);
});

// <Link> requires a Router context since 3.2
function renderPage() {
  return render(<MemoryRouter><MyHeatmapPage /></MemoryRouter>);
}

test('today\'s cell carries a discreet marker, other days do not (field feedback)', async () => {
  renderPage();

  // "today" is announced in the label, not by the discreet outline alone (a11y)
  const today = await screen.findByLabelText(`${TODAY} — no practice (today)`);
  expect(today.className).toContain('outline-gray');

  // A different empty day has neither the marker nor the suffix
  const otherDay = TODAY.endsWith('-01') ? `${YEAR}-01-15` : `${YEAR}-01-01`;
  const other = screen.getByLabelText(`${otherDay} — no practice`);
  expect(other.className).not.toContain('outline-gray');
});

test('renders one gridcell per day of the current year', async () => {
  renderPage();

  const grid = await screen.findByRole('grid', { name: `Practice heatmap ${YEAR}` });
  expect(within(grid).getAllByRole('gridcell')).toHaveLength(DAYS_IN_YEAR);
  expect(mockedService.getHeatmap).toHaveBeenCalledWith(YEAR);
});

test('active days carry textual alternatives, empty days stay neutral (FR18/NFR6)', async () => {
  mockedService.getHeatmap.mockResolvedValue([
    { date: `${YEAR}-03-10`, totalMinutes: 120, sessionCount: 2 },
    { date: `${YEAR}-03-11`, totalMinutes: 1, sessionCount: 1 },
  ]);

  renderPage();

  expect(await screen.findByLabelText(`${YEAR}-03-10 — 120 minutes, 2 sessions`)).toBeInTheDocument();
  expect(screen.getByLabelText(`${YEAR}-03-11 — 1 minute, 1 session`)).toBeInTheDocument();
  expect(screen.getByLabelText(`${YEAR}-01-15 — no practice`)).toBeInTheDocument();
});

test('a zero-minute session day lights up at the minimal level (FR15)', async () => {
  mockedService.getHeatmap.mockResolvedValue([
    { date: `${YEAR}-03-10`, totalMinutes: 0, sessionCount: 1 },
    { date: `${YEAR}-03-11`, totalMinutes: 100, sessionCount: 1 },
  ]);

  renderPage();

  const minimal = await screen.findByLabelText(`${YEAR}-03-10 — 0 minutes, 1 session`);
  expect(minimal.className).toContain('bg-green-400');
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

  renderPage();

  const top = await screen.findByLabelText(`${YEAR}-03-04 — 40 minutes, 1 session`);
  expect(top.className).toContain('bg-green-800');
});

test('FR20: with zero sessions the grid still renders with a neutral message', async () => {
  renderPage();

  expect(await screen.findByRole('grid', { name: `Practice heatmap ${YEAR}` })).toBeInTheDocument();
  expect(screen.getByText(`No practice logged in ${YEAR} yet.`)).toBeInTheDocument();
});

test('a failed load shows an error and no misleading grid', async () => {
  mockedService.getHeatmap.mockRejectedValue(new Error('Failed to fetch heatmap'));

  renderPage();

  expect(await screen.findByText('Heatmap could not be loaded.')).toBeInTheDocument();
  expect(screen.queryByRole('grid')).not.toBeInTheDocument();
});

test('arrow keys move the roving focus between day cells (NFR6)', async () => {
  renderPage();

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

test('clicking an active day opens its detail with sessions, entries and an Edit link (FR16/AC4)', async () => {
  mockedService.getHeatmap.mockResolvedValue([
    { date: `${YEAR}-03-10`, totalMinutes: 40, sessionCount: 1 },
  ]);
  mockedService.getAll.mockResolvedValue([
    {
      uid: 's1', date: `${YEAR}-03-10`, instrumentType: 'Bass', durationMinutes: 40, note: 'solid run',
      items: [{ uid: 'i1', sessionUid: 's1', label: 'Sweet Child', minutes: 15, note: 'at 30 BPM' }],
    },
  ]);

  renderPage();
  fireEvent.click(await screen.findByLabelText(`${YEAR}-03-10 — 40 minutes, 1 session`));

  expect(mockedService.getAll).toHaveBeenCalledWith(`${YEAR}-03-10`);
  const panel = await screen.findByRole('list', { name: 'Day sessions' });
  expect(within(panel).getByText('Bass')).toBeInTheDocument();
  expect(within(panel).getByText('40 min')).toBeInTheDocument();
  expect(within(panel).getByText('solid run')).toBeInTheDocument();
  expect(within(panel).getByText(/Sweet Child/)).toBeInTheDocument();
  expect(within(panel).getByText(/at 30 BPM/)).toBeInTheDocument();

  const editLink = within(panel).getByRole('link', { name: `Edit session of ${YEAR}-03-10` });
  expect(editLink).toHaveAttribute('href', '/my-sessions?edit=s1');
});

test('Enter on the focused cell opens the day detail (FR16, keyboard)', async () => {
  renderPage();

  const grid = await screen.findByRole('grid', { name: `Practice heatmap ${YEAR}` });
  const firstCell = screen.getByLabelText(`${YEAR}-01-01 — no practice`);
  act(() => firstCell.focus());
  fireEvent.keyDown(grid, { key: 'Enter' });

  expect(await screen.findByText(`No practice on ${YEAR}-01-01.`)).toBeInTheDocument();
});

test('Space on the focused cell opens the day detail (APG activation)', async () => {
  renderPage();

  const grid = await screen.findByRole('grid', { name: `Practice heatmap ${YEAR}` });
  const firstCell = screen.getByLabelText(`${YEAR}-01-01 — no practice`);
  act(() => firstCell.focus());
  fireEvent.keyDown(grid, { key: ' ' });

  expect(await screen.findByText(`No practice on ${YEAR}-01-01.`)).toBeInTheDocument();
});

test('an empty day shows a neutral state with a pre-dated log link (FR18/AC5)', async () => {
  renderPage();

  // Today is always a valid (non-future) empty day whatever the run date
  fireEvent.click(await screen.findByLabelText(`${TODAY} — no practice (today)`));

  expect(await screen.findByText(`No practice on ${TODAY}.`)).toBeInTheDocument();
  const logLink = screen.getByRole('link', { name: 'Log a session for this day' });
  expect(logLink).toHaveAttribute('href', `/my-sessions?date=${TODAY}`);
});

// Dec 31 is a strictly future day unless the suite runs on Dec 31 itself
const FUTURE_DAY = `${YEAR}-12-31`;
(TODAY === FUTURE_DAY ? test.skip : test)('a future empty day offers no dead-end log link', async () => {
  renderPage();

  fireEvent.click(await screen.findByLabelText(`${FUTURE_DAY} — no practice`));

  expect(await screen.findByText(`No practice on ${FUTURE_DAY}.`)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Log a session for this day' })).not.toBeInTheDocument();
});

test('activating the selected day again closes the panel (mouse and keyboard)', async () => {
  renderPage();

  // Mouse toggle
  const cell = await screen.findByLabelText(`${YEAR}-02-15 — no practice`);
  fireEvent.click(cell);
  expect(await screen.findByText(`No practice on ${YEAR}-02-15.`)).toBeInTheDocument();
  fireEvent.click(cell);
  expect(screen.queryByText(`No practice on ${YEAR}-02-15.`)).not.toBeInTheDocument();

  // Keyboard toggle (Enter twice on the same focused cell)
  const grid = screen.getByRole('grid', { name: `Practice heatmap ${YEAR}` });
  act(() => cell.focus());
  fireEvent.keyDown(grid, { key: 'Enter' });
  expect(await screen.findByText(`No practice on ${YEAR}-02-15.`)).toBeInTheDocument();
  fireEvent.keyDown(grid, { key: 'Enter' });
  expect(screen.queryByText(`No practice on ${YEAR}-02-15.`)).not.toBeInTheDocument();
});

test('year navigation reloads the grid and resets the selection (FR17)', async () => {
  renderPage();

  fireEvent.click(await screen.findByLabelText(`${YEAR}-02-15 — no practice`));
  await screen.findByText(`No practice on ${YEAR}-02-15.`);

  fireEvent.click(screen.getByRole('button', { name: 'Previous year' }));

  expect(await screen.findByRole('grid', { name: `Practice heatmap ${YEAR - 1}` })).toBeInTheDocument();
  expect(mockedService.getHeatmap).toHaveBeenLastCalledWith(YEAR - 1);
  expect(screen.queryByText(`No practice on ${YEAR}-02-15.`)).not.toBeInTheDocument();

  // Back to the current year — Next is then disabled (no future sessions)
  fireEvent.click(screen.getByRole('button', { name: 'Next year' }));
  expect(await screen.findByRole('grid', { name: `Practice heatmap ${YEAR}` })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next year' })).toBeDisabled();
});

test('deleting a session from the day detail confirms, removes it and refreshes the grid', async () => {
  mockedService.getHeatmap.mockResolvedValue([
    { date: `${YEAR}-03-10`, totalMinutes: 40, sessionCount: 1 },
  ]);
  mockedService.getAll.mockResolvedValue([
    { uid: 's1', date: `${YEAR}-03-10`, instrumentType: 'Bass', durationMinutes: 40, items: [] },
  ]);
  mockedService.remove.mockResolvedValue(undefined);

  renderPage();
  fireEvent.click(await screen.findByLabelText(`${YEAR}-03-10 — 40 minutes, 1 session`));
  fireEvent.click(await screen.findByRole('button', { name: `Delete session of ${YEAR}-03-10` }));

  expect(screen.getByText(`Are you sure you want to delete the session of ${YEAR}-03-10 (Bass)?`)).toBeInTheDocument();
  const heatmapCallsBefore = mockedService.getHeatmap.mock.calls.length;
  fireEvent.click(screen.getByText('Delete', { selector: 'div[role="dialog"] button' }));

  // Dialog closed before the request (house pattern), session gone, grid refetched
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => {
    expect(mockedService.remove).toHaveBeenCalledWith('s1');
  });
  expect(await screen.findByText(`No practice on ${YEAR}-03-10.`)).toBeInTheDocument();
  await waitFor(() => {
    expect(mockedService.getHeatmap.mock.calls.length).toBeGreaterThan(heatmapCallsBefore);
  });
});

test('deleting a session refreshes the Played list (its cascaded plays disappear without a reload)', async () => {
  mockedService.getHeatmap.mockResolvedValue([
    { date: `${YEAR}-03-10`, totalMinutes: 0, sessionCount: 1, playCount: 1 },
  ]);
  mockedService.getAll.mockResolvedValue([
    {
      uid: 's1', date: `${YEAR}-03-10`, instrumentType: 'Guitar', durationMinutes: null,
      items: [{ uid: 'i1', sessionUid: 's1', songUid: 'song-1', label: 'Sweet Child', minutes: null }],
    },
  ]);
  // A play on a DIFFERENT instrument is shown under Played (not deduped);
  // after the session delete cascades... here we model that the day has no
  // plays left, so the Played block must vanish without a reload
  mockedService.getDayPlays
    .mockResolvedValueOnce([
      { uid: 'p1', songUid: 'song-2', title: 'Money', instrumentType: 'Bass', playedAt: `${YEAR}-03-10T12:00:00.000Z` },
    ])
    .mockResolvedValue([]); // the refetch after delete: cascade emptied the day
  mockedService.remove.mockResolvedValue(undefined);

  renderPage();
  fireEvent.click(await screen.findByLabelText(`${YEAR}-03-10 — 0 minutes, 1 session, 1 play`));
  // The Played block is there before the delete
  expect(await screen.findByText('Money')).toBeInTheDocument();

  fireEvent.click(await screen.findByRole('button', { name: `Delete session of ${YEAR}-03-10` }));
  fireEvent.click(screen.getByText('Delete', { selector: 'div[role="dialog"] button' }));

  // After the delete, the Played list is refetched and reflects the cascade —
  // no manual reload needed
  await waitFor(() => {
    expect(mockedService.getDayPlays).toHaveBeenCalledTimes(2);
  });
  await waitFor(() => {
    expect(screen.queryByText('Money')).not.toBeInTheDocument();
  });
});

test('cancelling the day-detail delete keeps the session', async () => {
  mockedService.getAll.mockResolvedValue([
    { uid: 's1', date: `${YEAR}-02-15`, instrumentType: 'Bass', items: [] },
  ]);

  renderPage();
  fireEvent.click(await screen.findByLabelText(`${YEAR}-02-15 — no practice`));
  fireEvent.click(await screen.findByRole('button', { name: `Delete session of ${YEAR}-02-15` }));
  fireEvent.click(screen.getByText('Cancel', { selector: 'div[role="dialog"] button' }));

  expect(mockedService.remove).not.toHaveBeenCalled();
  expect(within(screen.getByRole('list', { name: 'Day sessions' })).getByText('Bass')).toBeInTheDocument();
});

test('a failed deletion shows an error and keeps the session listed', async () => {
  mockedService.getHeatmap.mockResolvedValue([
    { date: `${YEAR}-03-10`, totalMinutes: 40, sessionCount: 1 },
  ]);
  mockedService.getAll.mockResolvedValue([
    { uid: 's1', date: `${YEAR}-03-10`, instrumentType: 'Bass', durationMinutes: 40, items: [] },
  ]);
  mockedService.remove.mockRejectedValue(new Error('Failed to delete session'));

  renderPage();
  fireEvent.click(await screen.findByLabelText(`${YEAR}-03-10 — 40 minutes, 1 session`));
  fireEvent.click(await screen.findByRole('button', { name: `Delete session of ${YEAR}-03-10` }));
  fireEvent.click(screen.getByText('Delete', { selector: 'div[role="dialog"] button' }));

  expect(await screen.findByText('Session could not be deleted.')).toBeInTheDocument();
  // The session is NOT removed from the panel on failure
  expect(within(screen.getByRole('list', { name: 'Day sessions' })).getByText('Bass')).toBeInTheDocument();
});

test('a failed day detail shows an error, not misleading content', async () => {
  mockedService.getAll.mockRejectedValue(new Error('Failed to fetch sessions'));

  renderPage();
  fireEvent.click(await screen.findByLabelText(`${YEAR}-02-15 — no practice`));

  expect(await screen.findByText('Day detail could not be loaded.')).toBeInTheDocument();
  expect(screen.queryByText(`No practice on ${YEAR}-02-15.`)).not.toBeInTheDocument();
});

test('a play-only day lights up with a played label and lists its plays (FR22/AC1/AC4)', async () => {
  mockedService.getHeatmap.mockResolvedValue([
    { date: `${YEAR}-02-15`, totalMinutes: 0, sessionCount: 0, playCount: 2 },
  ]);
  mockedService.getDayPlays.mockResolvedValue([
    { uid: 'p1', songUid: 'song-1', title: 'Sweet Child', instrumentType: 'Guitar', playedAt: `${YEAR}-02-15T09:00:00.000Z` },
    { uid: 'p2', songUid: 'song-2', title: 'Money', instrumentType: null, playedAt: `${YEAR}-02-15T20:00:00.000Z` },
  ]);

  renderPage();
  fireEvent.click(await screen.findByLabelText(`${YEAR}-02-15 — played (2 plays)`));

  expect(mockedService.getDayPlays).toHaveBeenCalledWith(`${YEAR}-02-15`);
  const plays = await screen.findByRole('list', { name: 'Day plays' });
  expect(within(plays).getByText('Sweet Child')).toBeInTheDocument();
  expect(within(plays).getByText('Money')).toBeInTheDocument();
  expect(within(plays).getByText(/Guitar/)).toBeInTheDocument();
  // Plays are presence, not sessions: marked "Played", no duration, no actions
  expect(within(plays).getAllByText(/Played/)).toHaveLength(2);
  expect(within(plays).queryByText(/min/)).not.toBeInTheDocument();
  expect(within(plays).queryByRole('button')).not.toBeInTheDocument();
  expect(within(plays).queryByRole('link')).not.toBeInTheDocument();
  // Not an empty day — and logging a real session remains offered
  expect(screen.queryByText(`No practice on ${YEAR}-02-15.`)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Log a session for this day' })).toBeInTheDocument();
});

test('a mixed day shows sessions AND plays, with both in the cell label (FR22/AC2)', async () => {
  mockedService.getHeatmap.mockResolvedValue([
    { date: `${YEAR}-03-10`, totalMinutes: 40, sessionCount: 1, playCount: 1 },
  ]);
  mockedService.getAll.mockResolvedValue([
    { uid: 's1', date: `${YEAR}-03-10`, instrumentType: 'Bass', durationMinutes: 40, items: [] },
  ]);
  mockedService.getDayPlays.mockResolvedValue([
    { uid: 'p1', songUid: 'song-1', title: 'Money', instrumentType: null, playedAt: `${YEAR}-03-10T09:00:00.000Z` },
  ]);

  renderPage();
  fireEvent.click(await screen.findByLabelText(`${YEAR}-03-10 — 40 minutes, 1 session, 1 play`));

  const sessions = await screen.findByRole('list', { name: 'Day sessions' });
  expect(within(sessions).getByText('Bass')).toBeInTheDocument();
  const plays = await screen.findByRole('list', { name: 'Day plays' });
  expect(within(plays).getByText('Money')).toBeInTheDocument();
  // A day with a real session does not offer the empty-day log link
  expect(screen.queryByRole('link', { name: 'Log a session for this day' })).not.toBeInTheDocument();
});

test('a failed plays fetch keeps the sessions and says so (partial failure)', async () => {
  mockedService.getAll.mockResolvedValue([
    { uid: 's1', date: `${YEAR}-03-10`, instrumentType: 'Bass', durationMinutes: 40, items: [] },
  ]);
  mockedService.getDayPlays.mockRejectedValue(new Error('Failed to fetch plays'));

  renderPage();
  fireEvent.click(await screen.findByLabelText(`${YEAR}-03-10 — no practice`));

  expect(await screen.findByText('Plays could not be loaded.')).toBeInTheDocument();
  expect(within(screen.getByRole('list', { name: 'Day sessions' })).getByText('Bass')).toBeInTheDocument();
});

test('a song shown as a session entry is not also re-listed under Played (4.1 dedup)', async () => {
  mockedService.getHeatmap.mockResolvedValue([
    { date: `${YEAR}-03-10`, totalMinutes: 0, sessionCount: 1, playCount: 1 },
  ]);
  mockedService.getAll.mockResolvedValue([
    {
      uid: 's1', date: `${YEAR}-03-10`, instrumentType: 'Guitar', durationMinutes: null,
      items: [{ uid: 'i1', sessionUid: 's1', songUid: 'song-1', label: 'Sweet Child', minutes: null }],
    },
  ]);
  // Three plays that day: (p1) the song already in the GUITAR session → hidden;
  // (p2) a different song on Bass → shown; (p3) the SAME song but on BASS, which
  // the session does not cover → must still show (instrument-aware dedup)
  mockedService.getDayPlays.mockResolvedValue([
    { uid: 'p1', songUid: 'song-1', title: 'Sweet Child', instrumentType: 'Guitar', playedAt: `${YEAR}-03-10T12:00:00.000Z` },
    { uid: 'p2', songUid: 'song-2', title: 'Money', instrumentType: 'Bass', playedAt: `${YEAR}-03-10T12:00:00.000Z` },
    { uid: 'p3', songUid: 'song-1', title: 'Sweet Child', instrumentType: 'Bass', playedAt: `${YEAR}-03-10T13:00:00.000Z` },
  ]);

  renderPage();
  fireEvent.click(await screen.findByLabelText(`${YEAR}-03-10 — 0 minutes, 1 session, 1 play`));

  // The Guitar session entry shows Sweet Child; the Guitar play must not repeat
  // it, but the Bass play of the same song is genuine history and stays
  await screen.findByRole('list', { name: 'Day sessions' });
  const plays = await screen.findByRole('list', { name: 'Day plays' });
  expect(within(plays).getByText('Money')).toBeInTheDocument();
  // Sweet Child appears once under Played — the Bass play, not the Guitar one
  expect(within(plays).getAllByText('Sweet Child')).toHaveLength(1);
  // Two Bass plays survive (Money + the Bass Sweet Child); the Guitar play is gone
  expect(within(plays).getAllByText(/Bass/)).toHaveLength(2);
});

test('a failed sessions fetch keeps the loaded plays and says so (the other partial failure)', async () => {
  mockedService.getAll.mockRejectedValue(new Error('Failed to fetch sessions'));
  mockedService.getDayPlays.mockResolvedValue([
    { uid: 'p1', songUid: 'song-1', title: 'Money', instrumentType: null, playedAt: `${YEAR}-03-10T09:00:00.000Z` },
  ]);

  renderPage();
  fireEvent.click(await screen.findByLabelText(`${YEAR}-03-10 — no practice`));

  expect(await screen.findByText('Sessions could not be loaded.')).toBeInTheDocument();
  expect(within(screen.getByRole('list', { name: 'Day plays' })).getByText('Money')).toBeInTheDocument();
});

test('a slow plays response for a previous day never paints the newly selected day', async () => {
  let resolveSlowPlays!: (plays: { uid: string; songUid: string; title: string; instrumentType: null; playedAt: string }[]) => void;
  // Day A's plays hang; day B's resolve instantly
  mockedService.getDayPlays
    .mockImplementationOnce(() => new Promise(resolve => { resolveSlowPlays = resolve; }))
    .mockResolvedValue([]);

  renderPage();
  fireEvent.click(await screen.findByLabelText(`${YEAR}-02-15 — no practice`));
  fireEvent.click(screen.getByLabelText(`${YEAR}-02-16 — no practice`));
  expect(await screen.findByText(`No practice on ${YEAR}-02-16.`)).toBeInTheDocument();

  // Day A's plays land AFTER day B was selected — they must be dropped
  await act(async () => {
    resolveSlowPlays([
      { uid: 'p1', songUid: 'song-1', title: 'Ghost Song', instrumentType: null, playedAt: `${YEAR}-02-15T09:00:00.000Z` },
    ]);
  });
  expect(screen.queryByText('Ghost Song')).not.toBeInTheDocument();
  expect(screen.getByText(`No practice on ${YEAR}-02-16.`)).toBeInTheDocument();
});
