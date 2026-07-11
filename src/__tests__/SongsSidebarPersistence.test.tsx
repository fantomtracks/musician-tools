import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderSongs } from '../test/renderSongs';

jest.mock('../services/songService', () => ({
  songService: {
    getAllSongs: jest.fn().mockResolvedValue([]),
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
