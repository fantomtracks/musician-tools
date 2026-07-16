import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CatalogManage from '../pages/CatalogManage';
import { useAuth } from '../contexts/AuthContext';
import { catalogService, CatalogNotFoundError } from '../services/catalogService';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../services/catalogService', () => {
  const actual = jest.requireActual('../services/catalogService');
  return {
    ...actual,
    catalogService: { listCatalog: jest.fn(), deleteCatalogEntry: jest.fn() },
  };
});

const mockedUseAuth = useAuth as jest.Mock;
const cat = catalogService as jest.Mocked<typeof catalogService>;

const twoEntries = {
  items: [
    { uid: 'c1', title: 'Zombie', artist: 'The Cranberries', key: 'Em', mode: 'Minor', timeSignature: '4/4' },
    { uid: 'c2', title: 'Creep', artist: 'Radiohead' },
  ],
  total: 2,
  page: 1,
  limit: 24,
};

// StrictMode so the fetch effect's double-mount can't regress (lesson from 19.4).
const renderManage = () => render(
  <StrictMode>
    <MemoryRouter initialEntries={['/catalog/manage']}>
      <Routes>
        <Route path="/catalog/manage" element={<CatalogManage />} />
        <Route path="/catalog/admin/:uid" element={<div>edit-marker</div>} />
        <Route path="/catalog/admin" element={<div>create-marker</div>} />
        <Route path="/" element={<div>home-marker</div>} />
      </Routes>
    </MemoryRouter>
  </StrictMode>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseAuth.mockReturnValue({ user: { uid: 'u1', isCurator: true } });
  cat.listCatalog.mockResolvedValue(twoEntries);
  cat.deleteCatalogEntry.mockResolvedValue(undefined);
});

test('a curator sees the list of entries + a New entry shortcut', async () => {
  renderManage();
  await screen.findByText('Zombie');
  expect(screen.getByText('Creep')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'New entry' })).toBeInTheDocument();
  // No per-row Edit/Delete buttons anymore.
  expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
});

test('a non-curator is redirected home — no management list', async () => {
  mockedUseAuth.mockReturnValue({ user: { uid: 'u2', isCurator: false } });
  renderManage();
  expect(await screen.findByText('home-marker')).toBeInTheDocument();
  expect(screen.queryByText('Zombie')).toBeNull();
});

test('clicking a row opens that entry for editing', async () => {
  renderManage();
  await screen.findByText('Zombie');
  fireEvent.click(screen.getByText('Zombie'));
  expect(await screen.findByText('edit-marker')).toBeInTheDocument();
});

test('the bulk bar appears only when entries are selected', async () => {
  renderManage();
  await screen.findByText('Zombie');
  expect(screen.queryByRole('button', { name: 'Delete selected' })).toBeNull();

  fireEvent.click(screen.getByLabelText('Select Zombie'));
  expect(screen.getByText('1 selected')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Delete selected' })).toBeInTheDocument();
});

test('bulk delete asks confirmation, then removes the selected rows', async () => {
  renderManage();
  await screen.findByText('Zombie');

  fireEvent.click(screen.getByLabelText('Select Zombie'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));

  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText(/keep their own copy/i)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(cat.deleteCatalogEntry).toHaveBeenCalledWith('c1'));
  await waitFor(() => expect(screen.queryByText('Zombie')).toBeNull());
  expect(screen.getByText('Creep')).toBeInTheDocument();
});

test('select-all then delete removes every displayed entry', async () => {
  renderManage();
  await screen.findByText('Zombie');

  fireEvent.click(screen.getByLabelText('Select all'));
  expect(screen.getByText('2 selected')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(cat.deleteCatalogEntry).toHaveBeenCalledWith('c1'));
  expect(cat.deleteCatalogEntry).toHaveBeenCalledWith('c2');
  await waitFor(() => expect(screen.queryByText('Zombie')).toBeNull());
  expect(screen.queryByText('Creep')).toBeNull();
});

test('Cancel in the confirm dialog deletes nothing', async () => {
  renderManage();
  await screen.findByText('Zombie');

  fireEvent.click(screen.getByLabelText('Select Zombie'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

  expect(cat.deleteCatalogEntry).not.toHaveBeenCalled();
  expect(screen.getByText('Zombie')).toBeInTheDocument();
});

// AC8 (2nd half): deleting an entry another curator already removed (404) is absorbed.
test('a delete race (404 already gone) still removes the row', async () => {
  cat.deleteCatalogEntry.mockRejectedValue(new CatalogNotFoundError());
  renderManage();
  await screen.findByText('Zombie');

  fireEvent.click(screen.getByLabelText('Select Zombie'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(cat.deleteCatalogEntry).toHaveBeenCalledWith('c1'));
  await waitFor(() => expect(screen.queryByText('Zombie')).toBeNull());
  expect(screen.getByText('Creep')).toBeInTheDocument();
});

// Review F1: an out-of-range page is never a dead-end — offers a way back.
test('an out-of-range page offers a way back to the first page', async () => {
  cat.listCatalog.mockResolvedValue({ items: [], total: 25, page: 2, limit: 24 });
  render(
    <StrictMode>
      <MemoryRouter initialEntries={['/catalog/manage?page=2']}>
        <Routes>
          <Route path="/catalog/manage" element={<CatalogManage />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>
  );
  await screen.findByText('This page is empty.');
  expect(screen.getByRole('button', { name: /Back to first page/i })).toBeInTheDocument();
});
