import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import MySessionsPage from '../pages/MySessionsPage';
import { digitsOnly } from '../utils/digitsOnly';
import { practiceSessionService, type PracticeSession } from '../services/practiceSessionService';

jest.mock('../services/practiceSessionService', () => ({
  practiceSessionService: {
    create: jest.fn(),
    getAll: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
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

const ITEM_UID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function editableSession() {
  return {
    uid: 's-edit',
    date: '2026-06-05',
    instrumentType: 'Bass',
    durationMinutes: 40,
    note: 'old note',
    items: [
      { uid: ITEM_UID, sessionUid: 's-edit', songUid: SONG_UID, topicUid: null, label: 'Sweet Child', minutes: 15, note: 'at 30 BPM' },
    ],
  };
}

test('Edit populates the form, shows the banner, and Save sends a diff-by-uid payload', async () => {
  mockedService.getAll.mockResolvedValue([editableSession()]);
  mockedService.update.mockResolvedValue({ ...editableSession(), note: 'new note' });

  render(<MySessionsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));

  expect(screen.getByText('Editing session of 2026-06-05')).toBeInTheDocument();
  expect(screen.getByLabelText('Date')).toHaveValue('2026-06-05');
  expect(screen.getByLabelText('Instrument')).toHaveValue('Bass');
  expect(screen.getByLabelText('Duration')).toHaveValue(40);
  expect(screen.getByLabelText('Note')).toHaveValue('old note');
  expect(screen.getByLabelText('Entry 1')).toHaveValue(`song:${SONG_UID}`);
  expect(screen.getByLabelText('Entry 1 minutes')).toHaveValue(15);

  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'new note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save session' }));

  await waitFor(() => {
    expect(mockedService.update).toHaveBeenCalledWith('s-edit', {
      date: '2026-06-05',
      instrumentType: 'Bass',
      durationMinutes: 40,
      note: 'new note',
      items: [{ uid: ITEM_UID, songUid: SONG_UID, minutes: 15, note: 'at 30 BPM' }],
    });
  });
  expect(await screen.findByText('Session updated')).toBeInTheDocument();
  expect(screen.queryByText('Editing session of 2026-06-05')).not.toBeInTheDocument();
});

test('Cancel edit restores a blank form without calling the API', async () => {
  mockedService.getAll.mockResolvedValue([editableSession()]);

  render(<MySessionsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));

  expect(mockedService.update).not.toHaveBeenCalled();
  expect(screen.queryByText('Editing session of 2026-06-05')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Date')).toHaveValue(todayLocalDate());
  expect(screen.getByLabelText('Instrument')).toHaveValue('');
  expect(screen.queryByLabelText('Entry 1')).not.toBeInTheDocument();
});

test('an orphan entry shows Keep "label" and is sent back without a ref (FR4)', async () => {
  const orphanSession = {
    ...editableSession(),
    items: [{ uid: ITEM_UID, sessionUid: 's-edit', songUid: null, topicUid: null, label: 'Ghost topic', minutes: 10, note: null }],
  };
  mockedService.getAll.mockResolvedValue([orphanSession]);
  mockedService.update.mockResolvedValue(orphanSession);

  render(<MySessionsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));

  expect(screen.getByRole('option', { name: 'Keep "Ghost topic"' })).toBeInTheDocument();
  expect(screen.getByLabelText('Entry 1')).toHaveValue('');

  fireEvent.click(screen.getByRole('button', { name: 'Save session' }));

  await waitFor(() => {
    expect(mockedService.update).toHaveBeenCalledWith('s-edit', expect.objectContaining({
      items: [{ uid: ITEM_UID, minutes: 10, note: undefined }],
    }));
  });
});

test('reclassifying an orphan entry sends the new topic ref (FR4)', async () => {
  const orphanSession = {
    ...editableSession(),
    items: [{ uid: ITEM_UID, sessionUid: 's-edit', songUid: null, topicUid: null, label: 'Ghost topic', minutes: 10, note: null }],
  };
  mockedService.getAll.mockResolvedValue([orphanSession]);
  mockedService.update.mockResolvedValue(orphanSession);

  render(<MySessionsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));
  await screen.findAllByRole('option', { name: 'Pentatonic scale' });
  fireEvent.change(screen.getByLabelText('Entry 1'), { target: { value: `topic:${TOPIC_UID}` } });
  fireEvent.click(screen.getByRole('button', { name: 'Save session' }));

  await waitFor(() => {
    expect(mockedService.update).toHaveBeenCalledWith('s-edit', expect.objectContaining({
      items: [{ uid: ITEM_UID, topicUid: TOPIC_UID, minutes: 10, note: undefined }],
    }));
  });
});

