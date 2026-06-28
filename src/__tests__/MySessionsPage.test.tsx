import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MySessionsPage from '../pages/MySessionsPage';
import { digitsOnly } from '../utils/digitsOnly';
import { practiceSessionService, type PracticeSession } from '../services/practiceSessionService';

jest.mock('../services/practiceSessionService', () => ({
  // Keep the real pure helpers (e.g. sumSessionMinutes); only the API object is mocked
  ...jest.requireActual('../services/practiceSessionService'),
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

jest.mock('../services/topicService', () => {
  // Self-contained so the component and this test share one class identity for
  // `instanceof TopicConflictError` (a module-level mock can't reference outer scope).
  class TopicConflictError extends Error {
    existingTopic?: import('../services/topicService').Topic;
    constructor(existingTopic?: import('../services/topicService').Topic) {
      super('Topic already exists');
      this.name = 'TopicConflictError';
      this.existingTopic = existingTopic;
    }
  }
  return {
    TopicConflictError,
    topicService: {
      getAll: jest.fn(),
      create: jest.fn(),
    },
  };
});

import { songService } from '../services/songService';
import { topicService, TopicConflictError } from '../services/topicService';

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

// The combobox shows suggestions on focus; picking means clicking the option in
// the open listbox (default fixture: SONG_UID -> "Sweet Child", TOPIC_UID ->
// "Pentatonic scale").
const REF_LABELS: Record<string, string> = {
  [`song:${SONG_UID}`]: 'Sweet Child',
  [`topic:${TOPIC_UID}`]: 'Pentatonic scale',
};

async function pickEntry(index: number, label: string) {
  const input = await screen.findByLabelText(`Entry ${index}`);
  fireEvent.focus(input);
  const listbox = await screen.findByRole('listbox', { name: `Entry ${index} suggestions` });
  fireEvent.mouseDown(within(listbox).getByRole('option', { name: label }));
}

async function addEntry(index: number, ref: string, minutes?: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  await pickEntry(index, REF_LABELS[ref]);
  if (minutes !== undefined) {
    fireEvent.change(screen.getByLabelText(`Entry ${index} minutes`), { target: { value: minutes } });
  }
}

test('renders a labelled form with today (local) pre-filled and future dates blocked', () => {
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  const dateInput = screen.getByLabelText('Date');
  expect(dateInput).toHaveValue(todayLocalDate());
  expect(dateInput).toHaveAttribute('max', todayLocalDate());
  expect(screen.getByLabelText('Instrument')).toBeInTheDocument();
  // Epic 8: no editable Duration field anymore — a read-only Total is shown.
  expect(screen.queryByLabelText('Duration')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Total minutes')).toBeInTheDocument();
  expect(screen.getByLabelText('Note')).toBeInTheDocument();
});

test('submit is disabled until an instrument is selected', () => {
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  const submit = screen.getByRole('button', { name: 'Log session' });
  expect(submit).toBeDisabled();

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  expect(submit).not.toBeDisabled();
});

test('submitting sends the payload (no durationMinutes) and shows a confirmation toast', async () => {
  const created: PracticeSession = {
    uid: 's1',
    date: todayLocalDate(),
    instrumentType: 'Bass',
    note: 'bridge still rough',
  };
  mockedService.create.mockResolvedValue(created);

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'bridge still rough' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  await waitFor(() => {
    // Epic 8: the payload no longer carries durationMinutes
    expect(mockedService.create).toHaveBeenCalledWith({
      date: todayLocalDate(),
      instrumentType: 'Bass',
      note: 'bridge still rough',
      items: undefined,
    });
  });
  expect(await screen.findByText('Session logged')).toBeInTheDocument();
});

test('after success, note resets but date and instrument are kept', async () => {
  mockedService.create.mockResolvedValue({ uid: 's1', date: todayLocalDate(), instrumentType: 'Bass' });

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'quick run' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  await screen.findByText('Session logged');

  expect(screen.getByLabelText('Note')).toHaveValue('');
  expect(screen.getByLabelText('Date')).toHaveValue(todayLocalDate());
  expect(screen.getByLabelText('Instrument')).toHaveValue('Bass');
});

test('the read-only Total reflects the sum of the entries minutes', async () => {
  mockedService.create.mockResolvedValue({ uid: 's1', date: todayLocalDate(), instrumentType: 'Bass' });
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  await addEntry(1, `song:${SONG_UID}`, '50');

  // The Total is derived, never typed — it shows the entries' sum
  expect(screen.getByLabelText('Total minutes')).toHaveTextContent('50 min');

  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));
  await waitFor(() => {
    expect(mockedService.create).toHaveBeenCalledWith(
      expect.objectContaining({ items: [expect.objectContaining({ songUid: SONG_UID, minutes: 50 })] })
    );
    // No durationMinutes key in the payload
    expect(mockedService.create.mock.calls[0][0]).not.toHaveProperty('durationMinutes');
  });
});

test('a session without duration or note is valid (only date + instrument required)', async () => {
  mockedService.create.mockResolvedValue({ uid: 's1', date: todayLocalDate(), instrumentType: 'Guitar' });

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Guitar' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  await waitFor(() => {
    expect(mockedService.create).toHaveBeenCalledWith({
      date: todayLocalDate(),
      instrumentType: 'Guitar',
      note: undefined,
      items: undefined,
    });
  });
});

