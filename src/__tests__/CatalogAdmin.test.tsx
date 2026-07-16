import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CatalogAdmin from '../pages/CatalogAdmin';
import { useAuth } from '../contexts/AuthContext';
import { catalogService, CatalogConflictError, CatalogNotFoundError } from '../services/catalogService';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
// Keep the real error classes (needed for `instanceof`), mock the methods.
jest.mock('../services/catalogService', () => {
  const actual = jest.requireActual('../services/catalogService');
  return {
    ...actual,
    catalogService: {
      createCatalogEntry: jest.fn(),
      updateCatalogEntry: jest.fn(),
      getCatalogEntry: jest.fn(),
      deleteCatalogEntry: jest.fn(),
      publishCatalogEntry: jest.fn(),
      listCatalog: jest.fn(),
      getFacets: jest.fn(),
    },
  };
});
jest.mock('../services/songService', () => ({
  songService: { lookupMetadata: jest.fn() },
}));

const mockedUseAuth = useAuth as jest.Mock;
const cat = catalogService as jest.Mocked<typeof catalogService>;

const renderAdmin = () => render(<MemoryRouter><CatalogAdmin /></MemoryRouter>);

const routeTree = (
  <Routes>
    <Route path="/catalog/admin" element={<CatalogAdmin />} />
    <Route path="/catalog/admin/:uid" element={<CatalogAdmin />} />
    <Route path="/catalog/manage" element={<div>manage-marker</div>} />
    <Route path="/" element={<div>home-marker</div>} />
  </Routes>
);
const renderAt = (path: string) => render(
  <StrictMode>
    <MemoryRouter initialEntries={[path]}>{routeTree}</MemoryRouter>
  </StrictMode>
);

beforeEach(() => {
  jest.clearAllMocks();
  cat.listCatalog.mockResolvedValue({ items: [], total: 0, page: 1, limit: 24 });
  cat.getFacets.mockResolvedValue({ genre: [], key: [], mode: [], timeSignature: [], artist: ['Oasis'], album: [] });
});

