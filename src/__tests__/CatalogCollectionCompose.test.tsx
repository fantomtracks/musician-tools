import { StrictMode, useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CatalogCollectionCompose from '../pages/CatalogCollectionCompose';
import { GlobalToastProvider } from '../contexts/GlobalToastProvider';
import { useAuth } from '../contexts/AuthContext';
import { catalogService, CollectionNotFoundError } from '../services/catalogService';

// Story 20.2 — the curator Collection composer (/catalog/manage/collections/:uid).
jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
// Complete mock derived from the real service's keys (22.2): this suite used to list
// its stubs by hand, which is exactly the partial-mock exposure the review of 22.2
// logged as deferred work — the page only had to call one more method to kill it.
jest.mock('../services/catalogService', () => {
  const actual = jest.requireActual('../services/catalogService');
  const { makeCatalogServiceMock } = jest.requireActual('../test/catalogServiceMock');
  return { ...actual, catalogService: makeCatalogServiceMock() };
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
  cat.addSongToCollection.mockResolvedValue('added'); // returns the outcome since 22.2
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

// Story 22.3: the per-row Remove is gone — a single removal path, via the selection.
test('no row offers its own Remove button, whatever it would be called', async () => {
  renderCompose();
  // Anchor on the MEMBER, not the page heading: the assertion must fail if the table
  // does not render at all.
  await screen.findByLabelText('Select Zombie by The Cranberries');
  // Any button whose name starts with "Remove" is a removal affordance; with nothing
  // selected there must be none — not even the bulk one.
  expect(screen.queryAllByRole('button', { name: /^Remove/ })).toHaveLength(0);
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

// ---------------------------------------------------------------------------
// Story 22.3 — members as a selectable table + bulk remove
// ---------------------------------------------------------------------------

const twoMembers = {
  uid: 'col1',
  name: 'Rock 90s',
  description: null,
  songs: [
    { uid: 's1', title: 'Zombie', artist: 'The Cranberries', key: 'Em', bpm: 84, publishedAt: '2026-01-01' },
    { uid: 's2', title: 'Creep', artist: 'Radiohead', key: 'G', bpm: 92, publishedAt: null },
  ],
};

const removeBoth = async () => {
  fireEvent.click(screen.getByLabelText('Select all'));
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
};

test('members are a table with the catalog columns, and a draft is badged', async () => {
  cat.getCollection.mockResolvedValue(twoMembers);
  renderCompose();
  await screen.findByText('Rock 90s');

  expect(screen.getByRole('table')).toBeInTheDocument();
  ['Artist', 'Title', 'Key', 'BPM'].forEach(h =>
    expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument());
  expect(screen.getByText('The Cranberries')).toBeInTheDocument();
  expect(screen.getByText('84')).toBeInTheDocument();
  expect(screen.getByText('Draft')).toBeInTheDocument(); // Creep is unpublished
  expect(screen.getByLabelText('Select Zombie by The Cranberries')).toBeInTheDocument();
});

test('the bulk bar shows up on selection and removes the selected members', async () => {
  cat.getCollection.mockResolvedValue(twoMembers);
  renderCompose();
  await screen.findByText('Rock 90s');
  expect(screen.queryByRole('button', { name: 'Remove selected' })).toBeNull();

  await removeBoth();

  await waitFor(() => expect(cat.removeSongFromCollection).toHaveBeenCalledWith('col1', 's1'));
  expect(cat.removeSongFromCollection).toHaveBeenCalledWith('col1', 's2');
  await waitFor(() => expect(screen.queryByText('Zombie')).toBeNull());
  expect(screen.queryByText('Creep')).toBeNull();
  expect(screen.getByText(/Entries \(0\)/)).toBeInTheDocument();
  // The recap outlives the emptied selection (it is not a child of the bar).
  expect(screen.getByRole('status', { name: 'Bulk action result' })).toHaveTextContent(/2 removed/);
});

test('a partial failure keeps the failed member in the table AND ticked', async () => {
  cat.getCollection.mockResolvedValue(twoMembers);
  cat.removeSongFromCollection.mockImplementation(async (_c: string, uid: string) => {
    if (uid === 's2') throw new Error('boom');
  });
  renderCompose();
  await screen.findByText('Rock 90s');

  await removeBoth();

  const recap = await screen.findByRole('alert', { name: 'Bulk action result' });
  expect(recap).toHaveTextContent(/1 removed/);
  expect(recap).toHaveTextContent(/1 failed/);
  await waitFor(() => expect(screen.queryByText('Zombie')).toBeNull());
  expect(screen.getByText('Creep')).toBeInTheDocument();
  expect(screen.getByLabelText('Select Creep by Radiohead')).toBeChecked();
  expect(screen.getByText('1 entry selected')).toBeInTheDocument();
});

test('cancelling the confirmation removes nothing', async () => {
  cat.getCollection.mockResolvedValue(twoMembers);
  renderCompose();
  await screen.findByText('Rock 90s');

  fireEvent.click(screen.getByLabelText('Select all'));
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(cat.removeSongFromCollection).not.toHaveBeenCalled();
  expect(screen.getByText('Zombie')).toBeInTheDocument();
  // Cancelling must not cost the user their selection.
  expect(screen.getByText('2 entries selected')).toBeInTheDocument();
});

test('a removed member becomes searchable again in the typeahead', async () => {
  cat.getCollection.mockResolvedValue(twoMembers);
  // Two results: one is already a member (filtered out), one is not. Waiting for the
  // NON-member option to paint proves the results landed — otherwise the "member is
  // absent" assertion would pass simply because nothing had rendered yet.
  cat.listCatalog.mockResolvedValue({
    items: [
      { uid: 's1', title: 'Zombie', artist: 'The Cranberries', publishedAt: '2026-01-01' },
      { uid: 's9', title: 'Zombie Nation', artist: 'Kernkraft 400', publishedAt: '2026-01-01' },
    ],
    total: 2, page: 1, limit: 10,
  });
  renderCompose();
  await screen.findByText('Rock 90s');

  // While it is a member, the typeahead filters it out at render time.
  fireEvent.change(screen.getByLabelText('Add an entry'), { target: { value: 'zombie' } });
  expect(await screen.findByRole('option', { name: /Zombie Nation/ })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /^The Cranberries · Zombie$/ })).toBeNull();

  fireEvent.click(screen.getByLabelText('Select Zombie by The Cranberries'));
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(cat.removeSongFromCollection).toHaveBeenCalledWith('col1', 's1'));

  // No refetch needed: the exclusion is computed at render from memberIds.
  fireEvent.focus(screen.getByLabelText('Add an entry'));
  // Exact name: "Zombie Nation" is also in the result set.
  expect(await screen.findByRole('option', { name: /^The Cranberries · Zombie$/ })).toBeInTheDocument();
});

test('the recap survives its own batch and closes at the next selection gesture', async () => {
  cat.getCollection.mockResolvedValue(twoMembers);
  renderCompose();
  await screen.findByText('Rock 90s');

  fireEvent.click(screen.getByLabelText('Select Zombie by The Cranberries'));
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

  // It must NOT be wiped by the batch's own deselection...
  const recap = await screen.findByRole('status', { name: 'Bulk action result' });
  expect(recap).toHaveTextContent(/1 removed/);

  // ...but the next deliberate tick means it no longer describes what is on screen.
  fireEvent.click(screen.getByLabelText('Select Creep by Radiohead'));
  await waitFor(() => expect(screen.queryByRole('status', { name: 'Bulk action result' })).toBeNull());
});

test('Delete collection is unreachable while the removal dialog is open', async () => {
  cat.getCollection.mockResolvedValue(twoMembers);
  renderCompose();
  await screen.findByText('Rock 90s');

  fireEvent.click(screen.getByLabelText('Select all'));
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected' }));
  await screen.findByRole('dialog');

  // Two stacked modals would put two "Cancel" buttons in the tree with no focus trap.
  expect(screen.getByRole('button', { name: 'Delete collection' })).toBeDisabled();
});

test('emptying the selection while the dialog is open closes it instead of no-oping', async () => {
  cat.getCollection.mockResolvedValue(twoMembers);
  renderCompose();
  await screen.findByText('Rock 90s');

  fireEvent.click(screen.getByLabelText('Select Zombie by The Cranberries'));
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected' }));
  await screen.findByRole('dialog');
  // The boxes are only frozen once the batch starts — untick before confirming.
  fireEvent.click(screen.getByLabelText('Select Zombie by The Cranberries'));
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(cat.removeSongFromCollection).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// Story 24.2 — constat 4 : le CÂBLAGE du récap abandonné sur cette surface
// ---------------------------------------------------------------------------
// Même patron que CatalogManage : le formateur partagé est couvert ailleurs, mais rien ne
// vérifiait que CETTE page l'appelle. La QA navigateur ne peut pas y suppléer (backend local
// trop rapide sans throttle, Vite dev inutilisable avec).

function ComposePage() {
  const [onPage, setOnPage] = useState(true);
  return (
    <>
      {onPage ? <CatalogCollectionCompose /> : <div>page quittée</div>}
      <button onClick={() => setOnPage(false)}>quitter</button>
    </>
  );
}

const renderAbandonableCompose = () => render(
  <StrictMode>
    <GlobalToastProvider>
      <MemoryRouter initialEntries={['/catalog/manage/collections/col1']}>
        <Routes>
          <Route path="/catalog/manage/collections/:uid" element={<ComposePage />} />
        </Routes>
      </MemoryRouter>
    </GlobalToastProvider>
  </StrictMode>
);

test('un retrait groupé abandonné annonce quand même ce qui a été retiré', async () => {
  const resolvers: Array<() => void> = [];
  cat.getCollection.mockResolvedValue(twoMembers);
  cat.removeSongFromCollection.mockImplementation(() => new Promise<void>(res => { resolvers.push(() => res()); }));

  renderAbandonableCompose();
  await screen.findByText('Rock 90s');
  await removeBoth();
  await waitFor(() => expect(cat.removeSongFromCollection).toHaveBeenCalled());

  fireEvent.click(screen.getByRole('button', { name: 'quitter' }));
  await act(async () => { resolvers.forEach(r => r()); await Promise.resolve(); });

  expect(screen.getByText('page quittée')).toBeInTheDocument();
  await waitFor(() => expect(
    screen.getByText(/You left while songs were being removed from the collection/)
  ).toBeInTheDocument());
});