test('shows an error banner when creation fails', async () => {
  mockedService.create.mockRejectedValue(new Error('Failed to create session'));

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  expect(await screen.findByText('Failed to log session')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

test('surfaces specific server validation messages (e.g. clock-skewed client)', async () => {
  mockedService.create.mockRejectedValue(new Error('Date cannot be in the future'));

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

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

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: tomorrow } });
  // Bypass native constraint validation (max attr): the JS guard is the
  // backstop for platforms where the browser does not enforce it
  fireEvent.submit(screen.getByLabelText('Date').closest('form')!);

  expect(await screen.findByText('Date cannot be in the future')).toBeInTheDocument();
  expect(mockedService.create).not.toHaveBeenCalled();
});


test('the toast live region is mounted before any submission', () => {
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  const toast = screen.getByRole('status', { name: 'Notification' });
  expect(toast).toBeInTheDocument();
  expect(toast).toBeEmptyDOMElement();
});

test('Add entry shows a combobox with grouped Songs and Topics suggestions', async () => {
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));

  const input = await screen.findByLabelText('Entry 1');
  fireEvent.focus(input);
  const listbox = await screen.findByRole('listbox', { name: 'Entry 1 suggestions' });
  expect(within(listbox).getByRole('group', { name: 'Songs' })).toBeInTheDocument();
  expect(within(listbox).getByRole('group', { name: 'Topics' })).toBeInTheDocument();
  expect(within(listbox).getByRole('option', { name: 'Sweet Child' })).toBeInTheDocument();
  expect(within(listbox).getByRole('option', { name: 'Pentatonic scale' })).toBeInTheDocument();
});

