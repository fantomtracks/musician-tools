import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CatalogCollection from '../pages/CatalogCollection';
import { catalogService, CollectionNotFoundError } from '../services/catalogService';

// Story 20.4 — user-facing Collection detail + whole-collection import.
jest.mock('../services/catalogService', () => {
  const actual = jest.requireActual('../services/catalogService');
  return {
    ...actual,
    catalogService: { getCollection: jest.fn(), importCollection: jest.fn() },
  };
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
  await screen.findByText('Added 18 · 2 already in your songlist');
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
