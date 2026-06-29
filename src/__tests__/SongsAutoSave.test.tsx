import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Songs from '../pages/Songs';

// Two songs sharing the artist 'A', so renaming Alpha's title to 'Beta' makes a
// live duplicate (title+artist match) — used for the freeze test.
jest.mock('../services/songService', () => ({
  songService: {
    getAllSongs: jest.fn().mockResolvedValue([
      { uid: 'song-a', title: 'Alpha', artist: 'A', instrument: ['Guitar'] },
      { uid: 'song-b', title: 'Beta', artist: 'A', instrument: ['Guitar'] },
    ]),
    updateSong: jest.fn().mockResolvedValue({ uid: 'song-a', title: 'Alpha', artist: 'A', instrument: ['Guitar'] }),
    createSong: jest.fn().mockResolvedValue({}),
    deleteSong: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../services/instrumentService', () => ({ instrumentService: { getAll: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/songPlayService', () => ({
  songPlayService: { getPlays: jest.fn().mockResolvedValue([]), markPlayed: jest.fn().mockResolvedValue({}), getLastPlayForInstrument: jest.fn() },
}));
jest.mock('../services/playlistService', () => ({
  playlistService: { getAllPlaylists: jest.fn().mockResolvedValue([]), addSongToPlaylist: jest.fn(), removeSongFromPlaylist: jest.fn(), updatePlaylist: jest.fn() },
}));

import { songService } from '../services/songService';
import { playlistService } from '../services/playlistService';
const updateSong = songService.updateSong as jest.Mock;

function renderSongs() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Songs />
    </MemoryRouter>
  );
}

const lastPayload = () => updateSong.mock.calls.at(-1)?.[1] as Record<string, unknown>;

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  updateSong.mockResolvedValue({ uid: 'song-a', title: 'Alpha', artist: 'A', instrument: ['Guitar'] });
});

describe('Songs — auto-save (story 13.1)', () => {
  test('an edit auto-saves after a debounce and keeps you on the song', async () => {
    renderSongs();
    fireEvent.click(await screen.findByText('Alpha'));
    fireEvent.change(screen.getByLabelText('Artist'), { target: { value: 'New Artist' } });

    await waitFor(
      () => expect(updateSong).toHaveBeenCalledWith('song-a', expect.objectContaining({ artist: 'New Artist' })),
      { timeout: 2500 },
    );
    // Still on the edit screen (not redirected to the list) + ambient "Saved" status.
    expect(screen.getByRole('button', { name: /back to songlist/i })).toBeInTheDocument();
    await screen.findByText(/saved/i);
  });

  test('Back to songlist flushes a pending edit, then returns to the list', async () => {
    renderSongs();
    fireEvent.click(await screen.findByText('Alpha'));
    fireEvent.change(screen.getByLabelText('Artist'), { target: { value: 'Quick' } });
    fireEvent.click(screen.getByRole('button', { name: /back to songlist/i })); // before the debounce fires

    await waitFor(() => expect(updateSong).toHaveBeenCalledWith('song-a', expect.objectContaining({ artist: 'Quick' })));
    await waitFor(() => expect(screen.queryByRole('button', { name: /back to songlist/i })).not.toBeInTheDocument());
  });

  test('a duplicate title freezes title/artist but keeps saving the rest', async () => {
    renderSongs();
    fireEvent.click(await screen.findByText('Alpha'));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Beta' } }); // Beta + A → live duplicate
    fireEvent.click(screen.getByRole('button', { name: /back to songlist/i }));

    await waitFor(() => expect(updateSong).toHaveBeenCalled());
    const payload = lastPayload();
    expect(payload.title).toBeUndefined();  // identity frozen while duplicate
    expect(payload.artist).toBeUndefined();
  });

  test('a failed save surfaces the "Not saved" status', async () => {
    updateSong.mockRejectedValueOnce(new Error('network'));
    renderSongs();
    fireEvent.click(await screen.findByText('Alpha'));
    fireEvent.change(screen.getByLabelText('Artist'), { target: { value: 'Boom' } });

    await waitFor(() => expect(screen.getByText(/not saved/i)).toBeInTheDocument(), { timeout: 2500 });
  });

  test('toggling a playlist in edit mode persists immediately (AC12)', async () => {
    (playlistService.getAllPlaylists as jest.Mock).mockResolvedValue([{ uid: 'pl-1', name: 'Rock', songUids: [] }]);
    (playlistService.addSongToPlaylist as jest.Mock).mockResolvedValue({});
    renderSongs();
    fireEvent.click(await screen.findByText('Alpha'));

    const picker = await screen.findByPlaceholderText(/search, select or create a playlist/i);
    fireEvent.focus(picker);
    fireEvent.click(await screen.findByRole('option', { name: 'Rock' }));

    await waitFor(() => expect(playlistService.addSongToPlaylist).toHaveBeenCalledWith('pl-1', 'song-a'));
  });
});