test('submitting with entries sends decoded song/topic items', async () => {
  mockedService.create.mockResolvedValue({ uid: 's1', date: todayLocalDate(), instrumentType: 'Bass' });

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

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

test('FR13 (Epic 8): the read-only Total is the sum when every entry has minutes', async () => {
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  await addEntry(1, `song:${SONG_UID}`, '15');
  await addEntry(2, `topic:${TOPIC_UID}`, '25');

  expect(screen.getByLabelText('Total minutes')).toHaveTextContent('40 min');
});

test('FR13 (Epic 8): the Total counts a partial sum (entries without minutes = 0)', async () => {
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  await addEntry(1, `song:${SONG_UID}`, '15');
  await addEntry(2, `topic:${TOPIC_UID}`); // no minutes — counts as 0

  expect(screen.getByLabelText('Total minutes')).toHaveTextContent('15 min');
});

test('8.1: selecting a song with a duration pre-fills the entry minutes (rounded)', async () => {
  mockedSongService.getAllSongs.mockResolvedValue([
    { uid: SONG_UID, title: 'Sweet Child', durationSeconds: 240 } as never, // 4:00 → 4 min
  ]);
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  await addEntry(1, `song:${SONG_UID}`); // no manual minutes

  expect(screen.getByLabelText('Entry 1 minutes')).toHaveValue(4);
});

test('8.1: a manually entered minutes value is not overwritten by the song duration', async () => {
  mockedSongService.getAllSongs.mockResolvedValue([
    { uid: SONG_UID, title: 'Sweet Child', durationSeconds: 240 } as never,
  ]);
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  fireEvent.change(await screen.findByLabelText('Entry 1 minutes'), { target: { value: '10' } });
  await pickEntry(1, 'Sweet Child');

  expect(screen.getByLabelText('Entry 1 minutes')).toHaveValue(10); // user value preserved
});

test('8.1: a pre-filled minutes value stays editable (user edit wins)', async () => {
  mockedSongService.getAllSongs.mockResolvedValue([
    { uid: SONG_UID, title: 'Sweet Child', durationSeconds: 240 } as never, // pre-fills to 4
  ]);
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  await addEntry(1, `song:${SONG_UID}`);
  const minutes = screen.getByLabelText('Entry 1 minutes');
  expect(minutes).toHaveValue(4); // pre-filled

  fireEvent.change(minutes, { target: { value: '7' } }); // user edits it
  expect(minutes).toHaveValue(7); // edit wins
});

test('8.1: a song without a duration leaves the minutes empty', async () => {
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>); // default fixture: SONG_UID has no durationSeconds
  await addEntry(1, `song:${SONG_UID}`);
  expect(screen.getByLabelText('Entry 1 minutes')).toHaveValue(null);
});

test('8.1: selecting a topic does not pre-fill minutes', async () => {
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  await addEntry(1, `topic:${TOPIC_UID}`);
  expect(screen.getByLabelText('Entry 1 minutes')).toHaveValue(null);
});

const FREE_UID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

test('8.2: the Free practice system topic is pinned to the top of the Topics group', async () => {
  // Returned AFTER the user topic, yet it must be pinned first in the group
  mockedTopicService.getAll.mockResolvedValue([
    { uid: TOPIC_UID, name: 'Pentatonic scale' },
    { uid: FREE_UID, name: 'Free practice', isSystem: true },
  ]);

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  fireEvent.focus(await screen.findByLabelText('Entry 1'));
  const listbox = await screen.findByRole('listbox', { name: 'Entry 1 suggestions' });
  const topicsGroup = within(listbox).getByRole('group', { name: 'Topics' });
  const options = within(topicsGroup).getAllByRole('option').map(o => o.textContent);

  expect(options[0]).toBe('Free practice');
  expect(options).toEqual(['Free practice', 'Pentatonic scale']);
});

test('8.2: search still surfaces the Free practice topic (matches "free")', async () => {
  mockedTopicService.getAll.mockResolvedValue([
    { uid: TOPIC_UID, name: 'Pentatonic scale' },
    { uid: FREE_UID, name: 'Free practice', isSystem: true },
  ]);

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  const input = await screen.findByLabelText('Entry 1');
  fireEvent.focus(input);
  const listbox = await screen.findByRole('listbox', { name: 'Entry 1 suggestions' });

  fireEvent.change(input, { target: { value: 'free' } });
  // AC4: the system topic stays searchable like any other (same filterOptions)
  expect(within(listbox).getByRole('option', { name: 'Free practice' })).toBeInTheDocument();
});

test('8.2: typing an unknown name offers "Create topic", which creates and selects it', async () => {
  mockedTopicService.create.mockResolvedValue({ uid: 'new-topic-uid', name: 'Sweep picking', isSystem: false });

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  const input = await screen.findByLabelText('Entry 1');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Sweep picking' } });

  const listbox = await screen.findByRole('listbox', { name: 'Entry 1 suggestions' });
  const createGroup = within(listbox).getByRole('group', { name: 'Create' });
  fireEvent.mouseDown(within(createGroup).getByRole('option', { name: 'Create topic "Sweep picking"' }));

  await waitFor(() => {
    expect(mockedTopicService.create).toHaveBeenCalledWith({ name: 'Sweep picking' });
  });
  // The created topic is added to state and selected: the field reflects it at rest
  await waitFor(() => expect(screen.getByLabelText('Entry 1')).toHaveValue('Sweep picking'));
});

test('8.2: no "Create topic" option for a name that already matches a topic exactly', async () => {
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>); // default fixture: "Pentatonic scale"
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  const input = await screen.findByLabelText('Entry 1');
  fireEvent.focus(input);
  const listbox = await screen.findByRole('listbox', { name: 'Entry 1 suggestions' });

  // Case/accent-insensitive exact match → no Create offered
  fireEvent.change(input, { target: { value: 'pentatonic scale' } });
  expect(within(listbox).queryByRole('group', { name: 'Create' })).not.toBeInTheDocument();
});

test('8.2: a 409 on create selects the server-resolved existing topic (AC10)', async () => {
  // The client offered Create, but the server already has the topic (its unaccent
  // folding outruns the client) → 409 carrying the canonical topic. We select it
  // directly — no catalog reload, no error toast.
  mockedTopicService.create.mockRejectedValue(
    new TopicConflictError({ uid: 'server-uid', name: 'Sweep picking', isSystem: false }),
  );

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  const input = await screen.findByLabelText('Entry 1');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Sweep picking' } });

  const listbox = await screen.findByRole('listbox', { name: 'Entry 1 suggestions' });
  const createGroup = within(listbox).getByRole('group', { name: 'Create' });
  fireEvent.mouseDown(within(createGroup).getByRole('option', { name: 'Create topic "Sweep picking"' }));

  await waitFor(() => expect(mockedTopicService.create).toHaveBeenCalled());
  // Selected directly from the error payload — getAll fired only on initial load.
  expect(mockedTopicService.getAll).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.getByLabelText('Entry 1')).toHaveValue('Sweep picking'));
  expect(screen.queryByText('Could not add topic')).not.toBeInTheDocument();
});

