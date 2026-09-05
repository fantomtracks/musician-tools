import { StrictMode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MusicBrainzImportButton from '../components/MusicBrainzImportButton';
import { songService, SongConflictError } from '../services/songService';
import type { MusicBrainzHit } from '../services/catalogService';
import type { Song } from '../services/songService';

jest.mock('../services/songService', () => {
  const actual = jest.requireActual('../services/songService');
  return { ...actual, songService: { createSong: jest.fn() } };
});

const HIT: MusicBrainzHit = { mbid: 'mb-1', title: 'Linger', artist: 'The Cranberries', album: 'No Need to Argue', durationSeconds: 274 };
const SONG = { uid: 'song-1', title: 'Linger', artist: 'The Cranberries' } as Song;
const svc = songService as jest.Mocked<typeof songService>;

const renderBtn = (existingSong: Song | null = null) =>
  render(
    <StrictMode>
      <MemoryRouter><MusicBrainzImportButton hit={HIT} existingSong={existingSong} /></MemoryRouter>
    </StrictMode>,
  );

beforeEach(() => { jest.clearAllMocks(); });

test('default → Import song; clicking it creates a songlist entry', async () => {
  svc.createSong.mockResolvedValue(SONG);
  renderBtn();
  fireEvent.click(screen.getByRole('button', { name: /Import "Linger" to my songlist/i }));
  expect(svc.createSong).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Linger',
    artist: 'The Cranberries',
    album: 'No Need to Argue',
    durationSeconds: 274,
  }));
  const already = await screen.findByText(/Already in your songlist/i);
  expect(already.closest('a')).toHaveAttribute('href', '/songs/song-1');
});

test('a known duplicate is born as Already in your songlist, no Import button', () => {
  renderBtn(SONG);
  const already = screen.getByText(/Already in your songlist/i);
  expect(already.closest('a')).toHaveAttribute('href', '/songs/song-1');
  expect(screen.queryByRole('button', { name: /Import/i })).toBeNull();
});

test('a 409 on import flips to Already in your songlist with the existing song', async () => {
  svc.createSong.mockRejectedValue(new SongConflictError(SONG));
  renderBtn();
  fireEvent.click(screen.getByRole('button', { name: /Import/i }));
  const already = await screen.findByText(/Already in your songlist/i);
  expect(already.closest('a')).toHaveAttribute('href', '/songs/song-1');
});

test('a network error reverts to Import and is retryable', async () => {
  svc.createSong.mockRejectedValue(new Error('boom'));
  renderBtn();
  fireEvent.click(screen.getByRole('button', { name: /Import/i }));
  await screen.findByText(/Couldn’t import — try again/i);
  expect(screen.getByRole('button', { name: /Import/i })).toBeEnabled();
});
