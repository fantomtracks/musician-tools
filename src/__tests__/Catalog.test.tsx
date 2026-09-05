import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Catalog from '../pages/Catalog';
import { catalogService } from '../services/catalogService';
import type { CatalogSong } from '../services/catalogService';

jest.mock('../services/catalogService', () => {
  const actual = jest.requireActual('../services/catalogService');
  const { makeCatalogServiceMock } = jest.requireActual('../test/catalogServiceMock');
  return { ...actual, catalogService: makeCatalogServiceMock() };
});
const svc = catalogService as jest.Mocked<typeof catalogService>;

const resp = (items: Partial<CatalogSong>[], total = items.length) => ({ items: items as CatalogSong[], total, page: 1, limit: 24 });
const mbPage = <T,>(items: T[], total = items.length, offset = 0, limit = 8) => ({ items, total, offset, limit });

beforeEach(() => {
  jest.clearAllMocks();
  svc.getFacets.mockResolvedValue({ genre: [], key: [], mode: [], timeSignature: [] });
  svc.listCollections.mockResolvedValue([]); // no rail by default; rail tests override
  svc.searchMusicBrainz.mockResolvedValue({ artists: mbPage([]), recordings: mbPage([]) });
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

// ---------------------------------------------------------------------------
// Story 22.4 — reader-side selection + bulk "Add selected to my songlist"
// ---------------------------------------------------------------------------

import { SongConflictError } from '../services/songService';
import { CatalogNotFoundError } from '../services/catalogService';
import { songService } from '../services/songService';

jest.mock('../services/songService', () => {
  const actual = jest.requireActual('../services/songService');
  return { ...actual, songService: { getAllSongs: jest.fn().mockResolvedValue([]), createSong: jest.fn() } };
});

// Minimal Song shapes: the page only reads uid/title/artist from them.
const asSong = (o: Partial<import('../services/songService').Song>) =>
  o as import('../services/songService').Song;

const twoRows = [
  { uid: 'a', title: 'Zombie', artist: 'The Cranberries', key: 'Em' },
  { uid: 'b', title: 'Creep', artist: 'Radiohead', key: 'G' },
];

const renderCatalog = () => render(<MemoryRouter initialEntries={['/catalog']}><Catalog /></MemoryRouter>);

const addBoth = async () => {
  fireEvent.click(screen.getByLabelText('Select all'));
  fireEvent.click(screen.getByRole('button', { name: 'Add selected to my songlist' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Add to my songlist' }));
};

test('22.4: the rows gain a checkbox WITHOUT losing the row link or the per-row Add', async () => {
  svc.listCatalog.mockResolvedValue(resp(twoRows));
  renderCatalog();
  await screen.findByText('Zombie');

  expect(screen.getByLabelText('Select Zombie by The Cranberries')).toBeInTheDocument();
  expect(screen.getByLabelText('Select all')).toBeInTheDocument();
  // The per-row Add stays (decision D) and the title stays a real link.
  expect(screen.getAllByRole('button', { name: /^Add ".+" to my songlist$/ })).toHaveLength(2);
  expect(screen.getByRole('link', { name: 'Zombie' })).toHaveAttribute('href', '/catalog/a');
});

test('22.4: a mixed batch reports all four outcomes', async () => {
  svc.listCatalog.mockResolvedValue(resp([...twoRows,
    { uid: 'c', title: 'Gone', artist: 'Ghost' },
    { uid: 'd', title: 'Boom', artist: 'Crash' },
  ]));
  svc.addToSonglist.mockImplementation(async (uid: string) => {
    if (uid === 'a') return asSong({ uid: 's-a', title: 'Zombie' });
    if (uid === 'b') throw new SongConflictError(asSong({ uid: 's-b', title: 'Creep' }));
    if (uid === 'c') throw new CatalogNotFoundError();
    throw new Error('offline');
  });
  renderCatalog();
  await screen.findByText('Zombie');

  await addBoth();

  const recap = await screen.findByRole('alert', { name: 'Bulk action result' });
  expect(recap).toHaveTextContent(/1 added/);
  expect(recap).toHaveTextContent(/1 already in your songlist/);
  expect(recap).toHaveTextContent(/1 no longer in the catalog/);
  expect(recap).toHaveTextContent(/1 failed/);
});

test('22.4: a permanent 404 leaves the selection, a retryable error stays in it', async () => {
  svc.listCatalog.mockResolvedValue(resp([
    { uid: 'c', title: 'Gone', artist: 'Ghost' },
    { uid: 'd', title: 'Boom', artist: 'Crash' },
  ]));
  svc.addToSonglist.mockImplementation(async (uid: string) => {
    if (uid === 'c') throw new CatalogNotFoundError();
    throw new Error('offline');
  });
  renderCatalog();
  await screen.findByText('Gone');

  await addBoth();
  await screen.findByRole('alert', { name: 'Bulk action result' });

  // Retrying a deleted catalog entry can never work → it must not stay armed.
  expect(screen.getByLabelText('Select Gone by Ghost')).not.toBeChecked();
  expect(screen.getByLabelText('Select Boom by Crash')).toBeChecked();
  expect(screen.getByText('1 song selected')).toBeInTheDocument();
});

test('22.4: an all-already-in batch gets its own message, not a degraded "0 added"', async () => {
  svc.listCatalog.mockResolvedValue(resp(twoRows));
  svc.addToSonglist.mockImplementation(async () => { throw new SongConflictError(undefined); });
  renderCatalog();
  await screen.findByText('Zombie');

  await addBoth();

  const recap = await screen.findByRole('status', { name: 'Bulk action result' });
  expect(recap).toHaveTextContent(/All 2 songs were already in your songlist/);
  expect(recap).not.toHaveTextContent(/0 added/);
});

test('22.4: after the batch the rows show the duplicate flag, with no refetch', async () => {
  svc.listCatalog.mockResolvedValue(resp(twoRows));
  svc.addToSonglist.mockImplementation(async (uid: string) =>
    uid === 'a'
      ? asSong({ uid: 's-a', title: 'Zombie', artist: 'The Cranberries' })
      : Promise.reject(new SongConflictError(asSong({ uid: 's-b', title: 'Creep', artist: 'Radiohead' }))));
  renderCatalog();
  await screen.findByText('Zombie');
  const callsBefore = svc.listCatalog.mock.calls.length;

  await addBoth();
  await screen.findByRole('status', { name: 'Bulk action result' });

  // Both the 201 and the 409 feed the matcher cache → no row still offers Add, both
  // now read "Already in your songlist".
  await waitFor(() => expect(screen.queryAllByRole('button', { name: /^Add ".+" to my songlist$/ })).toHaveLength(0));
  expect(screen.getAllByText(/Already in your songlist/)).toHaveLength(2);
  expect(svc.listCatalog.mock.calls.length).toBe(callsBefore);
  expect(songService.getAllSongs).toHaveBeenCalledTimes(1);
});

// northwood, QA 2026-08-10: a "N selected" bar hanging over an empty table is
// confusing. A new query means a new working set, so the selection goes with it — which
// also makes the stranded-selection problem unreachable by construction.
test('22.4: a new search drops the selection instead of leaving a ghost bar', async () => {
  svc.listCatalog.mockResolvedValue(resp(twoRows));
  renderCatalog();
  await screen.findByText('Zombie');

  fireEvent.click(screen.getByLabelText('Select all'));
  expect(screen.getByText('2 songs selected')).toBeInTheDocument();

  svc.listCatalog.mockResolvedValue(resp([], 0));
  fireEvent.change(screen.getByLabelText('Search the catalog'), { target: { value: 'zzz' } });
  await screen.findByText('No songs match your search.');

  await waitFor(() => expect(screen.queryByText(/songs selected/)).toBeNull());
});

test('22.4: paging through the SAME result set keeps the selection', async () => {
  svc.listCatalog.mockResolvedValue({ items: twoRows as never, total: 30, page: 1, limit: 24 });
  renderCatalog();
  await screen.findByText('Zombie');

  fireEvent.click(screen.getByLabelText('Select all'));
  expect(screen.getByText('2 songs selected')).toBeInTheDocument();

  // Pagination is NOT a new working set (19.9 semantics) — the selection survives it.
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(svc.listCatalog).toHaveBeenCalledWith(
    expect.objectContaining({ page: 2 }), expect.anything()));
  expect(screen.getByText('2 songs selected')).toBeInTheDocument();
});

test('22.4: a batch that adds nothing never says "0 added", and is not styled as a success', async () => {
  svc.listCatalog.mockResolvedValue(resp(twoRows));
  svc.addToSonglist.mockImplementation(async () => { throw new CatalogNotFoundError(); });
  renderCatalog();
  await screen.findByText('Zombie');

  await addBoth();

  // Everything delisted: nothing was added, so this is NOT a neutral status banner.
  const recap = await screen.findByRole('alert', { name: 'Bulk action result' });
  expect(recap).toHaveTextContent(/2 no longer in the catalog/);
  expect(recap).not.toHaveTextContent(/0 added/);
});

test('22.4: a 409 that carries no song triggers a songlist reload so the row stops offering Add', async () => {
  svc.listCatalog.mockResolvedValue(resp(twoRows));
  svc.addToSonglist.mockImplementation(async () => { throw new SongConflictError(undefined); });
  renderCatalog();
  await screen.findByText('Zombie');
  expect(songService.getAllSongs).toHaveBeenCalledTimes(1);

  await addBoth();
  await screen.findByRole('status', { name: 'Bulk action result' });

  // The response could not tell us WHICH songs — the only way to stay honest is to
  // reload the songlist.
  await waitFor(() => expect(songService.getAllSongs).toHaveBeenCalledTimes(2));
});

// ---------------------------------------------------------------------------
// MusicBrainz artist → popular songs
// ---------------------------------------------------------------------------

test('a catalog hit keeps Add to my songlist; MusicBrainz shows artists and songs with Import', async () => {
  svc.listCatalog.mockResolvedValue(resp([{ uid: 'a', title: 'Zombie', artist: 'The Cranberries' }], 1));
  svc.searchMusicBrainz.mockResolvedValue({
    artists: mbPage([{ mbid: 'art-1', name: 'The Cranberries' }]),
    recordings: mbPage([{ mbid: 'mb-1', title: 'Linger', artist: 'The Cranberries', album: null, durationSeconds: 274 }]),
  });
  render(<MemoryRouter initialEntries={['/catalog?search=cranberries']}><Catalog /></MemoryRouter>);

  await screen.findByText('Zombie');
  expect(screen.getByRole('button', { name: /^Add "Zombie" to my songlist$/ })).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'From MusicBrainz' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Artists' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Songs' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show popular songs by The Cranberries' })).toHaveTextContent('Show songs');
  expect(screen.getByRole('button', { name: /^Import "Linger" to my songlist$/ })).toBeInTheDocument();
  expect(svc.searchMusicBrainz).toHaveBeenCalledWith('cranberries', expect.anything());
});

test('Load more artists and songs request the next MusicBrainz page', async () => {
  svc.listCatalog.mockResolvedValue(resp([], 0));
  svc.searchMusicBrainz.mockImplementation(async (_q: string, _signal?: AbortSignal, opts?: { kind?: string; offset?: number }) => {
    if (opts?.kind === 'artists') {
      return { artists: mbPage([{ mbid: 'art-2', name: 'Cranberries Tribute' }], 20, 8), recordings: mbPage([]) };
    }
    if (opts?.kind === 'recordings') {
      return { artists: mbPage([]), recordings: mbPage([{ mbid: 't2', title: 'Dreams', artist: 'The Cranberries' }], 15, 8) };
    }
    return {
      artists: mbPage([{ mbid: 'art-1', name: 'The Cranberries' }], 20),
      recordings: mbPage([{ mbid: 't1', title: 'Linger', artist: 'The Cranberries' }], 15),
    };
  });
  render(<MemoryRouter initialEntries={['/catalog?search=cranberries']}><Catalog /></MemoryRouter>);

  fireEvent.click(await screen.findByRole('button', { name: 'Load more artists' }));
  await waitFor(() => expect(svc.searchMusicBrainz).toHaveBeenCalledWith('cranberries', undefined, { kind: 'artists', offset: 8 }));
  expect(await screen.findByText('Cranberries Tribute')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Load more songs' }));
  await waitFor(() => expect(svc.searchMusicBrainz).toHaveBeenCalledWith('cranberries', undefined, { kind: 'recordings', offset: 8 }));
  expect(await screen.findByText('Dreams')).toBeInTheDocument();
});

test('clicking an artist loads that artist’s popular songs with Import', async () => {
  svc.listCatalog.mockResolvedValue(resp([], 0));
  svc.searchMusicBrainz.mockResolvedValue({
    artists: mbPage([{ mbid: 'art-1', name: 'The Cranberries' }]),
    recordings: mbPage([]),
  });
  svc.listMusicBrainzArtistRecordings.mockResolvedValue(mbPage([
    { mbid: 't1', title: 'Zombie', artist: 'The Cranberries', album: 'No Need to Argue', durationSeconds: 308 },
  ]));
  render(<MemoryRouter initialEntries={['/catalog?search=cranberries']}><Catalog /></MemoryRouter>);

  fireEvent.click(await screen.findByRole('button', { name: 'Show popular songs by The Cranberries' }));
  await waitFor(() => expect(svc.listMusicBrainzArtistRecordings).toHaveBeenCalledWith('art-1', expect.anything(), 0));
  expect(await screen.findByRole('heading', { name: 'Popular songs by The Cranberries' })).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: /^Import "Zombie" to my songlist$/ })).toBeInTheDocument();
});

test('Load more songs inside an artist requests the next page', async () => {
  svc.listCatalog.mockResolvedValue(resp([], 0));
  svc.searchMusicBrainz.mockResolvedValue({
    artists: mbPage([{ mbid: 'art-1', name: 'The Cranberries' }]),
    recordings: mbPage([]),
  });
  svc.listMusicBrainzArtistRecordings.mockImplementation(async (_mbid: string, _signal?: AbortSignal, offset = 0) => {
    if (offset === 8) {
      return mbPage([{ mbid: 't9', title: 'Dreams', artist: 'The Cranberries' }], 16, 8);
    }
    return mbPage([{ mbid: 't1', title: 'Zombie', artist: 'The Cranberries' }], 16, 0);
  });
  render(<MemoryRouter initialEntries={['/catalog?search=cranberries']}><Catalog /></MemoryRouter>);

  fireEvent.click(await screen.findByRole('button', { name: 'Show popular songs by The Cranberries' }));
  await screen.findByRole('button', { name: /^Import "Zombie" to my songlist$/ });
  fireEvent.click(screen.getByRole('button', { name: 'Load more songs' }));
  await waitFor(() => expect(svc.listMusicBrainzArtistRecordings).toHaveBeenCalledWith('art-1', undefined, 8));
  expect(await screen.findByRole('button', { name: /^Import "Dreams" to my songlist$/ })).toBeInTheDocument();
});

test('a popular song already in the songlist is a badge, not Import', async () => {
  (songService.getAllSongs as jest.Mock).mockResolvedValue([
    asSong({ uid: 's-linger', title: 'Linger', artist: 'The Cranberries' }),
  ]);
  svc.listCatalog.mockResolvedValue(resp([], 0));
  svc.searchMusicBrainz.mockResolvedValue({
    artists: mbPage([{ mbid: 'art-1', name: 'The Cranberries' }]),
    recordings: mbPage([]),
  });
  svc.listMusicBrainzArtistRecordings.mockResolvedValue(mbPage([
    { mbid: 't1', title: 'Linger', artist: 'The Cranberries', album: 'No Need to Argue', durationSeconds: 274 },
  ]));
  render(<MemoryRouter initialEntries={['/catalog?search=cranberries']}><Catalog /></MemoryRouter>);

  fireEvent.click(await screen.findByRole('button', { name: 'Show popular songs by The Cranberries' }));
  await screen.findByRole('heading', { name: 'Popular songs by The Cranberries' });
  expect(screen.queryByRole('button', { name: /^Import "Linger" to my songlist$/ })).toBeNull();
  const already = await screen.findByText(/Already in your songlist/);
  expect(already.closest('a')).toHaveAttribute('href', '/songs/s-linger');
});

test('no text search does not call MusicBrainz', async () => {
  svc.listCatalog.mockResolvedValue(resp([{ uid: 'a', title: 'Zombie', artist: 'The Cranberries' }]));
  render(<MemoryRouter initialEntries={['/catalog']}><Catalog /></MemoryRouter>);
  await screen.findByText('Zombie');
  expect(svc.searchMusicBrainz).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: 'From MusicBrainz' })).toBeNull();
});
