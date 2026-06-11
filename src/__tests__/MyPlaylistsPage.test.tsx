import { render, screen } from '@testing-library/react';
import MyPlaylistsPage from '../pages/MyPlaylistsPage';
import { playlistService } from '../services/playlistService';
import { songService } from '../services/songService';

jest.mock('../services/playlistService', () => ({
  playlistService: {
    getAllPlaylists: jest.fn(),
    createPlaylist: jest.fn(),
    updatePlaylist: jest.fn(),
    deletePlaylist: jest.fn(),
  },
}));

jest.mock('../services/songService', () => ({
  songService: {
    getAllSongs: jest.fn(),
  },
}));

// useAuth only keeps the auth context alive here; a no-op stub is enough
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({}) }));

const mockedPlaylist = playlistService as jest.Mocked<typeof playlistService>;
const mockedSong = songService as jest.Mocked<typeof songService>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedPlaylist.getAllPlaylists.mockResolvedValue([]);
  mockedSong.getAllSongs.mockResolvedValue([]);
});

test('a playlist song renders as "Artist - Title"', async () => {
  mockedSong.getAllSongs.mockResolvedValue([
    { uid: 'known-uid', title: 'Sweet Child', artist: "Guns N' Roses" } as never,
  ]);
  mockedPlaylist.getAllPlaylists.mockResolvedValue([
    { uid: 'pl-1', name: 'My set', songUids: ['known-uid'] } as never,
  ]);

  render(<MyPlaylistsPage />);

  expect(await screen.findByText("Guns N' Roses - Sweet Child")).toBeInTheDocument();
});

test('Story 5.6: an orphan song UID (deleted song) is hidden, never shown as a raw hash', async () => {
  mockedSong.getAllSongs.mockResolvedValue([
    { uid: 'known-uid', title: 'Sweet Child', artist: "Guns N' Roses" } as never,
  ]);
  mockedPlaylist.getAllPlaylists.mockResolvedValue([
    { uid: 'pl-1', name: 'My set', songUids: ['known-uid', 'orphan-uid-1234'] } as never,
  ]);

  render(<MyPlaylistsPage />);

  // The known song appears once the catalog loads...
  expect(await screen.findByText("Guns N' Roses - Sweet Child")).toBeInTheDocument();
  // ...but the orphan UID is never rendered as a raw hash
  expect(screen.queryByText('orphan-uid-1234')).not.toBeInTheDocument();
});

test('Story 5.6 (review): when the song catalog fails to load, playlist songs are NOT blanked out', async () => {
  // Catalog load fails → we cannot tell orphans from valid songs, so the list
  // must keep showing the reference (degraded), never hide real content.
  mockedSong.getAllSongs.mockRejectedValue(new Error('Failed to load songs'));
  mockedPlaylist.getAllPlaylists.mockResolvedValue([
    { uid: 'pl-1', name: 'My set', songUids: ['known-uid'] } as never,
  ]);

  render(<MyPlaylistsPage />);

  // The reference is still rendered (as its UID, unresolved) rather than vanishing
  expect(await screen.findByText('known-uid')).toBeInTheDocument();
});