test('removing an entry in edit mode omits it from the payload', async () => {
  mockedService.getAll.mockResolvedValue([editableSession()]);
  mockedService.update.mockResolvedValue(editableSession());

  render(<MySessionsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove entry 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save session' }));

  await waitFor(() => {
    expect(mockedService.update).toHaveBeenCalledWith('s-edit', expect.objectContaining({ items: [] }));
  });
});

test('FR13 in edit mode: the existing duration is not overwritten by the auto-sum', async () => {
  mockedService.getAll.mockResolvedValue([editableSession()]);

  render(<MySessionsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));

  // The single entry has 15 min; the session duration is 40 — it must stay 40
  expect(screen.getByLabelText('Duration')).toHaveValue(40);
});

test('FR13 in edit mode: a duration-less session does not get the auto-sum assigned', async () => {
  mockedService.getAll.mockResolvedValue([{ ...editableSession(), durationMinutes: null }]);
  mockedService.update.mockResolvedValue({ ...editableSession(), durationMinutes: null });

  render(<MySessionsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));

  // The entry has 15 min but the session deliberately has no duration
  expect(screen.getByLabelText('Duration')).toHaveValue(null);

  fireEvent.click(screen.getByRole('button', { name: 'Save session' }));
  await waitFor(() => {
    expect(mockedService.update).toHaveBeenCalledWith('s-edit', expect.objectContaining({ durationMinutes: null }));
  });
});

test('FR13 in edit mode: clearing the duration persists "no duration"', async () => {
  mockedService.getAll.mockResolvedValue([editableSession()]);
  mockedService.update.mockResolvedValue(editableSession());

  render(<MySessionsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));
  fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '' } });

  expect(screen.getByLabelText('Duration')).toHaveValue(null);

  fireEvent.click(screen.getByRole('button', { name: 'Save session' }));
  await waitFor(() => {
    expect(mockedService.update).toHaveBeenCalledWith('s-edit', expect.objectContaining({ durationMinutes: null }));
  });
});

test('the Keep option is reserved for orphan entries', async () => {
  mockedService.getAll.mockResolvedValue([editableSession()]);

  render(<MySessionsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));

  // Non-orphan entry: no Keep option, and the placeholder is disabled
  expect(screen.queryByRole('option', { name: /^Keep/ })).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Select a song or topic' })).toBeDisabled();
});

test('entering edit mode moves focus to the Date field', async () => {
  mockedService.getAll.mockResolvedValue([editableSession()]);

  render(<MySessionsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));

  expect(screen.getByLabelText('Date')).toHaveFocus();
});

