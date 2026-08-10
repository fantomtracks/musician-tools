import { StrictMode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CatalogManage from '../pages/CatalogManage';
import { useAuth } from '../contexts/AuthContext';
import { catalogService } from '../services/catalogService';

// Story 20.2 — the Collections tab of the curator hub (/catalog/manage?tab=collections).
jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../services/catalogService', () => {
  const actual = jest.requireActual('../services/catalogService');
  const { makeCatalogServiceMock } = jest.requireActual('../test/catalogServiceMock');
  return { ...actual, catalogService: makeCatalogServiceMock() };
});

const mockedUseAuth = useAuth as jest.Mock;
const cat = catalogService as jest.Mocked<typeof catalogService>;

// StrictMode so the fetch effect's double-mount can't regress (lesson from 19.4).
const renderCollectionsTab = () => render(
  <StrictMode>
    <MemoryRouter initialEntries={['/catalog/manage?tab=collections']}>
      <Routes>
        <Route path="/catalog/manage" element={<CatalogManage />} />
        <Route path="/catalog/manage/collections/:uid" element={<div>compose-marker</div>} />
        <Route path="/" element={<div>home-marker</div>} />
      </Routes>
    </MemoryRouter>
  </StrictMode>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseAuth.mockReturnValue({ user: { uid: 'u1', isCurator: true } });
  cat.listCatalog.mockResolvedValue({ items: [], total: 0, page: 1, limit: 24 });
  cat.deleteCatalogEntry.mockResolvedValue(undefined);
  cat.listCollections.mockResolvedValue([{ uid: 'col1', name: 'Rock 90s', description: null, songCount: 3 }]);
  cat.createCollection.mockResolvedValue({ uid: 'newcol', name: 'Jazz', description: null });
});

test('the Collections tab lists collections with their entry count', async () => {
  renderCollectionsTab();
  await screen.findByText('Rock 90s');
  expect(screen.getByText('3 entries')).toBeInTheDocument();
});

test('New collection creates it and navigates to the composer', async () => {
  renderCollectionsTab();
  await screen.findByText('Rock 90s');
  fireEvent.change(screen.getByLabelText('New collection name'), { target: { value: 'Jazz' } });
  fireEvent.click(screen.getByRole('button', { name: 'New collection' }));
  await screen.findByText('compose-marker');
  expect(cat.createCollection).toHaveBeenCalledWith('Jazz');
});

test('empty state when there are no collections', async () => {
  cat.listCollections.mockResolvedValue([]);
  renderCollectionsTab();
  await screen.findByText('No collections yet — create the first one.');
});