test('8.2: a 409 without a resolved topic falls back to reloading the catalog (AC10)', async () => {
  // Older path: the server could not resolve the row → reload and fold-match.
  mockedTopicService.create.mockRejectedValue(new TopicConflictError());
  mockedTopicService.getAll
    .mockResolvedValueOnce([]) // initial page load: empty catalog
    .mockResolvedValueOnce([{ uid: 'server-uid', name: 'Sweep picking' }]); // reload after 409

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  const input = await screen.findByLabelText('Entry 1');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Sweep picking' } });

  const listbox = await screen.findByRole('listbox', { name: 'Entry 1 suggestions' });
  const createGroup = within(listbox).getByRole('group', { name: 'Create' });
  fireEvent.mouseDown(within(createGroup).getByRole('option', { name: 'Create topic "Sweep picking"' }));

  await waitFor(() => expect(mockedTopicService.create).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByLabelText('Entry 1')).toHaveValue('Sweep picking'));
  expect(screen.queryByText('Could not add topic')).not.toBeInTheDocument();
});

test('8.2: selecting the Free practice topic does not pre-fill minutes (8.1 preserved)', async () => {
  mockedTopicService.getAll.mockResolvedValue([
    { uid: FREE_UID, name: 'Free practice', isSystem: true },
  ]);

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  fireEvent.focus(await screen.findByLabelText('Entry 1'));
  const listbox = await screen.findByRole('listbox', { name: 'Entry 1 suggestions' });
  fireEvent.mouseDown(within(listbox).getByRole('option', { name: 'Free practice' }));

  expect(screen.getByLabelText('Entry 1 minutes')).toHaveValue(null);
});

test('Remove entry deletes the row', async () => {
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  await addEntry(1, `song:${SONG_UID}`);
  fireEvent.click(screen.getByRole('button', { name: 'Remove entry 1' }));

  expect(screen.queryByLabelText('Entry 1')).not.toBeInTheDocument();
});

test('an entry row without a song/topic blocks submission instead of being dropped', async () => {
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  fireEvent.change(await screen.findByLabelText('Entry 1 minutes'), { target: { value: '30' } });
  fireEvent.submit(screen.getByLabelText('Date').closest('form')!);

  expect(await screen.findByText('Each entry needs a song or topic — fill or remove empty entries')).toBeInTheDocument();
  expect(mockedService.create).not.toHaveBeenCalled();
});

test('FR13 (Epic 8): the Total shows the raw entries sum even above 1440 (no cap)', async () => {
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  await addEntry(1, `song:${SONG_UID}`, '800');
  await addEntry(2, `topic:${TOPIC_UID}`, '800');

  // The total is purely derived now — it is not auto-applied to a field, so the
  // old "out of 1..1440 range → leave the field free" rule no longer applies.
  expect(screen.getByLabelText('Total minutes')).toHaveTextContent('1600 min');
});

test('the history lists sessions with date, instrument, the entries-sum minutes, notes and entries', async () => {
  mockedService.getAll.mockResolvedValue([
    {
      uid: 's1',
      date: '2026-06-05',
      instrumentType: 'Bass',
      note: 'great session',
      items: [
        { uid: 'i1', sessionUid: 's1', label: 'Sweet Child', minutes: 15, note: 'at 30 BPM' },
        { uid: 'i2', sessionUid: 's1', label: 'Pentatonic scale', minutes: 25 },
      ],
    },
  ]);

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  const history = await screen.findByRole('list', { name: 'Session history' });
  expect(within(history).getByText('2026-06-05')).toBeInTheDocument();
  expect(within(history).getByText('Bass')).toBeInTheDocument();
  // 15 + 25 = 40, summed from the entries (no stored durationMinutes)
  expect(within(history).getByText('· 40 min')).toBeInTheDocument();
  expect(within(history).getByText('great session')).toBeInTheDocument();
  expect(within(history).getByText(/Sweet Child/)).toBeInTheDocument();
  expect(within(history).getByText(/played during 15 minutes/)).toBeInTheDocument();
  expect(within(history).getByText(/at 30 BPM/)).toBeInTheDocument();
  expect(within(history).getByText(/Pentatonic scale/)).toBeInTheDocument();
});

