import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderSongs } from '../test/renderSongs';

// Two songs sharing the artist 'A', so renaming Alpha's title to 'Beta' makes a
// live duplicate (title+artist match) — used for the freeze test.
jest.mock('../services/songService', () => ({
  // Spread the real module so the SongConflictError class stays available (the
  // source imports it for the 409 branch); only the service object is mocked.
  ...jest.requireActual('../services/songService'),
  songService: {
    getAllSongs: jest.fn().mockResolvedValue([
      { uid: 'song-a', title: 'Alpha', artist: 'A', instrument: ['Guitar'] },
      { uid: 'song-b', title: 'Beta', artist: 'A', instrument: ['Guitar'] },
    ]),
    updateSong: jest.fn().mockResolvedValue({ uid: 'song-a', title: 'Alpha', artist: 'A', instrument: ['Guitar'] }),
    createSong: jest.fn().mockResolvedValue({}),
    deleteSong: jest.fn().mockResolvedValue(undefined),
    getSong: jest.fn(),
  },
}));
jest.mock('../services/instrumentService', () => ({ instrumentService: { getAll: jest.fn().mockResolvedValue([]) } }));
jest.mock('../services/songPlayService', () => ({
  songPlayService: { getPlays: jest.fn().mockResolvedValue([]), markPlayed: jest.fn().mockResolvedValue({}), getLastPlayForInstrument: jest.fn() },
}));
jest.mock('../services/playlistService', () => ({
  playlistService: { getAllPlaylists: jest.fn().mockResolvedValue([]), addSongToPlaylist: jest.fn(), removeSongFromPlaylist: jest.fn(), updatePlaylist: jest.fn() },
}));

