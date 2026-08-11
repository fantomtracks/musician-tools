import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CatalogManage from '../pages/CatalogManage';
import { useAuth } from '../contexts/AuthContext';
import { catalogService, CatalogNotFoundError, CollectionNotFoundError } from '../services/catalogService';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
// Complete mock derived from the real service's keys — a page calling one more method
// must never break every test in this file (retro Epic 20 #2).
jest.mock('../services/catalogService', () => {
  const actual = jest.requireActual('../services/catalogService');
  const { makeCatalogServiceMock } = jest.requireActual('../test/catalogServiceMock');
  return { ...actual, catalogService: makeCatalogServiceMock() };
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

  fireEvent.click(screen.getByLabelText('Select Zombie by The Cranberries'));
  expect(screen.getByText('1 entry selected')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Delete selected' })).toBeInTheDocument();
});

test('bulk delete asks confirmation, then removes the selected rows', async () => {
  renderManage();
  await screen.findByText('Zombie');

  fireEvent.click(screen.getByLabelText('Select Zombie by The Cranberries'));
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
  expect(screen.getByText('2 entries selected')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  const dialog = await screen.findByRole('dialog');
  // Emptying page 1 now refetches instead of splicing locally, so the mock has to answer what a
  // real server would answer once both entries are gone. Leaving it returning the deleted rows
  // would make this test assert the OLD behaviour rather than the intent ("they disappear").
  cat.listCatalog.mockResolvedValue({ items: [], total: 0, page: 1, limit: 24 });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(cat.deleteCatalogEntry).toHaveBeenCalledWith('c1'));
  expect(cat.deleteCatalogEntry).toHaveBeenCalledWith('c2');
  await waitFor(() => expect(screen.queryByText('Zombie')).toBeNull());
  expect(screen.queryByText('Creep')).toBeNull();
});

// Emptying page 1 of a MULTI-page catalog used to be a dead end: the step-back was guarded by
// `page > 1`, so page 1 fell into the local-splice branch — items:[] with no refetch. The
// resulting "This page is empty" screen offers "Back to first page", which patches page to null
// while page is ALREADY 1: the effect deps never change and it never re-runs. Stuck until a
// search or a reload. Pre-existing (19.5), not caused by 22.1.
test('emptying page 1 of a multi-page catalog refetches instead of freezing on an empty page', async () => {
  cat.listCatalog.mockResolvedValue({ ...twoEntries, total: 26 }); // 26 > limit 24 → several pages
  renderManage();
  await screen.findByText('Zombie');
  const callsBeforeDelete = cat.listCatalog.mock.calls.length;

  fireEvent.click(screen.getByLabelText('Select all'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(cat.deleteCatalogEntry).toHaveBeenCalledWith('c2'));
  // The whole point: page 1 must ask the server again, so the entries that shifted up from
  // page 2 appear. Without the refetch the user is left on a page nothing can refresh.
  await waitFor(() => expect(cat.listCatalog.mock.calls.length).toBeGreaterThan(callsBeforeDelete));
});

test('Cancel in the confirm dialog deletes nothing', async () => {
  renderManage();
  await screen.findByText('Zombie');

  fireEvent.click(screen.getByLabelText('Select Zombie by The Cranberries'));
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

  fireEvent.click(screen.getByLabelText('Select Zombie by The Cranberries'));
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

// ---------------------------------------------------------------------------
// Story 22.2 — bulk "Add to collection"
// ---------------------------------------------------------------------------

const twoCollections = [
  { uid: 'col-1', name: 'Beginner classics', songCount: 3 },
  { uid: 'col-2', name: 'Halloween', songCount: 0 },
];

// Select both rows, open the menu, pick a collection, confirm with Add.
const addBothTo = async (collectionName: string) => {
  fireEvent.click(screen.getByLabelText('Select all'));
  fireEvent.click(screen.getByRole('button', { name: 'Add to collection' }));
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(collectionName) }));
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
};

test('the menu is fetched lazily, and REFETCHED on every open (the Collections tab can delete one behind its back)', async () => {
  cat.listCollections.mockResolvedValue(twoCollections);
  renderManage();
  await screen.findByText('Zombie');

  expect(cat.listCollections).not.toHaveBeenCalled(); // not fetched with the page
  fireEvent.click(screen.getByLabelText('Select Zombie by The Cranberries'));
  fireEvent.click(screen.getByRole('button', { name: 'Add to collection' }));

  expect(await screen.findByRole('button', { name: /Beginner classics/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Halloween/ })).toBeInTheDocument();
  expect(cat.listCollections).toHaveBeenCalledTimes(1);

  // Close, reopen: a cached list could offer a collection that no longer exists.
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add to collection' }));
  await waitFor(() => expect(cat.listCollections).toHaveBeenCalledTimes(2));
});

test('a menu that fails to load offers a Retry that reloads it', async () => {
  cat.listCollections.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(twoCollections);
  renderManage();
  await screen.findByText('Zombie');

  fireEvent.click(screen.getByLabelText('Select Zombie by The Cranberries'));
  fireEvent.click(screen.getByRole('button', { name: 'Add to collection' }));

  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('button', { name: /Beginner classics/ })).toBeInTheDocument();
});

