import { screen } from '@testing-library/react';
import { renderSongs } from '../test/renderSongs';

// Story 19.4 (DL-13): an empty songlist shows the "Browse the Catalog" hook.

jest.mock('../services/songService', () => ({
  songService: {
    getAllSongs: jest.fn().mockResolvedValue([]), // empty songlist
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
    getPlays: jest.fn().mockResolvedValue([]),
    markPlayed: jest.fn().mockResolvedValue({}),
    getLastPlayForInstrument: jest.fn(),
  },
}));
jest.mock('../services/playlistService', () => ({
  playlistService: { getAllPlaylists: jest.fn().mockResolvedValue([]) },
}));

test('an empty songlist shows the Browse the Catalog hook + a manual-add fallback (DL-13)', async () => {
  renderSongs();
  await screen.findByText('Your songlist is empty');
  expect(screen.getByRole('button', { name: /Browse the Catalog/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /add a song manually/i })).toBeInTheDocument();
});
