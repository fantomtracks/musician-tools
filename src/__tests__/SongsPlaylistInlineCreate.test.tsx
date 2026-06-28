import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Songs from '../pages/Songs';

// Story 10.2: create a playlist on the fly from the song edit form.
// One song so clicking its row opens edit mode (where the playlist picker lives).
jest.mock('../services/songService', () => ({
  songService: {
    getAllSongs: jest.fn().mockResolvedValue([
      { uid: 'song-a', title: 'Alpha', artist: 'A', instrument: ['Guitar'], durationSeconds: null },
    ]),
    updateSong: jest.fn().mockResolvedValue({ uid: 'song-a', title: 'Alpha', artist: 'A', instrument: ['Guitar'] }),
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

// Real PlaylistConflictError class in the mock so `instanceof` works in Songs.tsx.
jest.mock('../services/playlistService', () => {
  class PlaylistConflictError extends Error {
    existingPlaylist?: unknown;
    constructor(existingPlaylist?: unknown) {
      super('Playlist already exists');
      this.name = 'PlaylistConflictError';
      this.existingPlaylist = existingPlaylist;
    }
  }
  return {
    PlaylistConflictError,
    playlistService: {
      getAllPlaylists: jest.fn().mockResolvedValue([]),
      createPlaylist: jest.fn(),
      updatePlaylist: jest.fn().mockResolvedValue({}),
    },
  };
});

import { playlistService, PlaylistConflictError, type Playlist } from '../services/playlistService';
import { songService } from '../services/songService';

const mockedPlaylistService = playlistService as jest.Mocked<typeof playlistService>;

const PLACEHOLDER = 'Search, select or create a playlist';

function renderSongs() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Songs />
    </MemoryRouter>
  );
}

// Open the edit form for the only song and focus the playlist picker input.
async function openPickerAndType(text: string) {
  renderSongs();
  fireEvent.click(await screen.findByText('Alpha')); // row click → edit mode
  const input = await screen.findByPlaceholderText(PLACEHOLDER);
  fireEvent.focus(input);
  if (text) fireEvent.change(input, { target: { value: text } });
  return input as HTMLInputElement;
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  mockedPlaylistService.getAllPlaylists.mockResolvedValue([]);
  mockedPlaylistService.updatePlaylist.mockResolvedValue({} as Playlist);
});

describe('Songs — create a playlist on the fly (story 10.2)', () => {
  test('AC1/AC2/AC3: offers "Create playlist" only for a non-existing, non-empty name', async () => {
    mockedPlaylistService.getAllPlaylists.mockResolvedValue([
      { uid: 'pl-rock', name: 'Rock', songUids: [] },
    ]);
    const input = await openPickerAndType('Jazz');

    // AC1: non-matching name → Create option shown
    expect(await screen.findByText('Create playlist "Jazz"')).toBeInTheDocument();

    // AC2: an existing name (different case) → no Create option
    fireEvent.change(input, { target: { value: 'rock' } });
    await waitFor(() => expect(screen.queryByText(/^Create playlist/)).not.toBeInTheDocument());

    // AC3: whitespace-only → no Create option
    fireEvent.change(input, { target: { value: '   ' } });
    expect(screen.queryByText(/^Create playlist/)).not.toBeInTheDocument();
  });

  test('AC4/AC5: creating adds the current song, shows a selected chip, and does not submit the form', async () => {
    mockedPlaylistService.createPlaylist.mockResolvedValue({ uid: 'pl-new', name: 'Jazz', songUids: ['song-a'] });
    await openPickerAndType('Jazz');

    fireEvent.click(await screen.findByText('Create playlist "Jazz"'));

    await waitFor(() =>
      expect(mockedPlaylistService.createPlaylist).toHaveBeenCalledWith({ name: 'Jazz', songUids: ['song-a'] }),
    );
    // AC5: appears as a selected chip (titled with the playlist name)
    await waitFor(() => expect(screen.getByTitle('Jazz')).toBeInTheDocument());
    // not submitted → the song was not saved
    expect(songService.updateSong).not.toHaveBeenCalled();
  });

  test('AC7: with no playlists yet, typing a name still lets you create the first one', async () => {
    mockedPlaylistService.getAllPlaylists.mockResolvedValue([]);
    mockedPlaylistService.createPlaylist.mockResolvedValue({ uid: 'pl-1', name: 'Favourites', songUids: ['song-a'] });

    await openPickerAndType('Favourites');
    fireEvent.click(await screen.findByText('Create playlist "Favourites"'));

    await waitFor(() =>
      expect(mockedPlaylistService.createPlaylist).toHaveBeenCalledWith({ name: 'Favourites', songUids: ['song-a'] }),
    );
  });

  test('AC8: a 409 selects the existing playlist instead of erroring', async () => {
    mockedPlaylistService.createPlaylist.mockRejectedValue(
      new PlaylistConflictError({ uid: 'pl-existing', name: 'Jazz', songUids: [] }),
    );
    await openPickerAndType('Jazz');

    fireEvent.click(await screen.findByText('Create playlist "Jazz"'));

    // The existing playlist becomes a selected chip; no error toast
    await waitFor(() => expect(screen.getByTitle('Jazz')).toBeInTheDocument());
    expect(screen.queryByText('Could not create playlist')).not.toBeInTheDocument();
  });

  test('AC9: a non-conflict failure shows a toast and does not add a chip', async () => {
    mockedPlaylistService.createPlaylist.mockRejectedValue(new Error('network down'));
    await openPickerAndType('Jazz');

    fireEvent.click(await screen.findByText('Create playlist "Jazz"'));

    expect(await screen.findByText('Could not create playlist')).toBeInTheDocument();
    expect(screen.queryByTitle('Jazz')).not.toBeInTheDocument(); // no playlist chip added
  });

  test('AC11: keyboard — ArrowDown to the Create option + Enter selects it without submitting', async () => {
    mockedPlaylistService.createPlaylist.mockResolvedValue({ uid: 'pl-kbd', name: 'Blues', songUids: ['song-a'] });
    const input = await openPickerAndType('Blues');

    fireEvent.keyDown(input, { key: 'ArrowDown' }); // highlight the Create option (index 0)
    fireEvent.keyDown(input, { key: 'Enter' });     // select without submitting

    await waitFor(() =>
      expect(mockedPlaylistService.createPlaylist).toHaveBeenCalledWith({ name: 'Blues', songUids: ['song-a'] }),
    );
    expect(songService.updateSong).not.toHaveBeenCalled();
  });
});