test('no collections yet: the menu says so and points to the Collections tab', async () => {
  cat.listCollections.mockResolvedValue([]);
  renderManage();
  await screen.findByText('Zombie');

  fireEvent.click(screen.getByLabelText('Select Zombie by The Cranberries'));
  fireEvent.click(screen.getByRole('button', { name: 'Add to collection' }));

  expect(await screen.findByText(/No collections yet/i)).toBeInTheDocument();
  // ...and the way out is one click, not a dead end.
  fireEvent.click(screen.getByRole('button', { name: 'Create one' }));
  expect(await screen.findByRole('button', { name: 'New collection' })).toBeInTheDocument();
});

test('a successful add reports it and clears the selection', async () => {
  cat.listCollections.mockResolvedValue(twoCollections);
  cat.addSongToCollection.mockResolvedValue('added');
  renderManage();
  await screen.findByText('Zombie');

  await addBothTo('Beginner classics');

  await waitFor(() => expect(cat.addSongToCollection).toHaveBeenCalledTimes(2));
  expect(cat.addSongToCollection).toHaveBeenCalledWith('col-1', 'c1');
  expect(cat.addSongToCollection).toHaveBeenCalledWith('col-1', 'c2');
  expect(await screen.findByText(/2 added/)).toBeInTheDocument();
  // Everything succeeded -> nothing stays selected, and the bar is gone...
  expect(screen.queryByRole('button', { name: 'Delete selected' })).toBeNull();
  // ...but the recap SURVIVES it (it does not live inside the bar).
  expect(screen.getByRole('status', { name: 'Bulk action result' })).toHaveTextContent(/2 added/);
});

test('an entry that is already a member counts as "already in", never as a failure', async () => {
  cat.listCollections.mockResolvedValue(twoCollections);
  cat.addSongToCollection.mockImplementation(async (_col: string, songUid: string) =>
    songUid === 'c1' ? 'added' : 'already-in');
  renderManage();
  await screen.findByText('Zombie');

  await addBothTo('Beginner classics');

  const recap = await screen.findByRole('status', { name: 'Bulk action result' });
  expect(recap).toHaveTextContent(/1 added/);
  expect(recap).toHaveTextContent(/1 already in/);
  expect(recap).not.toHaveTextContent(/failed/);
});

test('a fully no-op batch gets its own message, not a degraded "0 added"', async () => {
  cat.listCollections.mockResolvedValue(twoCollections);
  cat.addSongToCollection.mockResolvedValue('already-in');
  renderManage();
  await screen.findByText('Zombie');

  await addBothTo('Beginner classics');

  const recap = await screen.findByRole('status', { name: 'Bulk action result' });
  expect(recap).toHaveTextContent(/All 2 entries were already in "Beginner classics"/);
  expect(recap).not.toHaveTextContent(/0 added/);
});