test('the history shows "Artist - Title", resolved from the catalog', async () => {
  mockedSongService.getAllSongs.mockResolvedValue([
    { uid: SONG_UID, title: 'Sweet Child', artist: "Guns N' Roses" } as never,
  ]);
  mockedService.getAll.mockResolvedValue([
    {
      uid: 's1',
      date: '2026-06-05',
      instrumentType: 'Bass',
      items: [
        // songUid drives the artist lookup; the topic item has no artist
        { uid: 'i1', sessionUid: 's1', songUid: SONG_UID, label: 'Sweet Child', minutes: 15 },
        { uid: 'i2', sessionUid: 's1', topicUid: TOPIC_UID, label: 'Pentatonic scale', minutes: 25 },
      ],
    },
  ]);

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  const history = await screen.findByRole('list', { name: 'Session history' });
  // Story 5.5: the song entry reads "Artist - Title" — artist first, hyphen separator
  const songEntry = within(history).getByText('Sweet Child').closest('li')!;
  expect(songEntry.textContent).toMatch(/Guns N' Roses - Sweet Child/);
  expect(songEntry.textContent).not.toMatch(/Sweet Child — Guns N' Roses/);
  // ...but the topic entry stays artist-less (label stands alone)
  const topicEntry = within(history).getByText('Pentatonic scale').closest('li')!;
  expect(topicEntry.textContent).not.toMatch(/Guns N' Roses/);
});

test('the picker shows song options as "Artist - Title"', async () => {
  mockedSongService.getAllSongs.mockResolvedValue([
    { uid: SONG_UID, title: 'Sweet Child', artist: "Guns N' Roses" } as never,
  ]);

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  fireEvent.focus(await screen.findByLabelText('Entry 1'));
  const listbox = await screen.findByRole('listbox', { name: 'Entry 1 suggestions' });
  const songsGroup = within(listbox).getByRole('group', { name: 'Songs' });
  expect(within(songsGroup).getByRole('option', { name: "Guns N' Roses - Sweet Child" })).toBeInTheDocument();
});

test('the combobox input shows the SELECTED song as "Artist - Title" at rest (AC1)', async () => {
  mockedSongService.getAllSongs.mockResolvedValue([
    { uid: SONG_UID, title: 'Sweet Child', artist: "Guns N' Roses" } as never,
  ]);

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  const input = await screen.findByLabelText('Entry 1');
  fireEvent.focus(input);
  const listbox = await screen.findByRole('listbox', { name: 'Entry 1 suggestions' });
  fireEvent.mouseDown(within(listbox).getByRole('option', { name: "Guns N' Roses - Sweet Child" }));

  // At rest (not searching) the field reflects the selected ref via labelForRef
  // → formatSongLabel → "Artist - Title"
  expect(input).toHaveValue("Guns N' Roses - Sweet Child");
});

test('shows the empty history state', async () => {
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  expect(await screen.findByText('No sessions logged yet.')).toBeInTheDocument();
});

test('a failed history load does not pretend the history is empty', async () => {
  mockedService.getAll.mockRejectedValue(new Error('Failed to fetch sessions'));

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

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

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
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

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
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

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

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

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
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

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

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

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
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
    note: 'old note',
    items: [
      { uid: ITEM_UID, sessionUid: 's-edit', songUid: SONG_UID, topicUid: null, label: 'Sweet Child', minutes: 15, note: 'at 30 BPM' },
    ],
  };
}

test('Edit populates the form, shows the banner, and Save sends a diff-by-uid payload', async () => {
  mockedService.getAll.mockResolvedValue([editableSession()]);
  mockedService.update.mockResolvedValue({ ...editableSession(), note: 'new note' });

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));

  expect(screen.getByText('Editing session of 2026-06-05')).toBeInTheDocument();
  expect(screen.getByLabelText('Date')).toHaveValue('2026-06-05');
  expect(screen.getByLabelText('Instrument')).toHaveValue('Bass');
  // Total is the read-only sum of the entries (the single entry has 15 min)
  expect(screen.getByLabelText('Total minutes')).toHaveTextContent('15 min');
  expect(screen.getByLabelText('Note')).toHaveValue('old note');
  // The combobox shows the resolved label of the selected song, not its ref
  expect(screen.getByLabelText('Entry 1')).toHaveValue('Sweet Child');
  expect(screen.getByLabelText('Entry 1 minutes')).toHaveValue(15);
  // The former separate search box is gone — search is merged into the combobox
  expect(screen.queryByLabelText('Entry 1 search')).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'new note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save session' }));

  await waitFor(() => {
    expect(mockedService.update).toHaveBeenCalledWith('s-edit', {
      date: '2026-06-05',
      instrumentType: 'Bass',
      note: 'new note',
      items: [{ uid: ITEM_UID, songUid: SONG_UID, minutes: 15, note: 'at 30 BPM' }],
    });
  });
  expect(await screen.findByText('Session updated')).toBeInTheDocument();
  expect(screen.queryByText('Editing session of 2026-06-05')).not.toBeInTheDocument();
});

