import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import MySessionsPage from '../pages/MySessionsPage';
import { practiceSessionService, type PracticeSession } from '../services/practiceSessionService';

jest.mock('../services/practiceSessionService', () => ({
  practiceSessionService: {
    create: jest.fn(),
    getAll: jest.fn(),
  },
}));

jest.mock('../services/songService', () => ({
  songService: {
    getAllSongs: jest.fn(),
  },
}));

jest.mock('../services/topicService', () => ({
  topicService: {
    getAll: jest.fn(),
  },
}));

import { songService } from '../services/songService';
import { topicService } from '../services/topicService';

const mockedService = practiceSessionService as jest.Mocked<typeof practiceSessionService>;
const mockedSongService = songService as jest.Mocked<typeof songService>;
const mockedTopicService = topicService as jest.Mocked<typeof topicService>;

const SONG_UID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TOPIC_UID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// Same local-date logic as the page (FR19: local day, not UTC)
function todayLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedSongService.getAllSongs.mockResolvedValue([
    { uid: SONG_UID, title: 'Sweet Child' } as never,
  ]);
  mockedTopicService.getAll.mockResolvedValue([
    { uid: TOPIC_UID, name: 'Pentatonic scale' },
  ]);
  mockedService.getAll.mockResolvedValue([]);
});

async function addEntry(index: number, ref: string, minutes?: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  const select = await screen.findByLabelText(`Entry ${index}`);
  // Wait for the async-loaded catalogs: changing a controlled <select> to a
  // value with no matching <option> silently falls back to ''
  await screen.findAllByRole('option', { name: 'Sweet Child' });
  fireEvent.change(select, { target: { value: ref } });
  if (minutes !== undefined) {
    fireEvent.change(screen.getByLabelText(`Entry ${index} minutes`), { target: { value: minutes } });
  }
}

test('renders a labelled form with today (local) pre-filled and future dates blocked', () => {
  render(<MySessionsPage />);

  const dateInput = screen.getByLabelText('Date');
  expect(dateInput).toHaveValue(todayLocalDate());
  expect(dateInput).toHaveAttribute('max', todayLocalDate());
  expect(screen.getByLabelText('Instrument')).toBeInTheDocument();
  expect(screen.getByLabelText('Duration')).toBeInTheDocument();
  expect(screen.getByLabelText('Note')).toBeInTheDocument();
});

test('submit is disabled until an instrument is selected', () => {
  render(<MySessionsPage />);

  const submit = screen.getByRole('button', { name: 'Log session' });
  expect(submit).toBeDisabled();

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  expect(submit).not.toBeDisabled();
});

test('submitting sends the payload and shows a confirmation toast', async () => {
  const created: PracticeSession = {
    uid: 's1',
    date: todayLocalDate(),
    instrumentType: 'Bass',
    durationMinutes: 40,
    note: 'bridge still rough',
  };
  mockedService.create.mockResolvedValue(created);

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '40' } });
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'bridge still rough' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  await waitFor(() => {
    expect(mockedService.create).toHaveBeenCalledWith({
      date: todayLocalDate(),
      instrumentType: 'Bass',
      durationMinutes: 40,
      note: 'bridge still rough',
    });
  });
  expect(await screen.findByText('Session logged')).toBeInTheDocument();
});

test('after success, duration and note reset but date and instrument are kept', async () => {
  mockedService.create.mockResolvedValue({ uid: 's1', date: todayLocalDate(), instrumentType: 'Bass' });

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '40' } });
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'quick run' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  await screen.findByText('Session logged');

  expect(screen.getByLabelText('Duration')).toHaveValue(null);
  expect(screen.getByLabelText('Note')).toHaveValue('');
  expect(screen.getByLabelText('Date')).toHaveValue(todayLocalDate());
  expect(screen.getByLabelText('Instrument')).toHaveValue('Bass');
});