test('Delete session asks for confirmation naming the session, then removes it', async () => {
  mockedService.getAll.mockResolvedValue([editableSession()]);
  mockedService.remove.mockResolvedValue(undefined);

  render(<MySessionsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete session of 2026-06-05' }));

  expect(screen.getByText('Are you sure you want to delete the session of 2026-06-05 (Bass)?')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Delete', { selector: 'div[role="dialog"] button' }));

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => {
    expect(mockedService.remove).toHaveBeenCalledWith('s-edit');
  });
  expect(await screen.findByText('Session deleted')).toBeInTheDocument();
  expect(screen.queryByText('2026-06-05')).not.toBeInTheDocument();
});

test('cancelling the session delete dialog keeps the session', async () => {
  mockedService.getAll.mockResolvedValue([editableSession()]);

  render(<MySessionsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete session of 2026-06-05' }));
  fireEvent.click(screen.getByText('Cancel', { selector: 'div[role="dialog"] button' }));

  expect(mockedService.remove).not.toHaveBeenCalled();
  expect(screen.getByText('2026-06-05')).toBeInTheDocument();
});

test('FR12: the most recently logged instrument is pre-filled', async () => {
  mockedService.getAll.mockResolvedValue([
    // Higher in the date sort, but logged a while ago
    { uid: 's-retro', date: todayLocalDate(), instrumentType: 'Bass', createdAt: '2026-06-01T10:00:00Z', items: [] },
    // Lower in the date sort, but the most recent ENTRY (max createdAt)
    { uid: 's-recent', date: '2026-01-15', instrumentType: 'Guitar', createdAt: '2026-06-07T09:00:00Z', items: [] },
  ]);

  render(<MySessionsPage />);

  await waitFor(() => {
    expect(screen.getByLabelText('Instrument')).toHaveValue('Guitar');
  });
});

test('FR12: a manual instrument choice made before the data arrives is not overwritten', async () => {
  let resolveGetAll!: (value: never[]) => void;
  mockedService.getAll.mockReturnValue(new Promise(resolve => { resolveGetAll = resolve; }));

  render(<MySessionsPage />);
  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Drums' } });

  resolveGetAll([
    { uid: 's1', date: todayLocalDate(), instrumentType: 'Guitar', createdAt: '2026-06-07T09:00:00Z', items: [] },
  ] as never);

  await screen.findByText(todayLocalDate());
  expect(screen.getByLabelText('Instrument')).toHaveValue('Drums');
});

test('FR12: recently logged songs and topics appear first, deduplicated, current names, deleted refs excluded', async () => {
  const DELETED_TOPIC = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  mockedService.getAll.mockResolvedValue([
    {
      uid: 's1', date: todayLocalDate(), instrumentType: 'Bass', createdAt: '2026-06-07T09:00:00Z',
      items: [
        { uid: 'i1', sessionUid: 's1', topicUid: TOPIC_UID, label: 'Old snapshot name', minutes: 10 },
        { uid: 'i2', sessionUid: 's1', songUid: SONG_UID, label: 'Sweet Child', minutes: 5 },
        // Deleted topic: not in the loaded catalog → must be excluded
        { uid: 'i3', sessionUid: 's1', topicUid: DELETED_TOPIC, label: 'Ghost topic', minutes: 5 },
        // Duplicate of i2 → deduplicated
        { uid: 'i4', sessionUid: 's1', songUid: SONG_UID, label: 'Sweet Child' },
      ],
    },
  ]);

  render(<MySessionsPage />);
  await screen.findAllByText(/Sweet Child/);
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));

  const select = await screen.findByLabelText('Entry 1');
  const recentGroup = within(select).getByRole('group', { name: 'Recent' });
  const recentOptions = within(recentGroup).getAllByRole('option');

  // Order of first occurrence, deduplicated, current catalog name (not the stale snapshot)
  expect(recentOptions.map(o => o.textContent)).toEqual(['Pentatonic scale', 'Sweet Child']);
  expect(within(recentGroup).queryByText('Ghost topic')).not.toBeInTheDocument();
  // Recent group is rendered before Songs/Topics groups
  const groups = within(select).getAllByRole('group');
  expect(groups[0]).toHaveAccessibleName('Recent');
});

test('FR12: instant search filters the picker options and clearing restores them', async () => {
  render(<MySessionsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  const select = await screen.findByLabelText('Entry 1');
  await screen.findAllByRole('option', { name: 'Sweet Child' });

  fireEvent.change(screen.getByLabelText('Entry 1 search'), { target: { value: 'penta' } });

  expect(within(select).getByRole('option', { name: 'Pentatonic scale' })).toBeInTheDocument();
  expect(within(select).queryByRole('option', { name: 'Sweet Child' })).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Entry 1 search'), { target: { value: '' } });
  expect(within(select).getByRole('option', { name: 'Sweet Child' })).toBeInTheDocument();
});

test('FR12: the selected option stays rendered even when filtered out', async () => {
  mockedService.create.mockResolvedValue({ uid: 's1', date: todayLocalDate(), instrumentType: 'Bass' });

  render(<MySessionsPage />);
  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  await addEntry(1, `song:${SONG_UID}`);

  // Filter that matches nothing the selection belongs to
  fireEvent.change(screen.getByLabelText('Entry 1 search'), { target: { value: 'penta' } });

  const select = screen.getByLabelText('Entry 1');
  expect(select).toHaveValue(`song:${SONG_UID}`);
  expect(within(select).getByRole('option', { name: 'Sweet Child' })).toBeInTheDocument();

  // And the submit still sends the right ref
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));
  await waitFor(() => {
    expect(mockedService.create).toHaveBeenCalledWith(
      expect.objectContaining({ items: [expect.objectContaining({ songUid: SONG_UID })] })
    );
  });
});