test('Cancel edit restores a blank form without calling the API', async () => {
  mockedService.getAll.mockResolvedValue([editableSession()]);

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));

  expect(mockedService.update).not.toHaveBeenCalled();
  expect(screen.queryByText('Editing session of 2026-06-05')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Date')).toHaveValue(todayLocalDate());
  expect(screen.getByLabelText('Instrument')).toHaveValue('');
  expect(screen.queryByLabelText('Entry 1')).not.toBeInTheDocument();
});

test('an orphan entry shows its snapshot label and is sent back without a ref (FR4)', async () => {
  const orphanSession = {
    ...editableSession(),
    items: [{ uid: ITEM_UID, sessionUid: 's-edit', songUid: null, topicUid: null, label: 'Ghost topic', minutes: 10, note: null }],
  };
  mockedService.getAll.mockResolvedValue([orphanSession]);
  mockedService.update.mockResolvedValue(orphanSession);

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));

  // The combobox shows the FR4 snapshot as its value; the ref stays empty
  expect(screen.getByLabelText('Entry 1')).toHaveValue('Ghost topic');

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

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));
  await pickEntry(1, 'Pentatonic scale');
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

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove entry 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save session' }));

  await waitFor(() => {
    expect(mockedService.update).toHaveBeenCalledWith('s-edit', expect.objectContaining({ items: [] }));
  });
});

test('FR13 (Epic 8) in edit mode: the Total tracks the entries and never sends durationMinutes', async () => {
  mockedService.getAll.mockResolvedValue([editableSession()]);
  mockedService.update.mockResolvedValue(editableSession());

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));

  // The single entry has 15 min → Total shows 15, recomputed live as it changes
  expect(screen.getByLabelText('Total minutes')).toHaveTextContent('15 min');
  fireEvent.change(screen.getByLabelText('Entry 1 minutes'), { target: { value: '20' } });
  expect(screen.getByLabelText('Total minutes')).toHaveTextContent('20 min');

  fireEvent.click(screen.getByRole('button', { name: 'Save session' }));
  await waitFor(() => {
    expect(mockedService.update).toHaveBeenCalled();
    // No durationMinutes key is ever sent
    expect(mockedService.update.mock.calls[0][1]).not.toHaveProperty('durationMinutes');
  });
});

test('clearing a non-orphan entry and blurring reverts to its selected song', async () => {
  mockedService.getAll.mockResolvedValue([editableSession()]);

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));

  const input = screen.getByLabelText('Entry 1');
  expect(input).toHaveValue('Sweet Child');

  // Typing then leaving without picking must not drop a real ref: the field
  // snaps back to the current selection
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.blur(input);
  await waitFor(() => expect(input).toHaveValue('Sweet Child'));
});

test('entering edit mode moves focus to the Date field', async () => {
  mockedService.getAll.mockResolvedValue([editableSession()]);

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));

  expect(screen.getByLabelText('Date')).toHaveFocus();
});

test('Delete session asks for confirmation naming the session, then removes it', async () => {
  mockedService.getAll.mockResolvedValue([editableSession()]);
  mockedService.remove.mockResolvedValue(undefined);

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
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

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
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

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  await waitFor(() => {
    expect(screen.getByLabelText('Instrument')).toHaveValue('Guitar');
  });
});

test('FR12: a manual instrument choice made before the data arrives is not overwritten', async () => {
  let resolveGetAll!: (value: never[]) => void;
  mockedService.getAll.mockReturnValue(new Promise(resolve => { resolveGetAll = resolve; }));

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
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

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  await screen.findAllByText(/Sweet Child/);
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));

  fireEvent.focus(await screen.findByLabelText('Entry 1'));
  const listbox = await screen.findByRole('listbox', { name: 'Entry 1 suggestions' });
  const recentGroup = within(listbox).getByRole('group', { name: 'Recent' });
  const recentOptions = within(recentGroup).getAllByRole('option');

  // Order of first occurrence, deduplicated, current catalog name (not the stale snapshot)
  expect(recentOptions.map(o => o.textContent)).toEqual(['Pentatonic scale', 'Sweet Child']);
  expect(within(recentGroup).queryByText('Ghost topic')).not.toBeInTheDocument();
  // Recent group is rendered before Songs/Topics groups
  const groups = within(listbox).getAllByRole('group');
  expect(groups[0]).toHaveAccessibleName('Recent');
});

