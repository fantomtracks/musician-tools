import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CatalogSourceBanner from '../components/CatalogSourceBanner';
import { songService, RefreshFromCatalogError } from '../services/songService';
import type { Song } from '../services/songService';

// Story 21.2 — Catalog provenance + drift/Refresh on the Song fiche.
jest.mock('../services/songService', () => {
  const actual = jest.requireActual('../services/songService');
  return {
    ...actual,
    songService: { getSong: jest.fn(), refreshSongFromCatalog: jest.fn() },
  };
});
const svc = songService as jest.Mocked<typeof songService>;

const songWith = (sourceCatalog?: Song['sourceCatalog']): Partial<Song> => ({
  uid: 's1', title: 'Zombie', key: 'C', bpm: 70, sourceCatalog,
});

const renderBanner = (
  onRefreshed?: (s: Song) => void,
  beforeRefresh?: () => Promise<boolean>,
) => render(
  <StrictMode>
    <MemoryRouter>
      <CatalogSourceBanner songUid="s1" onRefreshed={onRefreshed} beforeRefresh={beforeRefresh} />
    </MemoryRouter>
  </StrictMode>
);

// Confirm the drift dialog's "Refresh" (the LAST button so labelled) to trigger a refresh.
const confirmRefresh = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
  await screen.findByText(/Update key, BPM/);
  const confirmButtons = screen.getAllByRole('button', { name: 'Refresh' });
  fireEvent.click(confirmButtons[confirmButtons.length - 1]);
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('renders nothing when the song is not a Catalog copy', async () => {
  svc.getSong.mockResolvedValue(songWith(undefined) as Song);
  const { container } = renderBanner();
  await waitFor(() => expect(svc.getSong).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});

test('shows the provenance badge + source link, no drift banner when not drifted', async () => {
  svc.getSong.mockResolvedValue(songWith({ uid: 'cat-1', updatedAt: '2026-01-01', drift: false }) as Song);
  renderBanner();
  const link = await screen.findByRole('link', { name: 'Catalog' });
  expect(link).toHaveAttribute('href', '/catalog/cat-1');
  expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
});

test('drift → Refresh confirm → refresh succeeds → onRefreshed called, drift banner gone', async () => {
  svc.getSong.mockResolvedValue(songWith({ uid: 'cat-1', updatedAt: '2026-06-01', drift: true }) as Song);
  const refreshed = { uid: 's1', title: 'Zombie', key: 'F#', bpm: 90 } as Song;
  svc.refreshSongFromCatalog.mockResolvedValue(refreshed);
  const onRefreshed = jest.fn();
  renderBanner(onRefreshed);

  fireEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
  // confirm dialog's confirm button is also labelled "Refresh" — pick the dialog one via the message
  await screen.findByText(/Update key, BPM/);
  const confirmButtons = screen.getAllByRole('button', { name: 'Refresh' });
  fireEvent.click(confirmButtons[confirmButtons.length - 1]);

  await waitFor(() => expect(svc.refreshSongFromCatalog).toHaveBeenCalledWith('s1'));
  await waitFor(() => expect(onRefreshed).toHaveBeenCalledWith(refreshed));
  await screen.findByText('Updated to the Catalog version.');
  expect(screen.queryByText(/A newer version/)).toBeNull(); // drift banner gone
});

test('refresh fails source_unavailable → error alert, badge/banner removed', async () => {
  svc.getSong.mockResolvedValue(songWith({ uid: 'cat-1', updatedAt: '2026-06-01', drift: true }) as Song);
  svc.refreshSongFromCatalog.mockRejectedValue(new RefreshFromCatalogError('source_unavailable'));
  renderBanner();

  await confirmRefresh();

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('The source is no longer in the Catalog.');
  expect(screen.queryByRole('link', { name: 'Catalog' })).toBeNull(); // source gone → badge removed
});

test('refresh fails not_from_catalog → error alert, badge/banner removed (no dead-end)', async () => {
  svc.getSong.mockResolvedValue(songWith({ uid: 'cat-1', updatedAt: '2026-06-01', drift: true }) as Song);
  svc.refreshSongFromCatalog.mockRejectedValue(new RefreshFromCatalogError('not_from_catalog'));
  renderBanner();

  await confirmRefresh();

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('This song is no longer linked to the Catalog.');
  // both 409 codes clear the source so the user can't keep re-hitting the dead-end
  expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Catalog' })).toBeNull();
});

test('beforeRefresh runs (and resolves) BEFORE the refresh POST', async () => {
  svc.getSong.mockResolvedValue(songWith({ uid: 'cat-1', updatedAt: '2026-06-01', drift: true }) as Song);
  svc.refreshSongFromCatalog.mockResolvedValue({ uid: 's1', title: 'Zombie' } as Song);
  const order: string[] = [];
  const beforeRefresh = jest.fn(async () => { order.push('flush'); return true; });
  svc.refreshSongFromCatalog.mockImplementation(async () => { order.push('refresh'); return { uid: 's1' } as Song; });
  renderBanner(undefined, beforeRefresh);

  await confirmRefresh();

  await waitFor(() => expect(svc.refreshSongFromCatalog).toHaveBeenCalled());
  expect(beforeRefresh).toHaveBeenCalledTimes(1);
  expect(order).toEqual(['flush', 'refresh']); // pending edits persisted before the refresh reads the row
  await screen.findByText('Updated to the Catalog version.');
});

test('beforeRefresh returning false CANCELS the refresh (unsaved edits kept)', async () => {
  svc.getSong.mockResolvedValue(songWith({ uid: 'cat-1', updatedAt: '2026-06-01', drift: true }) as Song);
  const beforeRefresh = jest.fn(async () => false); // a needed save failed
  renderBanner(undefined, beforeRefresh);

  await confirmRefresh();

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Could not save your changes — refresh cancelled.');
  expect(svc.refreshSongFromCatalog).not.toHaveBeenCalled(); // never reached the POST
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument(); // still offered
});