test('a session without duration or note is valid (only date + instrument required)', async () => {
  mockedService.create.mockResolvedValue({ uid: 's1', date: todayLocalDate(), instrumentType: 'Guitar' });

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Guitar' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  await waitFor(() => {
    expect(mockedService.create).toHaveBeenCalledWith({
      date: todayLocalDate(),
      instrumentType: 'Guitar',
      durationMinutes: undefined,
      note: undefined,
    });
  });
});

test('shows an error banner when creation fails', async () => {
  mockedService.create.mockRejectedValue(new Error('Failed to create session'));

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  expect(await screen.findByText('Failed to log session')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

test('surfaces specific server validation messages (e.g. clock-skewed client)', async () => {
  mockedService.create.mockRejectedValue(new Error('Date cannot be in the future'));

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  expect(await screen.findByText('Date cannot be in the future')).toBeInTheDocument();
});

test('blocks future dates client-side without calling the API', async () => {
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: tomorrow } });
  // Bypass native constraint validation (max attr): the JS guard is the
  // backstop for platforms where the browser does not enforce it
  fireEvent.submit(screen.getByLabelText('Date').closest('form')!);

  expect(await screen.findByText('Date cannot be in the future')).toBeInTheDocument();
  expect(mockedService.create).not.toHaveBeenCalled();
});

test('typed duration "0" is sent to the server, not silently dropped', async () => {
  mockedService.create.mockRejectedValue(new Error('Duration must be a whole number of minutes between 1 and 1440'));

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '0' } });
  // Bypass native min={1} validation to exercise the JS path
  fireEvent.submit(screen.getByLabelText('Duration').closest('form')!);

  await waitFor(() => {
    expect(mockedService.create).toHaveBeenCalledWith(
      expect.objectContaining({ durationMinutes: 0 })
    );
  });
  expect(await screen.findByText('Duration must be a whole number of minutes between 1 and 1440')).toBeInTheDocument();
});

test('the toast live region is mounted before any submission', () => {
  render(<MySessionsPage />);

  const toast = screen.getByRole('status', { name: 'Notification' });
  expect(toast).toBeInTheDocument();
  expect(toast).toBeEmptyDOMElement();
});

test('Add entry shows a picker with Songs and Topics optgroups', async () => {
  render(<MySessionsPage />);

  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));

  const select = await screen.findByLabelText('Entry 1');
  expect(select).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Songs' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Topics' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Sweet Child' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Pentatonic scale' })).toBeInTheDocument();
});

test('submitting with entries sends decoded song/topic items', async () => {
  mockedService.create.mockResolvedValue({ uid: 's1', date: todayLocalDate(), instrumentType: 'Bass' });

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  await addEntry(1, `song:${SONG_UID}`, '15');
  fireEvent.change(screen.getByLabelText('Entry 1 note'), { target: { value: 'at 30 BPM' } });
  await addEntry(2, `topic:${TOPIC_UID}`, '25');
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  await waitFor(() => {
    expect(mockedService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          { songUid: SONG_UID, minutes: 15, note: 'at 30 BPM' },
          { topicUid: TOPIC_UID, minutes: 25, note: undefined },
        ],
      })
    );
  });
});

test('FR13: duration auto-fills with the sum when every entry has minutes', async () => {
  render(<MySessionsPage />);

  await addEntry(1, `song:${SONG_UID}`, '15');
  await addEntry(2, `topic:${TOPIC_UID}`, '25');

  expect(screen.getByLabelText('Duration')).toHaveValue(40);
});

test('FR13: a manual duration override wins over the auto-sum', async () => {
  mockedService.create.mockResolvedValue({ uid: 's1', date: todayLocalDate(), instrumentType: 'Bass' });

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  await addEntry(1, `song:${SONG_UID}`, '15');
  fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '50' } });
  await addEntry(2, `topic:${TOPIC_UID}`, '25');

  expect(screen.getByLabelText('Duration')).toHaveValue(50);

  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));
  await waitFor(() => {
    expect(mockedService.create).toHaveBeenCalledWith(
      expect.objectContaining({ durationMinutes: 50 })
    );
  });
});