test('a partial failure keeps ONLY the failed entries selected, and shouts', async () => {
  cat.listCollections.mockResolvedValue(twoCollections);
  cat.addSongToCollection.mockImplementation(async (_col: string, songUid: string) => {
    if (songUid === 'c2') throw new Error('boom');
    return 'added';
  });
  renderManage();
  await screen.findByText('Zombie');

  await addBothTo('Beginner classics');

  const recap = await screen.findByRole('alert', { name: 'Bulk action result' }); // failures are assertive
  expect(recap).toHaveTextContent(/1 added/);
  expect(recap).toHaveTextContent(/1 failed/);
  // The batch is replayable: the failed row stays ticked, the successful one does not.
  expect(screen.getByLabelText('Select Creep by Radiohead')).toBeChecked();
  expect(screen.getByLabelText('Select Zombie by The Cranberries')).not.toBeChecked();
  expect(screen.getByText('1 entry selected')).toBeInTheDocument();
});

test('double-clicking Add fires a single batch', async () => {
  cat.listCollections.mockResolvedValue(twoCollections);
  const releases: Array<() => void> = [];
  cat.addSongToCollection.mockImplementation(() => new Promise(res => { releases.push(() => res('added')); }));
  renderManage();
  await screen.findByText('Zombie');

  fireEvent.click(screen.getByLabelText('Select all'));
  fireEvent.click(screen.getByRole('button', { name: 'Add to collection' }));
  fireEvent.click(await screen.findByRole('button', { name: /Beginner classics/ }));
  const addButton = screen.getByRole('button', { name: 'Add' });
  fireEvent.click(addButton);
  fireEvent.click(addButton);

  await waitFor(() => expect(cat.addSongToCollection).toHaveBeenCalledTimes(2)); // 2 entries, ONE batch
  releases.forEach(r => r());
});

test('a deleted collection is named as the cause, and retrying is not suggested', async () => {
  cat.listCollections.mockResolvedValue(twoCollections);
  cat.addSongToCollection.mockRejectedValue(new CollectionNotFoundError());
  renderManage();
  await screen.findByText('Zombie');

  await addBothTo('Beginner classics');

  const recap = await screen.findByRole('alert', { name: 'Bulk action result' });
  expect(recap).toHaveTextContent(/"Beginner classics" no longer exists/);
  expect(recap).not.toHaveTextContent(/you can retry/);
});

test('Delete selected is frozen while an add batch is in flight', async () => {
  cat.listCollections.mockResolvedValue(twoCollections);
  // Hold EVERY in-flight call, not just the last one, or the batch never settles.
  const releases: Array<() => void> = [];
  cat.addSongToCollection.mockImplementation(() => new Promise(res => { releases.push(() => res('added')); }));
  renderManage();
  await screen.findByText('Zombie');

  await addBothTo('Beginner classics');

  // Both bulk paths write the same selection — they must not interleave.
  expect(screen.getByRole('button', { name: 'Delete selected' })).toBeDisabled();
  expect(screen.getByLabelText('Select Zombie by The Cranberries')).toBeDisabled();
  releases.forEach(r => r());
  await waitFor(() => expect(screen.getByRole('status', { name: 'Bulk action result' })).toBeInTheDocument());
});

test('the recap closes as soon as the user makes the next selection', async () => {
  cat.listCollections.mockResolvedValue(twoCollections);
  cat.addSongToCollection.mockImplementation(async (_c: string, uid: string) => {
    if (uid === 'c2') throw new Error('boom');
    return 'added';
  });
  renderManage();
  await screen.findByText('Zombie');

  await addBothTo('Beginner classics');
  await screen.findByRole('alert', { name: 'Bulk action result' });

  // Touching the selection again means the recap no longer describes what is on screen.
  fireEvent.click(screen.getByLabelText('Select Zombie by The Cranberries'));
  await waitFor(() => expect(screen.queryByRole('alert', { name: 'Bulk action result' })).toBeNull());
});

test('Clear selection empties a selection whose rows are no longer displayed', async () => {
  renderManage();
  await screen.findByText('Zombie');

  fireEvent.click(screen.getByLabelText('Select all'));
  expect(screen.getByText('2 entries selected')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.queryByText(/entries selected/)).toBeNull();
});
