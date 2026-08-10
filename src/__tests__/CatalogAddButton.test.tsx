import { StrictMode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CatalogAddButton from '../components/CatalogAddButton';
import { catalogService, CatalogNotFoundError } from '../services/catalogService';
import { SongConflictError } from '../services/songService';
import type { CatalogSong } from '../services/catalogService';
import type { Song } from '../services/songService';

jest.mock('../services/catalogService', () => {
  const actual = jest.requireActual('../services/catalogService');
  const { makeCatalogServiceMock } = jest.requireActual('../test/catalogServiceMock');
  return { ...actual, catalogService: makeCatalogServiceMock() };
});
const cat = catalogService as jest.Mocked<typeof catalogService>;

const ENTRY = { uid: 'cat-1', title: 'Zombie', artist: 'The Cranberries' } as CatalogSong;
const SONG = { uid: 'song-1', title: 'Zombie' } as Song;

// Wrapped in StrictMode BY DEFAULT — the app mounts under StrictMode, whose dev
// mount→cleanup→mount double-invoke surfaced the mountedRef-freeze bug that a
// single-pass render hid (Epic 18 retro lesson).
const renderBtn = (existingSong: Song | null = null) =>
  render(
    <StrictMode>
      <MemoryRouter><CatalogAddButton entry={ENTRY} existingSong={existingSong} /></MemoryRouter>
    </StrictMode>,
  );

beforeEach(() => { jest.clearAllMocks(); });

test('default → Add; clicking it adds and lands on "Already in your songlist"', async () => {
  cat.addToSonglist.mockResolvedValue(SONG);
  renderBtn();
  fireEvent.click(screen.getByRole('button', { name: /Add "Zombie" to my songlist/i }));
  expect(cat.addToSonglist).toHaveBeenCalledWith('cat-1');
  const already = await screen.findByText(/Already in your songlist/i);
  expect(already.closest('a')).toHaveAttribute('href', '/songs/song-1');
});

test('a known duplicate is born as "Already in your songlist" (clickable), no Add button', () => {
  renderBtn(SONG);
  const already = screen.getByText(/Already in your songlist/i);
  expect(already.closest('a')).toHaveAttribute('href', '/songs/song-1');
  expect(screen.queryByRole('button', { name: /Add/i })).toBeNull();
});

test('a 409 on add flips to "Already in your songlist" with the existing song', async () => {
  cat.addToSonglist.mockRejectedValue(new SongConflictError(SONG));
  renderBtn();
  fireEvent.click(screen.getByRole('button', { name: /Add/i }));
  const already = await screen.findByText(/Already in your songlist/i);
  expect(already.closest('a')).toHaveAttribute('href', '/songs/song-1');
});

test('a network error reverts to Add and is retryable', async () => {
  cat.addToSonglist.mockRejectedValue(new Error('boom'));
  renderBtn();
  fireEvent.click(screen.getByRole('button', { name: /Add/i }));
  await screen.findByText(/Couldn’t add — try again/i);
  // still an Add button (re-tentable), not a red/disabled dead-end
  expect(screen.getByRole('button', { name: /Add/i })).toBeEnabled();
});

test('a 404 (entry removed from the Catalog) shows a permanent, non-retryable message', async () => {
  cat.addToSonglist.mockRejectedValue(new CatalogNotFoundError());
  renderBtn();
  fireEvent.click(screen.getByRole('button', { name: /Add/i }));
  await screen.findByText(/no longer in the Catalog/i);
  expect(screen.queryByRole('button', { name: /Add/i })).toBeNull(); // not retryable
});