test('FR13: no auto-sum when an entry has no minutes', async () => {
  render(<MySessionsPage />);

  await addEntry(1, `song:${SONG_UID}`, '15');
  await addEntry(2, `topic:${TOPIC_UID}`);

  expect(screen.getByLabelText('Duration')).toHaveValue(null);
});

test('Remove entry deletes the row', async () => {
  render(<MySessionsPage />);

  await addEntry(1, `song:${SONG_UID}`);
  fireEvent.click(screen.getByRole('button', { name: 'Remove entry 1' }));

  expect(screen.queryByLabelText('Entry 1')).not.toBeInTheDocument();
});

test('an entry row without a song/topic blocks submission instead of being dropped', async () => {
  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  fireEvent.change(await screen.findByLabelText('Entry 1 minutes'), { target: { value: '30' } });
  fireEvent.submit(screen.getByLabelText('Date').closest('form')!);

  expect(await screen.findByText('Each entry needs a song or topic — fill or remove empty entries')).toBeInTheDocument();
  expect(mockedService.create).not.toHaveBeenCalled();
});

test('FR13: an auto-sum beyond 1440 is never auto-applied', async () => {
  render(<MySessionsPage />);

  await addEntry(1, `song:${SONG_UID}`, '800');
  await addEntry(2, `topic:${TOPIC_UID}`, '800');

  expect(screen.getByLabelText('Duration')).toHaveValue(null);
});

test('FR13: clearing a manual override re-arms the auto-sum', async () => {
  render(<MySessionsPage />);

  await addEntry(1, `song:${SONG_UID}`, '15');
  await addEntry(2, `topic:${TOPIC_UID}`, '25');
  fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '50' } });
  expect(screen.getByLabelText('Duration')).toHaveValue(50);

  fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '' } });
  expect(screen.getByLabelText('Duration')).toHaveValue(40);
});

test('the history lists sessions with date, instrument, duration, notes and entries', async () => {
  mockedService.getAll.mockResolvedValue([
    {
      uid: 's1',
      date: '2026-06-05',
      instrumentType: 'Bass',
      durationMinutes: 40,
      note: 'great session',
      items: [
        { uid: 'i1', sessionUid: 's1', label: 'Sweet Child', minutes: 15, note: 'at 30 BPM' },
        { uid: 'i2', sessionUid: 's1', label: 'Pentatonic scale', minutes: 25 },
      ],
    },
  ]);

  render(<MySessionsPage />);

  const history = await screen.findByRole('list', { name: 'Session history' });
  expect(within(history).getByText('2026-06-05')).toBeInTheDocument();
  expect(within(history).getByText('Bass')).toBeInTheDocument();
  expect(within(history).getByText('40 min')).toBeInTheDocument();
  expect(within(history).getByText('great session')).toBeInTheDocument();
  expect(within(history).getByText(/Sweet Child/)).toBeInTheDocument();
  expect(within(history).getByText(/15 min/)).toBeInTheDocument();
  expect(within(history).getByText(/at 30 BPM/)).toBeInTheDocument();
  expect(within(history).getByText(/Pentatonic scale/)).toBeInTheDocument();
});

test('shows the empty history state', async () => {
  render(<MySessionsPage />);

  expect(await screen.findByText('No sessions logged yet.')).toBeInTheDocument();
});

test('a failed history load does not pretend the history is empty', async () => {
  mockedService.getAll.mockRejectedValue(new Error('Failed to fetch sessions'));

  render(<MySessionsPage />);

  expect(await screen.findByText('Sessions could not be loaded.')).toBeInTheDocument();
  expect(screen.queryByText('No sessions logged yet.')).not.toBeInTheDocument();
});

test('a newly logged session appears in the history', async () => {
  mockedService.create.mockResolvedValue({
    uid: 's-new',
    date: todayLocalDate(),
    instrumentType: 'Bass',
    items: [{ uid: 'i1', sessionUid: 's-new', label: 'Sweet Child' }],
  });

  render(<MySessionsPage />);
  await screen.findByText('No sessions logged yet.');

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  expect(await screen.findByText(todayLocalDate())).toBeInTheDocument();
  expect(screen.getByText(/Sweet Child/)).toBeInTheDocument();
  expect(screen.queryByText('No sessions logged yet.')).not.toBeInTheDocument();
});

