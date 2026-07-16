import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderSongs } from '../test/renderSongs';

jest.mock('../services/songService', () => ({
  songService: {
    // At least one song so the list + sidebar render (an EMPTY songlist now shows the
    // Catalog "Browse the Catalog" hook instead of the list — story 19.4 / DL-13).
    getAllSongs: jest.fn().mockResolvedValue([{ uid: 'song-1', title: 'Alpha', artist: 'A' }]),
    updateSong: jest.fn().mockResolvedValue({}),
    createSong: jest.fn().mockResolvedValue({}),
    deleteSong: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../services/instrumentService', () => ({
  instrumentService: {
    getAll: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../services/songPlayService', () => ({
  songPlayService: {
    getPlays: jest.fn().mockResolvedValue([]),
    markPlayed: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../services/playlistService', () => ({
  playlistService: {
    getAllPlaylists: jest.fn().mockResolvedValue([]),
  },
}));

describe('Songs sidebar persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  test('restores collapsed state from localStorage and persists expand', async () => {
    localStorage.setItem('songsSidebarExpanded', 'false');

    renderSongs();

    // Collapsed (desktop rail): the "Expand sidebar" » control is rendered.
    // NB: since 14.3 the full filter content is always in the DOM (CSS-gated by
    // breakpoint), so the collapsed/expanded discriminator is the » rail button,
    // which only renders while collapsed.
    expect(screen.getByLabelText('Expand sidebar')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Expand sidebar'));

    await waitFor(() => expect(screen.queryByLabelText('Expand sidebar')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Collapse sidebar')).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem('songsSidebarExpanded')).toBe('true'));
  });
});