test('FR12: instant search filters the picker suggestions and clearing restores them', async () => {
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  const input = await screen.findByLabelText('Entry 1');
  fireEvent.focus(input);
  const listbox = await screen.findByRole('listbox', { name: 'Entry 1 suggestions' });

  fireEvent.change(input, { target: { value: 'penta' } });
  expect(within(listbox).getByRole('option', { name: 'Pentatonic scale' })).toBeInTheDocument();
  expect(within(listbox).queryByRole('option', { name: 'Sweet Child' })).not.toBeInTheDocument();

  fireEvent.change(input, { target: { value: '' } });
  expect(within(listbox).getByRole('option', { name: 'Sweet Child' })).toBeInTheDocument();
});

test('FR12: a mismatched search does not lose the selected ref', async () => {
  mockedService.create.mockResolvedValue({ uid: 's1', date: todayLocalDate(), instrumentType: 'Bass' });

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  await addEntry(1, `song:${SONG_UID}`);

  // The selection is held in state, not in the field text: a non-matching query
  // typed afterwards must not drop it
  fireEvent.change(screen.getByLabelText('Entry 1'), { target: { value: 'penta' } });

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

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  await screen.findByText(todayLocalDate());
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));

  fireEvent.focus(await screen.findByLabelText('Entry 1'));
  const listbox = await screen.findByRole('listbox', { name: 'Entry 1 suggestions' });
  const recentGroup = within(listbox).getByRole('group', { name: 'Recent' });
  const names = within(recentGroup).getAllByRole('option').map(o => o.textContent);

  // 5 max, and the freshly logged session's items fill the slots first
  expect(names).toEqual(['Topic 0', 'Topic 1', 'Topic 2', 'Topic 3', 'Topic 4']);
});

test('FR12: search is accent-insensitive (French catalog)', async () => {
  mockedSongService.getAllSongs.mockResolvedValue([
    { uid: SONG_UID, title: 'Étude en mi' } as never,
  ]);

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
  const input = await screen.findByLabelText('Entry 1');
  fireEvent.focus(input);
  const listbox = await screen.findByRole('listbox', { name: 'Entry 1 suggestions' });

  fireEvent.change(input, { target: { value: 'etude' } });

  expect(within(listbox).getByRole('option', { name: 'Étude en mi' })).toBeInTheDocument();
  expect(within(listbox).queryByRole('option', { name: 'Pentatonic scale' })).not.toBeInTheDocument();
});

