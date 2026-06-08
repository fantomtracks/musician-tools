import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Songs from '../pages/Songs';

// Two guitar songs whose most recent guitar play differs by a day
const SONGS = [
  { uid: 'song-a', title: 'Alpha', artist: 'A', instrument: ['Guitar'], lastPlayed: '2026-03-01T10:00:00.000Z' },
  { uid: 'song-b', title: 'Bravo', artist: 'B', instrument: ['Guitar'], lastPlayed: '2026-03-02T10:00:00.000Z' },
];

const PLAYS: Record<string, unknown[]> = {
  'song-a': [{ uid: 'pa', songUid: 'song-a', instrumentType: 'Guitar', instrumentUid: null, playedAt: '2026-03-01T10:00:00.000Z' }],
  'song-b': [{ uid: 'pb', songUid: 'song-b', instrumentType: 'Guitar', instrumentUid: null, playedAt: '2026-03-02T10:00:00.000Z' }],
};

jest.mock('../services/songService', () => ({
  songService: {
    getAllSongs: jest.fn().mockResolvedValue([
      { uid: 'song-a', title: 'Alpha', artist: 'A', instrument: ['Guitar'], lastPlayed: '2026-03-01T10:00:00.000Z' },
      { uid: 'song-b', title: 'Bravo', artist: 'B', instrument: ['Guitar'], lastPlayed: '2026-03-02T10:00:00.000Z' },
    ]),
    updateSong: jest.fn().mockResolvedValue({}),
    createSong: jest.fn().mockResolvedValue({}),
    deleteSong: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../services/instrumentService', () => ({
  instrumentService: { getAll: jest.fn().mockResolvedValue([]) },
}));

jest.mock('../services/songPlayService', () => ({
  songPlayService: {
    getPlays: jest.fn((uid: string) => Promise.resolve(PLAYS[uid] ?? [])),
    markPlayed: jest.fn().mockResolvedValue({}),
    getLastPlayForInstrument: jest.fn(),
  },
}));

jest.mock('../services/playlistService', () => ({
  playlistService: { getAllPlaylists: jest.fn().mockResolvedValue([]) },
}));

function renderSongs() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Songs />
    </MemoryRouter>
  );
}

function rowTitlesInOrder(): string[] {
  const rows = screen.getAllByRole('row').slice(1); // drop the header row
  return rows
    .map(row => {
      const cells = within(row).queryAllByRole('cell');
      return cells.length >= 3 ? cells[2].textContent?.trim() ?? '' : '';
    })
    .filter(Boolean);
}

describe('Songs — last played sort with an active instrument filter', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    // northwood's exact setup: filtering by Guitar, sorting by last played
    localStorage.setItem('songsInstrumentFilter', 'Guitar');
    localStorage.setItem('songsSortColumn', 'lastPlayed');
    localStorage.setItem('songsSortDirection', 'asc');
  });

  test('toggling the Last played header reorders the rows (per-instrument times)', async () => {
    renderSongs();

    // Wait for the rows to be present
    await screen.findByText('Alpha');
    await waitFor(() => expect(SONGS.length).toBe(2));

    // asc: the older guitar play (Alpha, Mar 1) comes before the newer (Bravo)
    expect(rowTitlesInOrder()).toEqual(['Alpha', 'Bravo']);

    // Toggle to desc via the header
    fireEvent.click(screen.getByText('Last played'));

    await waitFor(() => expect(rowTitlesInOrder()).toEqual(['Bravo', 'Alpha']));
  });

  test('stale identical per-instrument timestamps still reorder via the global lastPlayed tiebreak', async () => {
    // Both guitar plays collide on the exact same timestamp (the old noon-UTC
    // data), but the global lastPlayed differs — the sort must not look frozen
    PLAYS['song-a'] = [{ uid: 'pa', songUid: 'song-a', instrumentType: 'Guitar', instrumentUid: null, playedAt: '2026-03-10T12:00:00.000Z' }];
    PLAYS['song-b'] = [{ uid: 'pb', songUid: 'song-b', instrumentType: 'Guitar', instrumentUid: null, playedAt: '2026-03-10T12:00:00.000Z' }];

    renderSongs();
    await screen.findByText('Alpha');

    // asc by global lastPlayed: Alpha (Mar 1) before Bravo (Mar 2)
    expect(rowTitlesInOrder()).toEqual(['Alpha', 'Bravo']);

    fireEvent.click(screen.getByText('Last played'));
    await waitFor(() => expect(rowTitlesInOrder()).toEqual(['Bravo', 'Alpha']));

    // restore for other tests
    PLAYS['song-a'] = [{ uid: 'pa', songUid: 'song-a', instrumentType: 'Guitar', instrumentUid: null, playedAt: '2026-03-01T10:00:00.000Z' }];
    PLAYS['song-b'] = [{ uid: 'pb', songUid: 'song-b', instrumentType: 'Guitar', instrumentUid: null, playedAt: '2026-03-02T10:00:00.000Z' }];
  });
});
