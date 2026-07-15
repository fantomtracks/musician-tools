import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CatalogAdmin from '../pages/CatalogAdmin';
import { useAuth } from '../contexts/AuthContext';
import { catalogService, CatalogConflictError } from '../services/catalogService';
import { songService } from '../services/songService';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
// Keep the real CatalogConflictError (needed for `instanceof`), mock the methods.
jest.mock('../services/catalogService', () => {
  const actual = jest.requireActual('../services/catalogService');
  return {
    ...actual,
    catalogService: { createCatalogEntry: jest.fn(), updateCatalogEntry: jest.fn() },
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
