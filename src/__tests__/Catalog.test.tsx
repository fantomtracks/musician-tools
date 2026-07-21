import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Catalog from '../pages/Catalog';
import { catalogService } from '../services/catalogService';
import type { CatalogSong } from '../services/catalogService';

jest.mock('../services/catalogService', () => {
  const actual = jest.requireActual('../services/catalogService');
  return { ...actual, catalogService: { listCatalog: jest.fn(), getFacets: jest.fn(), listCollections: jest.fn() } };
});
const svc = catalogService as jest.Mocked<typeof catalogService>;

const resp = (items: Partial<CatalogSong>[], total = items.length) => ({ items: items as CatalogSong[], total, page: 1, limit: 24 });

beforeEach(() => {
  jest.clearAllMocks();
  svc.getFacets.mockResolvedValue({ genre: [], key: [], mode: [], timeSignature: [] });
  svc.listCollections.mockResolvedValue([]); // no rail by default; rail tests override
});

test('renders the list with the "All songs" title (no query)', async () => {
  svc.listCatalog.mockResolvedValue(resp([{ uid: 'a', title: 'Zombie', artist: 'The Cranberries', key: 'Em', bpm: 84 }]));
  render(<MemoryRouter initialEntries={['/catalog']}><Catalog /></MemoryRouter>);
  await screen.findByText('Zombie');
  expect(screen.getByText('All songs')).toBeInTheDocument();
});

test('typing a search debounces into a fetch and switches the title to Results (n)', async () => {
  svc.listCatalog.mockResolvedValue(resp([]));
  render(<MemoryRouter initialEntries={['/catalog']}><Catalog /></MemoryRouter>);
  await waitFor(() => expect(svc.listCatalog).toHaveBeenCalled());

  svc.listCatalog.mockResolvedValue(resp([{ uid: 'a', title: 'Zombie', artist: 'The Cranberries' }], 1));
  fireEvent.change(screen.getByLabelText('Search the catalog'), { target: { value: 'zombie' } });

  await waitFor(() => expect(svc.listCatalog).toHaveBeenCalledWith(expect.objectContaining({ search: 'zombie' }), expect.anything()));
  await screen.findByText('Results (1)');
});

test('empty results show the no-match message when a query is active', async () => {
  svc.listCatalog.mockResolvedValue(resp([]));
  render(<MemoryRouter initialEntries={['/catalog?search=zzz']}><Catalog /></MemoryRouter>);
  await screen.findByText('No songs match your search.');
});

test('a fetch error shows Retry, and Retry actually refetches (not a no-op)', async () => {
  svc.listCatalog.mockRejectedValueOnce(new Error('boom'));
  render(<MemoryRouter initialEntries={['/catalog']}><Catalog /></MemoryRouter>);
  await screen.findByText('Something went wrong.');
  const callsAfterError = svc.listCatalog.mock.calls.length;

  svc.listCatalog.mockResolvedValue(resp([{ uid: 'a', title: 'Zombie', artist: 'The Cranberries' }], 1));
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => expect(svc.listCatalog.mock.calls.length).toBeGreaterThan(callsAfterError));
  await screen.findByText('Zombie'); // recovered — Retry re-ran the fetch
});

// ---- Story 20.4: Collections rail ----

test('shows the Collections rail above the list when there is no query', async () => {
  svc.listCatalog.mockResolvedValue(resp([{ uid: 'a', title: 'Zombie', artist: 'The Cranberries' }], 1));
  svc.listCollections.mockResolvedValue([{ uid: 'col1', name: 'Rock 90s', description: null, songCount: 3 }]);
  render(<MemoryRouter initialEntries={['/catalog']}><Catalog /></MemoryRouter>);
  await screen.findByText('Zombie');
  expect(await screen.findByRole('link', { name: 'Open the Rock 90s collection' })).toBeInTheDocument();
});

test('the Collections rail folds away once a query is typed', async () => {
  svc.listCatalog.mockResolvedValue(resp([], 0));
  svc.listCollections.mockResolvedValue([{ uid: 'col1', name: 'Rock 90s', description: null, songCount: 3 }]);
  render(<MemoryRouter initialEntries={['/catalog?search=zombie']}><Catalog /></MemoryRouter>);
  await screen.findByText('Results (0)');
  expect(screen.queryByRole('link', { name: 'Open the Rock 90s collection' })).toBeNull();
});

test('a 0-song collection is not shown in the rail (no dead-end tile)', async () => {
  svc.listCatalog.mockResolvedValue(resp([{ uid: 'a', title: 'Zombie', artist: 'The Cranberries' }], 1));
  svc.listCollections.mockResolvedValue([
    { uid: 'col1', name: 'Rock 90s', description: null, songCount: 3 },
    { uid: 'empty', name: 'Empty Set', description: null, songCount: 0 },
  ]);
  render(<MemoryRouter initialEntries={['/catalog']}><Catalog /></MemoryRouter>);
  await screen.findByRole('link', { name: 'Open the Rock 90s collection' });
  expect(screen.queryByRole('link', { name: 'Open the Empty Set collection' })).toBeNull();
});
