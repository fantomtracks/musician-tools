import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CatalogAdmin from '../pages/CatalogAdmin';
import { useAuth } from '../contexts/AuthContext';
import { catalogService, CatalogConflictError, CatalogNotFoundError } from '../services/catalogService';
import { songService } from '../services/songService';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
// Keep the real error classes (needed for `instanceof`), mock the methods.
jest.mock('../services/catalogService', () => {
  const actual = jest.requireActual('../services/catalogService');
  return {
    ...actual,
    catalogService: { createCatalogEntry: jest.fn(), updateCatalogEntry: jest.fn(), getCatalogEntry: jest.fn(), deleteCatalogEntry: jest.fn() },
  };
});
jest.mock('../services/songService', () => ({
  songService: { lookupMetadata: jest.fn() },
}));

const mockedUseAuth = useAuth as jest.Mock;
const cat = catalogService as jest.Mocked<typeof catalogService>;
const songs = songService as jest.Mocked<typeof songService>;

const renderAdmin = () => render(<MemoryRouter><CatalogAdmin /></MemoryRouter>);

beforeEach(() => {
  jest.clearAllMocks();
});

test('a curator sees the entry form', () => {
  mockedUseAuth.mockReturnValue({ user: { uid: 'u1', isCurator: true } });
  renderAdmin();
  expect(screen.getByLabelText('Title')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
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
  // The <Navigate to="/"> actually navigated: the home route renders, the form does not.
  expect(screen.getByText('home-marker')).toBeInTheDocument();
  expect(screen.queryByLabelText('Title')).toBeNull();
});

test('the form does NOT render instrument/personal fields (DL-17)', () => {
  mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
  renderAdmin();
  expect(screen.queryByLabelText(/instrument/i)).toBeNull();
  expect(screen.queryByLabelText(/tuning/i)).toBeNull();
  expect(screen.queryByLabelText(/capo/i)).toBeNull();
  expect(screen.queryByLabelText(/difficulty/i)).toBeNull();
});

test('saving creates a catalog entry and toasts success', async () => {
  mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
  cat.createCatalogEntry.mockResolvedValue({ uid: 'c1', title: 'Zombie' });
  renderAdmin();

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Zombie' } });
  fireEvent.change(screen.getByLabelText('Artist'), { target: { value: 'The Cranberries' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(cat.createCatalogEntry).toHaveBeenCalled());
  const payload = cat.createCatalogEntry.mock.calls[0][0];
  expect(payload.title).toBe('Zombie');
  expect(payload.artist).toBe('The Cranberries');
  await screen.findByText('Catalog entry created');
});

test('a canonical conflict (409) shows an inline calm message, not a crash', async () => {
  mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
  cat.createCatalogEntry.mockRejectedValue(new CatalogConflictError({ uid: 'exists', title: 'Zombie' }));
  renderAdmin();

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Zombie' } });
  fireEvent.change(screen.getByLabelText('Artist'), { target: { value: 'The Cranberries' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByText(/already in the Catalog/i);
});

test('auto-fill fills empty fields but never overwrites a typed value', async () => {
  mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
  songs.lookupMetadata.mockResolvedValue({
    bpm: 84, key: 'Em', mode: 'minor', timeSignature: '4/4',
    genres: ['Rock'], album: 'No Need to Argue', durationSeconds: 200, source: 'test',
  });
  renderAdmin();

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Zombie' } });
  fireEvent.change(screen.getByLabelText('Artist'), { target: { value: 'The Cranberries' } });
  // Pre-type a BPM the auto-fill must NOT overwrite.
  fireEvent.change(screen.getByLabelText('BPM'), { target: { value: '120' } });

  fireEvent.click(screen.getByRole('button', { name: /auto-fill/i }));

  await waitFor(() => expect(songs.lookupMetadata).toHaveBeenCalledWith('Zombie', 'The Cranberries'));
  // Typed BPM preserved, empty Key filled from the lookup.
  await waitFor(() => expect((screen.getByLabelText('Key') as HTMLInputElement).value).toBe('Em'));
  expect((screen.getByLabelText('BPM') as HTMLInputElement).value).toBe('120');
});

// ---- Story 19.5: edit mode (/catalog/admin/:uid). Rendered under StrictMode so the
// pre-fill effect's double-mount can't regress (lesson from 19.4 CatalogAddButton). ----
const renderEdit = (uid = 'c1') => render(
  <StrictMode>
    <MemoryRouter initialEntries={[`/catalog/admin/${uid}`]}>
      <Routes>
        <Route path="/catalog/admin/:uid" element={<CatalogAdmin />} />
        <Route path="/catalog/manage" element={<div>manage-marker</div>} />
      </Routes>
    </MemoryRouter>
  </StrictMode>
);

test('edit mode pre-fills the form and updates the same entry in place', async () => {
  mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
  cat.getCatalogEntry.mockResolvedValue({
    uid: 'c1', title: 'Zombie', artist: 'The Cranberries', bpm: 84, key: 'Em',
    genre: ['Rock'], language: ['English'], durationSeconds: 200,
  });
  cat.updateCatalogEntry.mockResolvedValue({ uid: 'c1', title: 'Zombie (Remaster)' });
  renderEdit('c1');

  // Pre-filled from getCatalogEntry.
  await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Zombie'));
  expect((screen.getByLabelText('Artist') as HTMLInputElement).value).toBe('The Cranberries');
  expect((screen.getByLabelText('BPM') as HTMLInputElement).value).toBe('84');

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Zombie (Remaster)' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(cat.updateCatalogEntry).toHaveBeenCalled());
  expect(cat.updateCatalogEntry.mock.calls[0][0]).toBe('c1'); // same uid = in-place
  expect(cat.updateCatalogEntry.mock.calls[0][1].title).toBe('Zombie (Remaster)');
  // Never falls back to create.
  expect(cat.createCatalogEntry).not.toHaveBeenCalled();
  // Navigated back to the manage hub on success.
  await screen.findByText('manage-marker');
});

test('edit mode surfaces a rename conflict (409) as a calm inline message', async () => {
  mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
  cat.getCatalogEntry.mockResolvedValue({ uid: 'c1', title: 'Zombie', artist: 'A' });
  cat.updateCatalogEntry.mockRejectedValue(new CatalogConflictError({ uid: 'other', title: 'Zombie' }));
  renderEdit('c1');

  await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Zombie'));
  fireEvent.change(screen.getByLabelText('Artist'), { target: { value: 'B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await screen.findByText(/already in the Catalog/i);
  // Stayed on the form (no navigation away).
  expect(screen.queryByText('manage-marker')).toBeNull();
});

test('edit mode can delete the entry (confirm → back to manage)', async () => {
  mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
  cat.getCatalogEntry.mockResolvedValue({ uid: 'c1', title: 'Zombie', artist: 'The Cranberries' });
  cat.deleteCatalogEntry.mockResolvedValue(undefined);
  renderEdit('c1');

  await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Zombie'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(cat.deleteCatalogEntry).toHaveBeenCalledWith('c1'));
  await screen.findByText('manage-marker');
});

test('create mode has no Delete button', () => {
  mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
  renderAdmin();
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
});

test('edit mode shows a calm not-found for a missing/removed entry', async () => {
  mockedUseAuth.mockReturnValue({ user: { isCurator: true } });
  cat.getCatalogEntry.mockRejectedValue(new CatalogNotFoundError());
  renderEdit('gone');

  await screen.findByText(/not found/i);
  expect(screen.getByText(/Back to manage/i)).toBeInTheDocument();
  expect(screen.queryByLabelText('Title')).toBeNull();
});
