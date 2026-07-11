import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderSongs } from '../test/renderSongs';

// Let pending promises + effects settle (the editing-data effect re-seeds the
// playlist selection behind an async getPlays — we must observe the SETTLED DOM,
// not the transient frame before the seed runs).
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

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
      // Story 13.1: toggling a playlist in edit mode now persists immediately.
      addSongToPlaylist: jest.fn().mockResolvedValue({}),
      removeSongFromPlaylist: jest.fn().mockResolvedValue({}),
    },
  };
});

import { playlistService, PlaylistConflictError, type Playlist } from '../services/playlistService';
import { songService } from '../services/songService';

const mockedPlaylistService = playlistService as jest.Mocked<typeof playlistService>;

const PLACEHOLDER = 'Search, select or create a playlist';


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

  test('AC8: a 409 selects the existing playlist, and it STAYS selected (no reseed clobber)', async () => {
    // A non-empty catalog (that does NOT contain the typed name) so the seed effect
    // locks; the 409 returns an existing playlist that does NOT contain the song.
    mockedPlaylistService.getAllPlaylists.mockResolvedValue([{ uid: 'pl-other', name: 'Other', songUids: [] }]);
    mockedPlaylistService.createPlaylist.mockRejectedValue(
      new PlaylistConflictError({ uid: 'pl-existing', name: 'Jazz', songUids: [] }),
    );
    await openPickerAndType('Jazz');

    fireEvent.click(await screen.findByText('Create playlist "Jazz"'));

    // The existing playlist becomes a selected chip — and survives the seed effect
    // that re-fires when `playlists` is updated (the bug this guards against).
    expect(await screen.findByTitle('Jazz')).toBeInTheDocument();
    await settle();
    expect(screen.getByTitle('Jazz')).toBeInTheDocument(); // still there after the reseed
    expect(screen.queryByText('Could not create playlist')).not.toBeInTheDocument();
  });

  test('AC10: creating on the fly keeps a pending toggle of an existing playlist', async () => {
    // 'Keep' exists but does not contain the song; the user toggles it ON (unsaved),
    // then creates a new playlist on the fly — 'Keep' must remain selected.
    mockedPlaylistService.getAllPlaylists.mockResolvedValue([{ uid: 'pl-keep', name: 'Keep', songUids: [] }]);
    mockedPlaylistService.createPlaylist.mockResolvedValue({ uid: 'pl-new', name: 'New set', songUids: ['song-a'] });

    const input = await openPickerAndType('');
    fireEvent.click(await screen.findByRole('option', { name: 'Keep' })); // toggle it ON
    await waitFor(() => expect(screen.getByTitle('Keep')).toBeInTheDocument());

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'New set' } });
    fireEvent.click(await screen.findByText('Create playlist "New set"'));

    // Both survive the seed effect that re-fires on the new `playlists` value.
    expect(await screen.findByTitle('New set')).toBeInTheDocument();
    await settle();
    expect(screen.getByTitle('New set')).toBeInTheDocument();
    expect(screen.getByTitle('Keep')).toBeInTheDocument(); // pending toggle not clobbered
  });

  test('AC9: a non-conflict failure shows a toast and does not add a chip', async () => {
    mockedPlaylistService.createPlaylist.mockRejectedValue(new Error('network down'));
    await openPickerAndType('Jazz');

    fireEvent.click(await screen.findByText('Create playlist "Jazz"'));

    expect(await screen.findByText('Could not create playlist')).toBeInTheDocument();
    expect(screen.queryByTitle('Jazz')).not.toBeInTheDocument(); // no playlist chip added
  });

  test('10-2 deferred: a rapid double-trigger fires createPlaylist only once (in-flight guard)', async () => {
    // Hold createPlaylist pending so the 2nd click lands while the 1st is in flight.
    let resolveCreate!: (v: Playlist) => void;
    mockedPlaylistService.createPlaylist.mockImplementation(
      () => new Promise<Playlist>((r) => { resolveCreate = r; }),
    );
    await openPickerAndType('Jazz');

    const createOption = await screen.findByText('Create playlist "Jazz"');
    fireEvent.click(createOption);
    fireEvent.click(createOption); // 2nd trigger before the 1st resolves → must be a no-op

    expect(mockedPlaylistService.createPlaylist).toHaveBeenCalledTimes(1);

    await act(async () => { resolveCreate({ uid: 'pl-new', name: 'Jazz', songUids: ['song-a'] }); });
    await settle();
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