test('FR12: Recent is ordered by creation time, capped at 5', async () => {
  const topicUids = Array.from({ length: 6 }, (_, i) => `${i}aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`);
  mockedTopicService.getAll.mockResolvedValue(topicUids.map((uid, i) => ({ uid, name: `Topic ${i}` })));
  mockedService.getAll.mockResolvedValue([
    // Top of the DATE sort but logged long ago: its items must NOT outrank
    { uid: 's-old-log', date: todayLocalDate(), instrumentType: 'Bass', createdAt: '2026-06-01T10:00:00Z',
      items: [{ uid: 'iA', sessionUid: 's-old-log', topicUid: topicUids[5], label: 'Topic 5' }] },
    // Logged just now (retroactive date): its items come FIRST
    { uid: 's-fresh-log', date: '2026-01-15', instrumentType: 'Guitar', createdAt: '2026-06-07T09:00:00Z',
      items: topicUids.slice(0, 5).map((uid, i) => ({ uid: `i${i}`, sessionUid: 's-fresh-log', topicUid: uid, label: `Topic ${i}` })) },
  ]);

  render(<MySessionsPage />);
  await screen.findByText(todayLocalDate());
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));

  const select = await screen.findByLabelText('Entry 1');
  const recentGroup = within(select).getByRole('group', { name: 'Recent' });
  const names = within(recentGroup).getAllByRole('option').map(o => o.textContent);

  // 5 max, and the freshly logged session's items fill the slots first
  expect(names).toEqual(['Topic 0', 'Topic 1', 'Topic 2', 'Topic 3', 'Topic 4']);
});

test('FR12: search is accent-insensitive (French catalog)', async () => {
  mockedSongService.getAllSongs.mockResolvedValue([
    { uid: SONG_UID, title: 'Étude en mi' } as never,
  ]);

  render(<MySessionsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  const select = await screen.findByLabelText('Entry 1');
  await screen.findAllByRole('option', { name: 'Étude en mi' });

  fireEvent.change(screen.getByLabelText('Entry 1 search'), { target: { value: 'etude' } });

  expect(within(select).getByRole('option', { name: 'Étude en mi' })).toBeInTheDocument();
  expect(within(select).queryByRole('option', { name: 'Pentatonic scale' })).not.toBeInTheDocument();
});

test('FR12: a legacy instrument absent from the options is never pre-filled', async () => {
  mockedService.getAll.mockResolvedValue([
    { uid: 's1', date: todayLocalDate(), instrumentType: 'Cello', createdAt: '2026-06-07T09:00:00Z', items: [] },
  ]);

  render(<MySessionsPage />);
  await screen.findByText(todayLocalDate());

  expect(screen.getByLabelText('Instrument')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Log session' })).toBeDisabled();
});

test('FR12: Enter in the search field does not submit the session', async () => {
  render(<MySessionsPage />);
  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  await addEntry(1, `song:${SONG_UID}`);

  fireEvent.keyDown(screen.getByLabelText('Entry 1 search'), { key: 'Enter' });

  expect(mockedService.create).not.toHaveBeenCalled();
});

// jsdom sanitizes number inputs itself, so Safari's permissive typing cannot be
// simulated end-to-end here — the keystroke filter is tested directly instead
// (epic-2 retro action #1)
test('digitsOnly strips everything Safari lets through on number inputs', () => {
  expect(digitsOnly('abc')).toBe('');
  expect(digitsOnly('12abc')).toBe('12');
  expect(digitsOnly('1e5')).toBe('15');
  expect(digitsOnly('-40')).toBe('40');
  expect(digitsOnly('4 0.5')).toBe('405');
  expect(digitsOnly('')).toBe('');
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