test('a curator sees the entry form (Artist + Title, no Save button)', () => {
  mockedUseAuth.mockReturnValue({ user: { uid: 'u1', isCurator: true } });
  renderAdmin();
  expect(screen.getByLabelText('Artist')).toBeInTheDocument();
  expect(screen.getByLabelText('Title')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
});

test('a non-curator is redirected to home — no form rendered', () => {
  mockedUseAuth.mockReturnValue({ user: { uid: 'u2', isCurator: false } });
  render(
    <MemoryRouter initialEntries={['/catalog/admin']}>
      <Routes>
        <Route path="/catalog/admin" element={<CatalogAdmin />} />
        <Route path="/" element={<div>home-marker</div>} />
      </Routes>
    </MemoryRouter>
  );
  expect(screen.getByText('home-marker')).toBeInTheDocument();
  expect(screen.queryByLabelText('Title')).toBeNull();
});

test('the form does NOT render instrument/personal fields (DL-17)', () => {
  mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
  renderAdmin();
  expect(screen.queryByLabelText(/instrument/i)).toBeNull();
  expect(screen.queryByLabelText(/tuning/i)).toBeNull();
});

test('create autosave: the first typed content lazily creates a draft', async () => {
  jest.useFakeTimers();
  try {
    mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
    cat.createCatalogEntry.mockResolvedValue({ uid: 'c-new', title: 'Zombie', publishedAt: null });
    renderAt('/catalog/admin');

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Zombie' } });
    await act(async () => { await jest.advanceTimersByTimeAsync(1300); });

    expect(cat.createCatalogEntry).toHaveBeenCalledTimes(1);
    expect(cat.createCatalogEntry.mock.calls[0][0].title).toBe('Zombie');
    // We created it ourselves → no refetch (would clobber typing).
    expect(cat.getCatalogEntry).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

test('edit autosave: changing a field updates the entry (debounced PUT)', async () => {
  jest.useFakeTimers();
  try {
    mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
    cat.getCatalogEntry.mockResolvedValue({ uid: 'c1', title: 'Zombie', artist: 'The Cranberries', bpm: 84, publishedAt: null });
    cat.updateCatalogEntry.mockResolvedValue({ uid: 'c1', title: 'Zombie' });
    renderAt('/catalog/admin/c1');

    await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Zombie'));
    fireEvent.change(screen.getByLabelText('BPM'), { target: { value: '90' } });
    await act(async () => { await jest.advanceTimersByTimeAsync(1300); });

    await waitFor(() => expect(cat.updateCatalogEntry).toHaveBeenCalled());
    expect(cat.updateCatalogEntry.mock.calls.at(-1)![0]).toBe('c1');
  } finally {
    jest.useRealTimers();
  }
});

test('a duplicate (title, artist) blocks autosave and hides Publish (19.6 revised)', async () => {
  jest.useFakeTimers();
  try {
    mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
    cat.getCatalogEntry.mockResolvedValue({ uid: 'c1', title: 'Zombie', artist: 'A', publishedAt: null });
    // The whole-Catalog check (drafts + published) finds an entry with the target key.
    cat.listCatalog.mockResolvedValue({ items: [{ uid: 'other', title: 'Zombie', artist: 'B' }], total: 1, page: 1, limit: 24 });
    cat.updateCatalogEntry.mockResolvedValue({ uid: 'c1', title: 'Zombie' });
    renderAt('/catalog/admin/c1');
    await act(async () => { await jest.advanceTimersByTimeAsync(0); }); // flush prefill

    fireEvent.change(screen.getByLabelText('Artist'), { target: { value: 'B' } });
    await act(async () => { await jest.advanceTimersByTimeAsync(1300); });

    // Blocking message shown, NO save attempted, Publish removed.
    expect(screen.getByText(/already exists in the Catalog/i)).toBeInTheDocument();
    expect(cat.updateCatalogEntry).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('a draft shows a Publish button; publishing flips it and returns to the hub', async () => {
  mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
  cat.getCatalogEntry.mockResolvedValue({ uid: 'c1', title: 'Zombie', artist: 'X', publishedAt: null });
  cat.updateCatalogEntry.mockResolvedValue({ uid: 'c1', title: 'Zombie' });
  cat.publishCatalogEntry.mockResolvedValue({ uid: 'c1', title: 'Zombie', publishedAt: '2026-01-01' });
  renderAt('/catalog/admin/c1');

  await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Zombie'));
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

  await waitFor(() => expect(cat.publishCatalogEntry).toHaveBeenCalledWith('c1'));
  await screen.findByText('manage-marker');
});

test('publish 409 (a published entry owns the key) shows a calm banner, stays a draft', async () => {
  mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
  cat.getCatalogEntry.mockResolvedValue({ uid: 'c1', title: 'Wonderwall', artist: 'Oasis', publishedAt: null });
  cat.updateCatalogEntry.mockResolvedValue({ uid: 'c1', title: 'Wonderwall' });
  cat.publishCatalogEntry.mockRejectedValue(new CatalogConflictError({ uid: 'other', title: 'Wonderwall' }));
  renderAt('/catalog/admin/c1');

  await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Wonderwall'));
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

  await screen.findByText(/already published in the Catalog/i);
  expect(screen.queryByText('manage-marker')).toBeNull();
});

test('a PUBLISHED entry has no Publish button (autosave edits it live)', async () => {
  mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
  cat.getCatalogEntry.mockResolvedValue({ uid: 'c1', title: 'Zombie', publishedAt: '2026-01-01T00:00:00.000Z' });
  renderAt('/catalog/admin/c1');
  await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Zombie'));
  expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
});

test('edit mode shows a calm not-found for a missing entry', async () => {
  mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
  cat.getCatalogEntry.mockRejectedValue(new CatalogNotFoundError());
  renderAt('/catalog/admin/gone');
  await screen.findByText(/not found/i);
  expect(screen.getByText(/Back to manage/i)).toBeInTheDocument();
});

test('edit mode can delete the entry (confirm → back to manage)', async () => {
  mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
  cat.getCatalogEntry.mockResolvedValue({ uid: 'c1', title: 'Zombie', publishedAt: null });
  cat.deleteCatalogEntry.mockResolvedValue(undefined);
  renderAt('/catalog/admin/c1');

  await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Zombie'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(cat.deleteCatalogEntry).toHaveBeenCalledWith('c1'));
  await screen.findByText('manage-marker');
});
