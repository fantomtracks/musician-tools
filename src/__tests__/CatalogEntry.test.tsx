import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CatalogEntry from '../pages/CatalogEntry';
import { catalogService, CatalogNotFoundError } from '../services/catalogService';

jest.mock('../services/catalogService', () => {
  const actual = jest.requireActual('../services/catalogService');
  const { makeCatalogServiceMock } = jest.requireActual('../test/catalogServiceMock');
  return { ...actual, catalogService: makeCatalogServiceMock() };
});
const svc = catalogService as jest.Mocked<typeof catalogService>;

const renderAt = (uid: string) => render(
  <MemoryRouter initialEntries={[`/catalog/${uid}`]}>
    <Routes>
      <Route path="/catalog/:uid" element={<CatalogEntry />} />
      <Route path="/catalog" element={<div>browse-marker</div>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => { jest.clearAllMocks(); });

test('renders the entry detail with intrinsic fields and clickable streaming links', async () => {
  svc.getCatalogEntry.mockResolvedValue({
    uid: 'a', title: 'Zombie', artist: 'The Cranberries', key: 'Em', bpm: 84,
    streamingLinks: [{ label: 'YouTube', url: 'https://youtu.be/x' }],
  });
  renderAt('a');
  await screen.findByText('Zombie');
  expect(screen.getByText('The Cranberries')).toBeInTheDocument();
  expect(screen.getByText('Em')).toBeInTheDocument();
  const link = screen.getByRole('link', { name: 'YouTube' });
  expect(link).toHaveAttribute('href', 'https://youtu.be/x');
  expect(link).toHaveAttribute('target', '_blank');
});

test('a 404 shows a calm not-found + Browse link (deep-link to a removed entry)', async () => {
  svc.getCatalogEntry.mockRejectedValue(new CatalogNotFoundError());
  renderAt('gone');
  await screen.findByText('This song is no longer in the Catalog.');
  expect(screen.getByRole('link', { name: /Browse the Catalog/i })).toBeInTheDocument();
});