import { songService, SongConflictError } from '../services/songService';
import { playlistService } from '../services/playlistService';
const updateSong = songService.updateSong as jest.Mock;
const createSong = songService.createSong as jest.Mock;
const deleteSong = songService.deleteSong as jest.Mock;


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

  test('a duplicate title blocks the save entirely — nothing is persisted (17.2 hardens 13.1)', async () => {
    renderSongs();
    fireEvent.click(await screen.findByText('Alpha'));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Beta' } }); // Beta + A → live duplicate
    // The debounce fires, but the duplicate blocks the write: no update at all
    // (was "freeze identity but save the rest" in 13.1).
    await screen.findByText(/not saved — already exists/i, undefined, { timeout: 2500 });
    expect(updateSong).not.toHaveBeenCalled();
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

describe('Songs — auto-create at debounce (story 17.2)', () => {
  const openAddForm = async () => {
    renderSongs();
    fireEvent.click(await screen.findByRole('button', { name: /add a song/i }));
  };

  test('typing a title auto-creates at the debounce and stays on the form (invisible add→edit)', async () => {
    createSong.mockResolvedValueOnce({ uid: 'new-1', title: 'Fresh Tune', artist: '', instrument: [] });
    await openAddForm();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Fresh Tune' } });

    await waitFor(() => expect(createSong).toHaveBeenCalledTimes(1), { timeout: 2500 });
    expect(createSong.mock.calls[0][0]).toEqual(expect.objectContaining({ title: 'Fresh Tune' }));
    // No redirect to the list — still on the form, now saved.
    expect(screen.getByRole('button', { name: /back to songlist/i })).toBeInTheDocument();
    await screen.findByText(/saved/i);
  });

  test('an empty title never creates a song', async () => {
    await openAddForm();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '   ' } }); // whitespace only
    await new Promise(r => setTimeout(r, 1500)); // let a debounce elapse
    expect(createSong).not.toHaveBeenCalled();
  });

  test('a slow create is not double-fired by a second debounce (in-flight lock)', async () => {
    let resolveCreate!: (v: unknown) => void;
    createSong.mockImplementationOnce(() => new Promise(res => { resolveCreate = res; }));
    await openAddForm();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'InFlight' } });
    await waitFor(() => expect(createSong).toHaveBeenCalledTimes(1), { timeout: 2500 });
    // Type more while the create is still in flight → a new debounce fires, but the
    // in-flight lock blocks a second create.
    fireEvent.change(screen.getByLabelText('Artist'), { target: { value: 'X' } });
    await new Promise(r => setTimeout(r, 1500));
    expect(createSong).toHaveBeenCalledTimes(1);
    resolveCreate({ uid: 'new-2', title: 'InFlight', artist: 'X', instrument: [] });
  });

  test('leaving while a create is in flight keeps the song without stranding editing or a false toast (HIGH regression)', async () => {
    let resolveCreate!: (v: unknown) => void;
    createSong.mockImplementationOnce(() => new Promise(res => { resolveCreate = res; }));
    await openAddForm();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Slow' } });
    await waitFor(() => expect(createSong).toHaveBeenCalledTimes(1), { timeout: 2500 });
    // Leave to the list WHILE the create is still in flight.
    fireEvent.click(screen.getByRole('button', { name: /back to songlist/i }));
    // Now the create resolves: the song is kept, but editing must NOT be re-armed on
    // the list (that stranded editingUid → the next nav silently deleted the song).
    resolveCreate({ uid: 'slow-1', title: 'Slow', artist: '', instrument: [] });
    await waitFor(() => expect(screen.queryByRole('button', { name: /back to songlist/i })).not.toBeInTheDocument());
    expect(screen.queryByText(/could not be saved/i)).not.toBeInTheDocument(); // no false failure toast
    expect(deleteSong).not.toHaveBeenCalled(); // the created song is kept, not silently removed
  });

  test('a failed create keeps the draft and shows "Not saved — retrying"', async () => {
    createSong.mockRejectedValueOnce(new Error('network'));
    await openAddForm();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Boom' } });
    await screen.findByText(/not saved — retrying/i, undefined, { timeout: 2500 });
  });

  test('a 409 on create blocks and surfaces "already exists" (no song persisted)', async () => {
    createSong.mockRejectedValueOnce(new SongConflictError({ uid: 'existing', title: 'Dup', artist: '', instrument: [] } as never));
    await openAddForm();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Dup' } });
    const hits = await screen.findAllByText(/already exists/i, undefined, { timeout: 2500 });
    expect(hits.length).toBeGreaterThan(0);
  });

  test('a 409 on update blocks the edit and surfaces "already exists"', async () => {
    updateSong.mockRejectedValueOnce(new SongConflictError({ uid: 'song-b', title: 'Beta', artist: 'A', instrument: [] } as never));
    renderSongs();
    fireEvent.click(await screen.findByText('Alpha'));
    fireEvent.change(screen.getByLabelText('Artist'), { target: { value: 'Unique Artist' } }); // no client-side dup
    const hits = await screen.findAllByText(/already exists/i, undefined, { timeout: 2500 });
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe('Songs — empty-title Seuil 1 on leave (story 17.2)', () => {
  test('emptying the title of a fresh auto-created song deletes it silently on leave', async () => {
    createSong.mockResolvedValueOnce({ uid: 'new-3', title: 'Temp', artist: '', instrument: [] });
    renderSongs();
    fireEvent.click(await screen.findByRole('button', { name: /add a song/i }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Temp' } });
    await waitFor(() => expect(createSong).toHaveBeenCalledTimes(1), { timeout: 2500 });

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /back to songlist/i }));

    await waitFor(() => expect(deleteSong).toHaveBeenCalledWith('new-3'));
    expect(screen.queryByText(/no title anymore/i)).not.toBeInTheDocument(); // silent, no popup
  });

  test('emptying the title of a song with value shows the popup (not silent)', async () => {
    renderSongs();
    fireEvent.click(await screen.findByText('Alpha')); // existing song → has value
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /back to songlist/i }));

    await screen.findByText(/no title anymore/i);
    expect(deleteSong).not.toHaveBeenCalled();
  });

  test('confirming Delete in the popup removes the song and leaves', async () => {
    renderSongs();
    fireEvent.click(await screen.findByText('Alpha'));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /back to songlist/i }));
    await screen.findByText(/no title anymore/i);

    // The popup's Delete (not the SongForm's Delete) — scope to the dialog.
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(deleteSong).toHaveBeenCalledWith('song-a'));
  });
});

describe('Songs — routes & deep-links (story 18.2)', () => {
  const getSong = songService.getSong as jest.Mock;

  test('deep-link to /songs/:uid opens the edit form (refresh keeps the song)', async () => {
    getSong.mockResolvedValueOnce({ uid: 'deep-1', title: 'Deep Cut', artist: 'Z', instrument: ['Guitar'] });
    renderSongs('/songs/deep-1');
    // The form is shown (Back to songlist bar), loaded from getSong, not the list.
    expect(await screen.findByRole('button', { name: /back to songlist/i })).toBeInTheDocument();
    expect((await screen.findByLabelText('Title') as HTMLInputElement).value).toBe('Deep Cut');
    expect(getSong).toHaveBeenCalledWith('deep-1');
  });

  test('deep-link to an unknown/foreign song uid shows "Song not found" (scoped 404)', async () => {
    getSong.mockRejectedValueOnce(new Error('not found'));
    renderSongs('/songs/ghost');
    expect(await screen.findByText(/song not found/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  });

  test('the "Add a song" entry navigates to the add form', async () => {
    renderSongs();
    fireEvent.click(await screen.findByRole('button', { name: /add a song/i }));
    // Blank add form: Title empty, still on the form (Back bar present).
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: /back to songlist/i })).toBeInTheDocument();
  });
});