test('FR12: a legacy instrument absent from the options is never pre-filled', async () => {
  mockedService.getAll.mockResolvedValue([
    { uid: 's1', date: todayLocalDate(), instrumentType: 'Cello', createdAt: '2026-06-07T09:00:00Z', items: [] },
  ]);

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  await screen.findByText(todayLocalDate());

  expect(screen.getByLabelText('Instrument')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Log session' })).toBeDisabled();
});

test('FR12: Enter in the picker does not submit the session', async () => {
  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  await addEntry(1, `song:${SONG_UID}`);

  fireEvent.keyDown(screen.getByLabelText('Entry 1'), { key: 'Enter' });

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

test('the history is hidden while editing and comes back on cancel (3.2 field feedback)', async () => {
  mockedService.getAll.mockResolvedValue([editableSession()]);

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  await screen.findByRole('list', { name: 'Session history' });

  fireEvent.click(screen.getByRole('button', { name: 'Edit session of 2026-06-05' }));
  expect(screen.queryByRole('list', { name: 'Session history' })).not.toBeInTheDocument();
  expect(screen.queryByText('History')).not.toBeInTheDocument();
  // The live region stays mounted (sr-only) so AT announcements survive edit mode
  expect(screen.getByRole('status', { name: 'History status' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));
  expect(screen.getByRole('list', { name: 'Session history' })).toBeInTheDocument();
});

test('the edit banner offers a confirmed Delete session (3.2 field feedback)', async () => {
  mockedService.getAll.mockResolvedValue([editableSession()]);
  mockedService.remove.mockResolvedValue(undefined);

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit session of 2026-06-05' }));

  // The banner's Delete is the only one visible (history is hidden)
  fireEvent.click(screen.getByRole('button', { name: 'Delete session of 2026-06-05' }));
  expect(screen.getByText('Are you sure you want to delete the session of 2026-06-05 (Bass)?')).toBeInTheDocument();

  fireEvent.click(screen.getByText('Delete', { selector: 'div[role="dialog"] button' }));

  await waitFor(() => {
    expect(mockedService.remove).toHaveBeenCalledWith('s-edit');
  });
  // Deleting the session being edited exits edit mode (2.4 acquis) — the
  // history is visible again, without the deleted session
  expect(screen.queryByText('Editing session of 2026-06-05')).not.toBeInTheDocument();
  expect(await screen.findByText('No sessions logged yet.')).toBeInTheDocument();
});

describe('heatmap deep-links (3.2)', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  test('?date= pre-fills the date field and cleans the URL (AC5)', async () => {
    window.history.pushState({}, '', '/my-sessions?date=2026-02-15');

    render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

    expect(screen.getByLabelText('Date')).toHaveValue('2026-02-15');
    expect(window.location.search).toBe('');
    await screen.findByText('No sessions logged yet.');
  });

  test('URL cleanup removes only the consumed params, keeping the rest and the hash', async () => {
    window.history.pushState({}, '', '/my-sessions?date=2026-02-15&tab=stats#anchor');

    render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

    expect(screen.getByLabelText('Date')).toHaveValue('2026-02-15');
    expect(window.location.search).toBe('?tab=stats');
    expect(window.location.hash).toBe('#anchor');
    await screen.findByText('No sessions logged yet.');
  });

  test('a future or non-calendar ?date= is silently ignored', async () => {
    for (const param of ['2099-01-01', '2026-02-31', '1899-12-31', 'garbage']) {
      window.history.pushState({}, '', `/my-sessions?date=${param}`);
      const { unmount } = render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

      expect(screen.getByLabelText('Date')).toHaveValue(todayLocalDate());
      unmount();
    }
  });

  test('?edit=<uid> opens the session in edit mode once loaded (AC4)', async () => {
    mockedService.getAll.mockResolvedValue([editableSession()]);
    window.history.pushState({}, '', '/my-sessions?edit=s-edit');

    render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

    expect(await screen.findByText('Editing session of 2026-06-05')).toBeInTheDocument();
    expect(screen.getByLabelText('Instrument')).toHaveValue('Bass');
    expect(window.location.search).toBe('');
  });

  test('an unknown ?edit uid is silently ignored', async () => {
    mockedService.getAll.mockResolvedValue([editableSession()]);
    window.history.pushState({}, '', '/my-sessions?edit=does-not-exist');

    render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

    await screen.findByText('2026-06-05');
    expect(screen.queryByText(/Editing session of/)).not.toBeInTheDocument();
  });
});

test('Epic 8 (option B): logging with no entry falls back to a Free practice entry + toast', async () => {
  // The default fixture has no system topic; provide one here.
  mockedTopicService.getAll.mockResolvedValue([
    { uid: TOPIC_UID, name: 'Pentatonic scale' },
    { uid: FREE_UID, name: 'Free practice', isSystem: true },
  ]);
  mockedService.create.mockResolvedValue({ uid: 's1', date: todayLocalDate(), instrumentType: 'Guitar' });

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  // Wait for topics (incl. the system one) to load before submitting
  await screen.findByText('No sessions logged yet.');

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Guitar' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  await waitFor(() => {
    // No song/topic chosen → a single Free practice entry, floored to 1 minute
    // (a logged session always carries at least 1 min)
    expect(mockedService.create).toHaveBeenCalledWith(
      expect.objectContaining({ items: [{ topicUid: FREE_UID, minutes: 1 }] })
    );
  });
  expect(await screen.findByText('Logged as Free practice')).toBeInTheDocument();
});

test('Epic 8: a session whose entries have no minutes is floored to 1 minute on the first entry', async () => {
  mockedService.create.mockResolvedValue({ uid: 's1', date: todayLocalDate(), instrumentType: 'Bass' });

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Bass' } });
  await addEntry(1, `song:${SONG_UID}`); // a song entry, but no minutes entered

  // The read-only Total still shows the live (pre-floor) sum of 0 → neutral dash
  expect(screen.getByLabelText('Total minutes')).toHaveTextContent('—');

  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));
  await waitFor(() => {
    // On submit, the timeless session is floored to 1 min on its first entry
    expect(mockedService.create).toHaveBeenCalledWith(
      expect.objectContaining({ items: [{ songUid: SONG_UID, minutes: 1 }] })
    );
  });
});

test('logging with no entry and no system topic available degrades to an empty session', async () => {
  // Default fixture: only a normal topic, no isSystem → nothing to fall back to
  mockedService.create.mockResolvedValue({ uid: 's1', date: todayLocalDate(), instrumentType: 'Guitar' });

  render(<MemoryRouter><MySessionsPage /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'Guitar' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log session' }));

  await waitFor(() => {
    expect(mockedService.create).toHaveBeenCalledWith(
      expect.objectContaining({ items: undefined })
    );
  });
  expect(await screen.findByText('Session logged')).toBeInTheDocument();
});