test('a retroactive session is inserted at its chronological place, not on top', async () => {
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  mockedService.getAll.mockResolvedValue([
    { uid: 's-today', date: todayLocalDate(), instrumentType: 'Guitar', items: [] },
  ]);
  mockedService.create.mockResolvedValue({
    uid: 's-old', date: yesterday, instrumentType: 'Bass', items: [],
  });

  render(<MySessionsPage />);
  await screen.findByText(todayLocalDate());

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: yesterday } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  const history = await screen.findByRole('list', { name: 'Session history' });
  await screen.findByText(yesterday);
  const text = history.textContent || '';
  expect(text.indexOf(todayLocalDate())).toBeGreaterThanOrEqual(0);
  expect(text.indexOf(yesterday)).toBeGreaterThan(text.indexOf(todayLocalDate()));
});

test('a slow initial history load does not clobber a session logged meanwhile', async () => {
  let resolveGetAll!: (value: never[]) => void;
  mockedService.getAll.mockReturnValue(new Promise(resolve => { resolveGetAll = resolve; }));
  mockedService.create.mockResolvedValue({
    uid: 's-new', date: todayLocalDate(), instrumentType: 'Bass', items: [],
  });

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));
  await screen.findByText(todayLocalDate());

  // The stale GET (computed before the create) finally lands
  resolveGetAll([]);
  await waitFor(() => {
    expect(screen.getByText(todayLocalDate())).toBeInTheDocument();
  });
});

test('a successful create recovers the history from a failed initial load', async () => {
  mockedService.getAll.mockRejectedValue(new Error('Failed to fetch sessions'));
  mockedService.create.mockResolvedValue({
    uid: 's-new', date: todayLocalDate(), instrumentType: 'Bass', items: [],
  });

  render(<MySessionsPage />);
  await screen.findByText('Sessions could not be loaded.');

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  expect(await screen.findByText(todayLocalDate())).toBeInTheDocument();
  expect(screen.queryByText('Sessions could not be loaded.')).not.toBeInTheDocument();
});

test('the initial history is sorted locally even if the server order regresses', async () => {
  mockedService.getAll.mockResolvedValue([
    { uid: 's-old', date: '2026-06-01', instrumentType: 'Bass', items: [] },
    { uid: 's-recent', date: '2026-06-05', instrumentType: 'Guitar', items: [] },
  ]);

  render(<MySessionsPage />);

  const history = await screen.findByRole('list', { name: 'Session history' });
  const text = history.textContent || '';
  expect(text.indexOf('2026-06-05')).toBeLessThan(text.indexOf('2026-06-01'));
});

test('a same-day session created without createdAt sorts as the newest of its day', async () => {
  mockedService.getAll.mockResolvedValue([
    { uid: 's-morning', date: todayLocalDate(), instrumentType: 'Guitar', note: 'morning run', createdAt: '2026-06-07T08:00:00Z', items: [] },
  ]);
  mockedService.create.mockResolvedValue({
    uid: 's-fresh', date: todayLocalDate(), instrumentType: 'Bass', note: 'fresh run', items: [],
  });

  render(<MySessionsPage />);
  await screen.findByText('morning run');

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  const history = await screen.findByRole('list', { name: 'Session history' });
  await screen.findByText('fresh run');
  const text = history.textContent || '';
  expect(text.indexOf('fresh run')).toBeLessThan(text.indexOf('morning run'));
});

test('a session with zero entries stays valid (no items in payload)', async () => {
  mockedService.create.mockResolvedValue({ uid: 's1', date: todayLocalDate(), instrumentType: 'Guitar' });

  render(<MySessionsPage />);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Guitar' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  await waitFor(() => {
    expect(mockedService.create).toHaveBeenCalledWith(
      expect.objectContaining({ items: undefined })
    );
  });
});
