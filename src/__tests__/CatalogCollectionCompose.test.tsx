import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CatalogCollectionCompose from '../pages/CatalogCollectionCompose';
import { useAuth } from '../contexts/AuthContext';
import { catalogService, CollectionNotFoundError } from '../services/catalogService';

// Story 20.2 — the curator Collection composer (/catalog/manage/collections/:uid).
jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../services/catalogService', () => {
  const actual = jest.requireActual('../services/catalogService');
  return {
    ...actual,
    catalogService: {
      getCollection: jest.fn(),
      listCatalog: jest.fn(),
      addSongToCollection: jest.fn(),
      removeSongFromCollection: jest.fn(),
      updateCollection: jest.fn(),
      deleteCollection: jest.fn(),
    },
  };
});

const mockedUseAuth = useAuth as jest.Mock;
const cat = catalogService as jest.Mocked<typeof catalogService>;

const detail = {
  uid: 'col1',
  name: 'Rock 90s',
  description: null,
  songs: [
    { uid: 's1', title: 'Zombie', artist: 'The Cranberries', key: 'Em', bpm: 84, publishedAt: '2026-01-01' },
  ],
};

const renderCompose = () => render(
  <StrictMode>
    <MemoryRouter initialEntries={['/catalog/manage/collections/col1']}>
      <Routes>
        <Route path="/catalog/manage/collections/:uid" element={<CatalogCollectionCompose />} />
        <Route path="/catalog/manage" element={<div>hub-marker</div>} />
        <Route path="/" element={<div>home-marker</div>} />
      </Routes>
    </MemoryRouter>
  </StrictMode>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseAuth.mockReturnValue({ user: { uid: 'u1', isCurator: true } });
  cat.getCollection.mockResolvedValue(detail);
  cat.listCatalog.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 });
  cat.addSongToCollection.mockResolvedValue(undefined);
  cat.removeSongFromCollection.mockResolvedValue(undefined);
  cat.updateCollection.mockResolvedValue({ uid: 'col1', name: 'Renamed', description: null });
  cat.deleteCollection.mockResolvedValue(undefined);
});

test('renders the collection name and its members', async () => {
  renderCompose();
  await screen.findByText('Rock 90s');
  expect(screen.getByText(/Zombie/)).toBeInTheDocument();
});

test('a non-curator is redirected home', async () => {
  mockedUseAuth.mockReturnValue({ user: { uid: 'u1', isCurator: false } });
  renderCompose();
  await screen.findByText('home-marker');
});

test('a 404 shows a calm not-found panel', async () => {
  cat.getCollection.mockRejectedValue(new CollectionNotFoundError());
  renderCompose();
  await screen.findByText('This collection no longer exists.');
});

test('searching then clicking a result adds it to the collection', async () => {
  cat.listCatalog.mockResolvedValue({
    items: [{ uid: 's2', title: 'Creep', artist: 'Radiohead', publishedAt: '2026-01-01' }],
    total: 1, page: 1, limit: 10,
  });
  renderCompose();
  await screen.findByText('Rock 90s');
  fireEvent.change(screen.getByLabelText('Add an entry'), { target: { value: 'creep' } });
  // debounced search → result option appears
  const option = await screen.findByText('Radiohead · Creep');
  fireEvent.click(option);
  await waitFor(() => expect(cat.addSongToCollection).toHaveBeenCalledWith('col1', 's2'));
  // Adding a member must NOT refetch the search nor reopen the dropdown (patch 20.2).
  expect(cat.listCatalog).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('option')).toBeNull();
});

test('Remove detaches a member and drops it from the list', async () => {
  renderCompose();
  await screen.findByText('Rock 90s');
  fireEvent.click(screen.getByRole('button', { name: 'Remove Zombie' }));
  await waitFor(() => expect(cat.removeSongFromCollection).toHaveBeenCalledWith('col1', 's1'));
  expect(screen.queryByRole('button', { name: 'Remove Zombie' })).toBeNull();
});

test('Delete collection confirms then deletes and returns to the hub', async () => {
  renderCompose();
  await screen.findByText('Rock 90s');
  fireEvent.click(screen.getByRole('button', { name: 'Delete collection' }));
  // ConfirmDialog now open — confirm
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(cat.deleteCollection).toHaveBeenCalledWith('col1'));
  await screen.findByText('hub-marker');
});
