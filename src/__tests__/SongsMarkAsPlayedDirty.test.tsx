import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Songs from '../pages/Songs';

// One guitar song with no duration yet — the case northwood hit: type a
// duration, click "Mark as played" before saving.
jest.mock('../services/songService', () => ({
  songService: {
    getAllSongs: jest.fn().mockResolvedValue([
      { uid: 'song-a', title: 'Alpha', artist: 'A', instrument: ['Guitar'], durationSeconds: null },
    ]),
    updateSong: jest.fn().mockResolvedValue({ uid: 'song-a', title: 'Alpha', artist: 'A', instrument: ['Guitar'], durationSeconds: 300 }),
    createSong: jest.fn().mockResolvedValue({}),
    deleteSong: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../services/instrumentService', () => ({
  instrumentService: { getAll: jest.fn().mockResolvedValue([]) },
}));

jest.mock('../services/songPlayService', () => ({
  songPlayService: {
    getPlays: jest.fn().mockResolvedValue([]),
    markPlayed: jest.fn().mockResolvedValue({}),
    getLastPlayForInstrument: jest.fn(),
  },
}));

jest.mock('../services/playlistService', () => ({
  playlistService: { getAllPlaylists: jest.fn().mockResolvedValue([]) },
}));

import { songService } from '../services/songService';
import { songPlayService } from '../services/songPlayService';

function renderSongs() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Songs />
    </MemoryRouter>
  );
}

async function openEditAndTypeDuration() {
  fireEvent.click(await screen.findByText('Alpha')); // row click opens the edit form
  fireEvent.click(await screen.findByText('Details')); // duration lives in the Details accordion
  const duration = screen.getByLabelText('Duration (m:ss)') as HTMLInputElement;
  fireEvent.change(duration, { target: { value: '5:00' } });
  fireEvent.blur(duration); // commit to the form → unsaved change
}

describe('Songs — Mark as Played with unsaved changes', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  test('clicking Mark as played with an unsaved duration asks to save, then saves and marks', async () => {
    renderSongs();
    await openEditAndTypeDuration();

    // sanity: the duration committed and is canonicalised
    expect((screen.getByLabelText('Duration (m:ss)') as HTMLInputElement).value).toBe('5:00');

    fireEvent.click(screen.getByRole('button', { name: 'Mark as played' }));

    // The guard surfaces a confirmation instead of marking silently
    const confirmBtn = await screen.findByRole('button', { name: 'Save & mark as played' });
    expect(songPlayService.markPlayed).not.toHaveBeenCalled();

    fireEvent.click(confirmBtn);

    // The song is saved WITH the freshly typed duration (300s)...
    await waitFor(() =>
      expect(songService.updateSong).toHaveBeenCalledWith(
        'song-a',
        expect.objectContaining({ durationSeconds: 300 }),
      ),
    );
    // ...and only then is the play recorded
    await waitFor(() =>
      expect(songPlayService.markPlayed).toHaveBeenCalledWith(
        'song-a',
        expect.objectContaining({ instrumentType: 'Guitar' }),
      ),
    );
  });

  test('with no unsaved changes, Mark as played marks directly (no dialog)', async () => {
    renderSongs();
    fireEvent.click(await screen.findByText('Alpha')); // open edit, change nothing

    fireEvent.click(await screen.findByRole('button', { name: 'Mark as played' }));

    await waitFor(() => expect(songPlayService.markPlayed).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Save & mark as played' })).not.toBeInTheDocument();
  });
});
