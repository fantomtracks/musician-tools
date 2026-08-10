import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CatalogCollection from '../pages/CatalogCollection';
import { catalogService, CollectionNotFoundError } from '../services/catalogService';

// Story 20.4 — user-facing Collection detail + whole-collection import.
jest.mock('../services/catalogService', () => {
  const actual = jest.requireActual('../services/catalogService');
  const { makeCatalogServiceMock } = jest.requireActual('../test/catalogServiceMock');
  return { ...actual, catalogService: makeCatalogServiceMock() };
});
const cat = catalogService as jest.Mocked<typeof catalogService>;

const detail = {
  uid: 'col1',
  name: 'Rock 90s',
  description: 'The best of the 90s',
  songs: [
    { uid: 's1', title: 'Zombie', artist: 'The Cranberries', key: 'Em', bpm: 84, publishedAt: '2026-01-01' },
    { uid: 's2', title: 'Creep', artist: 'Radiohead', publishedAt: '2026-01-01' },
  ],
};

const renderDetail = () => render(
  <StrictMode>
    <MemoryRouter initialEntries={['/catalog/collections/col1']}>
      <Routes>
        <Route path="/catalog/collections/:uid" element={<CatalogCollection />} />
        <Route path="/catalog" element={<div>catalog-marker</div>} />
      </Routes>
    </MemoryRouter>
  </StrictMode>
);

beforeEach(() => {
  jest.clearAllMocks();
  cat.getCollection.mockResolvedValue(detail);
  cat.importCollection.mockResolvedValue({ added: 18, skipped: 2, failed: 0, playlistUid: 'p1' });
});

test('renders the name, description, count and members', async () => {
  renderDetail();
  await screen.findByText('Rock 90s');
  expect(screen.getByText('The best of the 90s')).toBeInTheDocument();
  expect(screen.getByText('2 songs')).toBeInTheDocument();
  expect(screen.getByText(/Zombie/)).toBeInTheDocument();
});

test('a 404 shows a calm not-found panel', async () => {
  cat.getCollection.mockRejectedValue(new CollectionNotFoundError());
  renderDetail();
  await screen.findByText('This collection no longer exists.');
});

test('import: confirm dialog then recap toast', async () => {
  renderDetail();
  await screen.findByText('Rock 90s');
  fireEvent.click(screen.getByRole('button', { name: 'Add collection to my songlist' }));
  // ConfirmDialog announces N + name
  expect(screen.getByText(/Add 2 songs to your Songlist\?/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add to my songlist' }));
  await waitFor(() => expect(cat.importCollection).toHaveBeenCalledWith('col1'));
  // Persistent inline result banner with the clarified copy.
  await screen.findByText('Added 18 songs · 2 already in your songlist');
});

test('re-import (all already owned) reads clearly, no "Added 0"', async () => {
  cat.importCollection.mockResolvedValue({ added: 0, skipped: 3, failed: 0, playlistUid: 'p1' });
  renderDetail();
  await screen.findByText('Rock 90s');
  fireEvent.click(screen.getByRole('button', { name: 'Add collection to my songlist' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add to my songlist' }));
  const banner = await screen.findByText('3 already in your songlist');
  expect(banner).toBeInTheDocument();
  expect(screen.queryByText(/Added 0/)).toBeNull();
});

test('import failure surfaces an assertive error toast (role=alert)', async () => {
  cat.importCollection.mockRejectedValue(new Error('network'));
  renderDetail();
  await screen.findByText('Rock 90s');
  fireEvent.click(screen.getByRole('button', { name: 'Add collection to my songlist' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add to my songlist' }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Could not import the collection.');
});

// ---------------------------------------------------------------------------
// Story 22.4 — selectable table + "Add selected to my songlist"
// ---------------------------------------------------------------------------

test('22.4: members are a table with checkboxes, and the whole-collection shortcut stays', async () => {
  renderDetail();
  await screen.findByText('Rock 90s');

  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(screen.getByLabelText('Select all')).toBeInTheDocument();
  // The 20.3 import shortcut is untouched.
  expect(screen.getByRole('button', { name: 'Add collection to my songlist' })).toBeInTheDocument();
});

test('22.4: the subset dialog says no playlist is created, unlike the whole-collection one', async () => {
  renderDetail();
  await screen.findByText('Rock 90s');

  fireEvent.click(screen.getByLabelText('Select all'));
  fireEvent.click(screen.getByRole('button', { name: 'Add selected to my songlist' }));

  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent(/No playlist is created/i);
});

test('22.4: the whole-collection import stays frozen while a selection batch runs', async () => {
  const releases: Array<() => void> = [];
  cat.addToSonglist.mockImplementation(() => new Promise(res => { releases.push(() => res({ uid: 'x' } as never)); }));
  renderDetail();
  await screen.findByText('Rock 90s');

  fireEvent.click(screen.getByLabelText('Select all'));
  fireEvent.click(screen.getByRole('button', { name: 'Add selected to my songlist' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Add to my songlist' }));

  // The dialog closes only AFTER the batch settles, so asserting on the button alone
  // would pass on `confirmAddOpen` and never test `bulkAdd.running`. Go through the
  // handler instead: the two write paths must not interleave.
  await waitFor(() => expect(cat.addToSonglist).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Add collection to my songlist' }));
  expect(cat.importCollection).not.toHaveBeenCalled();

  await act(async () => { releases.forEach(r => r()); });
});
