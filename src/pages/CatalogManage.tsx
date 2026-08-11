import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { catalogService, CatalogNotFoundError, CollectionNotFoundError } from '../services/catalogService';
import type { CatalogListResponse, CatalogCollection } from '../services/catalogService';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BulkActionBar } from '../components/BulkActionBar';
import { ListSkeleton } from '../components/ListSkeleton';
import { Pagination } from '../components/Pagination';
import { Toast } from '../components/Toast';
import { RowSelectionCheckbox, SelectAllCheckbox } from '../components/SelectionCheckbox';
import { selectionCell } from '../utils/selectionCell';
import { useRowSelection } from '../hooks/useRowSelection';
import { runBounded, BatchSkippedError } from '../utils/runBounded';
import { useGlobalToast } from '../contexts/GlobalToastContext';
import { describeAbandonedWork, worthReporting } from '../hooks/useBulkAddToSonglist';

// Curator hub to MANAGE the shared Catalog (story 19.5). Songlist-style table:
// per-row checkboxes + a "Delete selected" bar on top (bulk delete), and a row click
// opens that entry's edit form — no per-row Edit/Delete buttons. Non-curators are
// redirected (privilege gate, not a 404 oracle). Backend CRUD + requireCurator: 19.1.

const DEBOUNCE_MS = 280;
// Bulk actions fire N unitary requests (epic 22, decision A: no bulk endpoint). The
// selection is "within-page" but SURVIVES pagination (19.9), so a batch can hold more
// than one page worth of entries — hence a pool rather than firing them all at once.
const ADD_CONCURRENCY = 4;

// Outcome of a bulk "Add to collection", kept OUTSIDE <BulkActionBar>: the bar unmounts
// itself at zero selection and a fully successful batch empties the selection, so a
// recap living in its children would vanish exactly when it must be read.
interface AddRecap {
  collectionName: string;
  added: number;
  alreadyIn: number;
  failed: number;
  unknown: number; // fulfilled with something that is neither 'added' nor 'already-in'
  collectionGone: boolean; // every failure was a 404 on the collection itself
}

export default function CatalogManage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') || '';
  const page = Math.max(1, Math.floor(Number(searchParams.get('page'))) || 1);
  // Story 20.2: the hub has two tabs — the fiches (Entries) hub and the Collections
  // hub — selected via ?tab= (URL-state, back-button parity). Default = entries.
  const tab = searchParams.get('tab') === 'collections' ? 'collections' : 'entries';

  const [searchInput, setSearchInput] = useState(search);
  const [data, setData] = useState<CatalogListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refetchToken, setRefetchToken] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Ephemeral row selection (no persistKey — a curator session, unlike the Songlist).
  const selection = useRowSelection();
  const { selected } = selection; // the live Set — selected.size / .has / Array.from stay as-is
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Story 22.2: bulk "Add to collection". The list is fetched lazily — never with the
  // page, the Entries tab has no other use for it — but on EVERY open, not once:
  // caching it is unsound, because the Collections tab of this very page can create,
  // rename and delete collections behind the menu's back (a cached entry then 404s on
  // every unitary POST and the recap blames the entries).
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [menuCollections, setMenuCollections] = useState<CatalogCollection[] | null>(null);
  const [menuError, setMenuError] = useState(false);
  const [pickedCollection, setPickedCollection] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false); // in-flight guard: two fast clicks read the same render
  const [addRecap, setAddRecap] = useState<AddRecap | null>(null);
  const menuAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const batchAbortRef = useRef<AbortController | null>(null);
  const { showGlobalToast } = useGlobalToast();
  // Selection fingerprint captured when the recap was written: the recap closes as soon
  // as the user touches the selection again (AC4), and only then — a batch's own
  // removeMany must not wipe the recap it just produced.
  const recapSelectionRef = useRef<string>('');

  // A batch is fired from a click handler, so no effect cleanup covers it: abort the
  // menu fetch and stop writing state once the page is gone.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      menuAbortRef.current?.abort();
      // Story 24.2 — drain the batch queue too: unstarted items write nothing.
      batchAbortRef.current?.abort();
    };
  }, []);

  // AC4 — the recap closes on the ✕ OR at the next selection the user makes. The
  // fingerprint is what tells a USER change apart from the batch's own removeMany.
  useEffect(() => {
    if (!addRecap) return;
    if (Array.from(selected).sort().join(',') !== recapSelectionRef.current) setAddRecap(null);
  }, [selected, addRecap]);

  // A recap describes one batch on one result set: keep it from hanging over an
  // unrelated search, page or tab (where it would even be re-announced by role=alert).
  useEffect(() => { setAddRecap(null); }, [search, page, tab]);

  // A SEARCH changes the working set, so the selection goes with it — northwood, QA
  // 2026-08-10: a "5 entries selected" bar hanging over an empty table is confusing.
  // Note this is deliberately NOT keyed on `page`: paging through the same result set
  // keeps the selection (19.9 semantics), only a new query drops it. Clearing here also
  // removes the stranded-selection problem the review of 22.2 had to paper over.
  useEffect(() => {
    if (selection.size > 0) selection.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Story 20.2: Collections tab state.
  const [collections, setCollections] = useState<CatalogCollection[] | null>(null);
  const [collectionsError, setCollectionsError] = useState(false);
  const [collectionsToken, setCollectionsToken] = useState(0);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false); // in-flight guard (Enter can fire before re-render)

  const patchParams = (changes: Record<string, string | null>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      Object.entries(changes).forEach(([k, v]) => {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      });
      return next;
    });
  };

  // Keep the input in sync when the URL changes out-of-band (back button).
  useEffect(() => { setSearchInput(search); }, [search]);

  // Debounce the text input into the URL (source of truth). Reset to page 1.
  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => patchParams({ search: searchInput || null, page: null }), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Fetch the list; abort a superseded request so stale results never paint.
  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(false);
    catalogService.listCatalog({ search, page, sort: 'artist', includeDrafts: true }, ctrl.signal)
      .then(res => { setData(res); setLoading(false); })
      .catch(err => {
        if (err?.name === 'AbortError') return;
        setError(true);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [search, page, refetchToken]);

  // Fetch the Collections list when that tab is active (StrictMode-safe abort).
  useEffect(() => {
    if (tab !== 'collections') return;
    const ctrl = new AbortController();
    setCollectionsError(false);
    catalogService.listCollections(ctrl.signal)
      .then(res => setCollections(res))
      .catch(err => { if (err?.name !== 'AbortError') setCollectionsError(true); });
    return () => ctrl.abort();
  }, [tab, collectionsToken]);

  const handleCreateCollection = async () => {
    const name = newName.trim();
    // ref guard: two rapid Enter presses read the same render-time `creating`, and
    // Collections have NO name-uniqueness backstop — without this, they'd create a dup.
    if (!name || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const created = await catalogService.createCollection(name);
      setNewName('');
      navigate(`/catalog/manage/collections/${created.uid}`);
    } catch {
      showToast('Could not create the collection.');
    } finally {
      setCreating(false);
      creatingRef.current = false;
    }
  };

  // Role gate (after hooks, so hook order is stable). Not a 404 oracle.
  if (!user?.isCurator) {
    return <Navigate to="/" replace />;
  }

  const total = data?.total ?? 0;
  const limit = data?.limit ?? 24;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const displayedUids = data?.items.map(i => i.uid) ?? [];
  const allDisplayedSelected = selection.allDisplayedSelected(displayedUids);

  // Select-all is "within": union/subtract only the displayed (paginated) uids, so a
  // selection made on another page survives — composed from the shared primitives.
  const toggleSelectAll = () => {
    if (displayedUids.every(u => selection.isSelected(u))) selection.removeMany(displayedUids);
    else selection.addMany(displayedUids);
  };

  const loadMenuCollections = () => {
    // The fetch is triggered by a click, not by an effect, so its abort has to be
    // carried by a ref and fired from the unmount cleanup above.
    menuAbortRef.current?.abort();
    const ctrl = new AbortController();
    menuAbortRef.current = ctrl;
    setMenuError(false);
    setMenuCollections(null);
    catalogService.listCollections(ctrl.signal)
      .then(res => {
        if (!mountedRef.current) return;
        setMenuCollections(res);
        // Drop a pick that the refreshed list no longer offers, otherwise Add stays
        // enabled on a ghost and clicking it does strictly nothing.
        setPickedCollection(prev => (res.some(c => c.uid === prev) ? prev : ''));
      })
      .catch(err => {
        if (err?.name === 'AbortError' || !mountedRef.current) return;
        setMenuError(true);
      });
  };

  const toggleAddMenu = () => {
    const opening = !addMenuOpen;
    setAddMenuOpen(opening);
    if (opening) loadMenuCollections();
  };

  const handleAddSelectedToCollection = async () => {
    const collection = (menuCollections ?? []).find(c => c.uid === pickedCollection);
    if (!collection || selected.size === 0 || addingRef.current) return;
    addingRef.current = true;
    setAdding(true);
    setAddRecap(null); // the previous batch's numbers must not linger over this one
    const uids = Array.from(selected);

    // Best-effort, non-atomic (same regime as the 20.3 import): one failing entry must
    // not abort the batch, and we need to know WHICH failed to keep them selected.
    const addController = new AbortController();
    batchAbortRef.current = addController;
    // Signal on the QUEUE, not the requests: in-flight adds finish so the recap is truthful.
    const results = await runBounded(uids, ADD_CONCURRENCY, uid =>
      catalogService.addSongToCollection(collection.uid, uid), addController.signal);

    const skippedAdds = results.filter(r => r.status === 'rejected' && r.reason instanceof BatchSkippedError).length;

    if (!mountedRef.current) {
      const landed = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.length - landed - skippedAdds;
      if (worthReporting(landed, failed)) {
        showGlobalToast(describeAbandonedWork({
          what: 'entries were being added to the collection', landed, skipped: skippedAdds, failed,
        }));
      }
      return;
    }

    const settled = uids.filter((_, i) => results[i].status === 'fulfilled');
    // Counted explicitly, NOT by subtracting from `settled`: an unexpected fulfilled
    // value (a backend that starts answering 204, a test stub returning undefined)
    // must not be silently reported as "already in".
    const added = results.filter(r => r.status === 'fulfilled' && r.value === 'added').length;
    const alreadyIn = results.filter(r => r.status === 'fulfilled' && r.value === 'already-in').length;
    const rejected = results.filter(r => r.status === 'rejected');
    // A collection deleted by another curator fails EVERY item for the same reason, and
    // retrying can never work — say that instead of blaming the entries.
    const collectionGone = rejected.length > 0
      && rejected.every(r => r.status === 'rejected' && r.reason instanceof CollectionNotFoundError);

    setAddRecap({
      collectionName: collection.name,
      added,
      alreadyIn,
      failed: uids.length - settled.length,
      unknown: settled.length - added - alreadyIn,
      collectionGone,
    });
    // Successful entries (added AND already-in) leave the selection; the failed ones
    // stay ticked so the batch can be replayed as-is.
    selection.removeMany(settled);
    const remaining = Array.from(selected).filter(u => !settled.includes(u));
    recapSelectionRef.current = remaining.slice().sort().join(',');
    setAddMenuOpen(false);
    setPickedCollection('');
    setAdding(false);
    addingRef.current = false;
  };

  const handleDeleteSelected = async () => {
    // `adding` too: the two bulk paths write the same selection, and interleaving them
    // deletes entries a running batch is still adding to a collection.
    if (selected.size === 0 || deleting || adding) return;
    const uids = Array.from(selected);
    setDeleting(true);
    const deleteController = new AbortController();
    batchAbortRef.current = deleteController;
    // Was Promise.allSettled: unbounded AND uncancellable. runBounded gives it the same queue
    // control as the two sibling batches — leaving one surface out would recreate exactly the
    // divergence Epic 22 spent itself removing (story 24.2, AC6).
    const results = await runBounded(uids, ADD_CONCURRENCY, u =>
      catalogService.deleteCatalogEntry(u), deleteController.signal);
    // A 404 (already gone) counts as deleted; only a real error is a failure.
    const removed = uids.filter((_, i) => {
      const r = results[i];
      return r.status === 'fulfilled' || (r.status === 'rejected' && r.reason instanceof CatalogNotFoundError);
    });
    // Never started => nothing deleted, and NOT an error to report.
    const skippedDeletes = results.filter(r => r.status === 'rejected' && r.reason instanceof BatchSkippedError).length;
    const failedCount = uids.length - removed.length - skippedDeletes;

    if (!mountedRef.current) {
      const failedDeletes = uids.length - removed.length - skippedDeletes;
      if (worthReporting(removed.length, failedDeletes)) {
        showGlobalToast(describeAbandonedWork({
          what: 'entries were being deleted', landed: removed.length,
          skipped: skippedDeletes, failed: failedDeletes,
        }));
      }
      return;
    }
    showToast(failedCount
      ? `${failedCount} entr${failedCount > 1 ? 'ies' : 'y'} could not be deleted.`
      : `${removed.length} entr${removed.length > 1 ? 'ies' : 'y'} deleted`);

    const removedSet = new Set(removed);
    const remainingOnPage = data?.items.filter(i => !removedSet.has(i.uid)).length ?? 0;
    if (remainingOnPage === 0 && page > 1) {
      // Page emptied on a non-first page → step back so we never land on a blank page.
      patchParams({ page: page - 1 <= 1 ? null : String(page - 1) });
    } else if (remainingOnPage === 0) {
      // Page 1 emptied: there is no page to step back to, and the local splice would leave an
      // empty page whose "Back to first page" button patches `page` to null while it is ALREADY
      // 1 — the effect deps never change, so it never re-runs and the screen is stuck until a
      // search or a reload. Ask the server instead: on a multi-page catalog the entries from
      // page 2 shift up, and on a truly empty one the empty state is the honest answer.
      setRefetchToken(t => t + 1);
    } else {
      setData(prev => prev
        ? { ...prev, items: prev.items.filter(i => !removedSet.has(i.uid)), total: Math.max(0, prev.total - removed.length) }
        : prev);
    }
    selection.removeMany(removed);
    setDeleting(false);
    setConfirmOpen(false);
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Manage the Catalog</h1>
        {tab === 'entries' && (
          <Link to="/catalog/admin" className="btn-primary text-sm shrink-0">New entry</Link>
        )}
      </div>

      {/* Story 20.2 — Entries | Collections tabs. */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-4" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'entries'}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === 'entries' ? 'border-brand-500 text-brand-600 dark:text-brand-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
          onClick={() => patchParams({ tab: null })}
        >
          Entries
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'collections'}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === 'collections' ? 'border-brand-500 text-brand-600 dark:text-brand-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
          onClick={() => patchParams({ tab: 'collections' })}
        >
          Collections
        </button>
      </div>

      {tab === 'collections' && (
        <div>
          {/* New collection */}
          <div className="flex items-center gap-2 mb-4">
            <input
              type="text"
              className="input-base"
              aria-label="New collection name"
              placeholder="New collection name…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateCollection(); }}
            />
            <button type="button" className="btn-primary text-sm shrink-0" onClick={handleCreateCollection} disabled={creating || !newName.trim()}>
              {creating ? 'Creating…' : 'New collection'}
            </button>
          </div>

          {collectionsError ? (
            <div className="text-center py-10">
              <p className="text-gray-600 dark:text-gray-300">Something went wrong.</p>
              <button type="button" className="btn-secondary mt-3" onClick={() => setCollectionsToken(t => t + 1)}>Retry</button>
            </div>
          ) : collections === null ? (
            <ListSkeleton rows={4} />
          ) : collections.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 py-10 text-center">No collections yet — create the first one.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700">
              {collections.map(c => (
                <li key={c.uid}>
                  <button
                    type="button"
                    className="w-full text-left flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    onClick={() => navigate(`/catalog/manage/collections/${c.uid}`)}
                  >
                    <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{c.name}</span>
                    <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">{c.songCount} {c.songCount === 1 ? 'entry' : 'entries'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'entries' && (<>
      <input
        type="search"
        aria-label="Search the catalog"
        className="input-base"
        placeholder="Search by title or artist…"
        value={searchInput}
        onChange={e => setSearchInput(e.target.value)}
      />

      {/* Bulk-action bar: the shared Songlist-style shell (22.1). It hides itself when
          nothing is selected, so there is no guard here. */}
      <BulkActionBar count={selected.size} noun="entry" nounPlural="entries" className="mt-4">
        {/* Story 22.2 — push the selection into an existing Collection. The menu is
            `absolute` inside this `relative` wrapper (mirror of the Songlist playlist
            picker): the bar is a .glass-effect card, whose backdrop-filter makes it a
            containing block — a `fixed` menu would anchor to the bar, not the viewport. */}
        <div className="relative">
          <button
            type="button"
            className="btn-primary text-sm px-3 py-1.5"
            onClick={toggleAddMenu}
            disabled={adding || deleting}
            aria-haspopup="menu"
            aria-expanded={addMenuOpen}
          >
            Add to collection
          </button>
          {addMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-72 rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 shadow-lg z-20 p-3"
              onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setAddMenuOpen(false); } }}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-700 dark:text-gray-200">Select a collection</p>
                <button
                  type="button"
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  onClick={() => setAddMenuOpen(false)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {menuError ? (
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  Could not load the collections.{' '}
                  <button type="button" className="text-brand-600 dark:text-brand-400 hover:underline" onClick={loadMenuCollections}>Retry</button>
                </div>
              ) : menuCollections === null ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
              ) : menuCollections.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No collections yet.{' '}
                  <button type="button" className="text-brand-600 dark:text-brand-400 hover:underline" onClick={() => patchParams({ tab: 'collections' })}>
                    Create one
                  </button>
                </p>
              ) : (
                <>
                  <div className="max-h-48 overflow-y-auto space-y-1 mb-3">
                    {menuCollections.map(c => (
                      <button
                        key={c.uid}
                        type="button"
                        aria-pressed={pickedCollection === c.uid}
                        className={`w-full flex items-center justify-between gap-2 text-left p-2 rounded min-h-[44px] ${pickedCollection === c.uid ? 'bg-brand-100 dark:bg-brand-900/40' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                        onClick={() => setPickedCollection(c.uid)}
                      >
                        <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{c.name}</span>
                        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{c.songCount}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="text-sm px-3 py-1 rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => setAddMenuOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="text-sm px-3 py-1 rounded-md bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
                      onClick={handleAddSelectedToCollection}
                      disabled={!pickedCollection || adding}
                    >
                      {adding ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          className="inline-flex items-center rounded-md bg-red-600 text-white px-3 py-1.5 text-sm hover:bg-red-700 disabled:opacity-50"
          onClick={() => setConfirmOpen(true)}
          disabled={deleting || adding}
        >
          Delete selected
        </button>
        {/* The selection survives pagination and a search change, so an entry left
            ticked by a failed batch can scroll out of reach — its row checkbox is the
            only other way to untick it. This is the escape hatch. */}
        <button
          type="button"
          className="inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          onClick={() => selection.clear()}
          disabled={deleting || adding}
        >
          Clear selection
        </button>
      </BulkActionBar>

      {/* Recap of the last bulk add. Deliberately a SIBLING of the bar, not a child:
          the bar unmounts at zero selection and a fully successful batch empties the
          selection, so a recap inside it would disappear as it is written. Persistent
          (not a toast — lesson 20.4) and segmented: an already-member entry is an
          outcome, never a failure. */}
      {addRecap && (
        <div
          // Keyed on the severity: a live region whose role mutates in place is not
          // reliably re-announced — remounting it is.
          key={addRecap.failed > 0 ? 'recap-alert' : 'recap-status'}
          role={addRecap.failed > 0 ? 'alert' : 'status'}
          // Named: the shared <Toast> keeps a permanent role="status" region mounted
          // (22.5), so an unnamed one here would be ambiguous for users and tests alike.
          aria-label="Bulk action result"
          className={`mt-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            addRecap.failed > 0
              ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
              : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
          }`}
        >
          <p>
            {addRecap.collectionGone
              // Every single call 404'd on the collection: another curator deleted it.
              // Retrying cannot work, so don't offer it.
              ? `"${addRecap.collectionName}" no longer exists — nothing was added. Pick another collection.`
              : addRecap.added === 0 && addRecap.failed === 0 && addRecap.unknown === 0
                // A no-op batch says so plainly instead of a degraded "0 added".
                ? `All ${addRecap.alreadyIn} ${addRecap.alreadyIn === 1 ? 'entry was' : 'entries were'} already in "${addRecap.collectionName}".`
                : [
                    `${addRecap.added} added`,
                    addRecap.alreadyIn > 0 ? `${addRecap.alreadyIn} already in` : null,
                    addRecap.failed > 0 ? `${addRecap.failed} failed` : null,
                    addRecap.unknown > 0 ? `${addRecap.unknown} unclear` : null,
                  ].filter(Boolean).join(' · ') + ` — "${addRecap.collectionName}".`}
            {addRecap.failed > 0 && !addRecap.collectionGone && ' The failed entries are still selected, so you can retry.'}
          </p>
          <button
            type="button"
            className="shrink-0 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            onClick={() => setAddRecap(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200 mt-6 mb-2" aria-live="polite">
        {search.trim() ? `Results (${total})` : `All entries (${total})`}
      </h2>

      {loading && !data && (
        <ListSkeleton rows={6} />
      )}

      {error && (
        <div className="text-center py-10">
          <p className="text-gray-600 dark:text-gray-300">Something went wrong.</p>
          <button
            type="button"
            className="btn-secondary mt-3"
            onClick={() => { setError(false); setLoading(true); setRefetchToken(t => t + 1); }}
          >
            Retry
          </button>
        </div>
      )}

      {!error && data && (
        <div className={loading ? 'opacity-50 transition-opacity duration-150' : 'transition-opacity duration-150'} aria-busy={loading}>
          {data.total === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 py-10 text-center">
              {search.trim() ? 'No entries match your search.' : 'The Catalog is empty — add the first entry.'}
            </p>
          ) : data.items.length === 0 ? (
            // Out-of-range page (deep-link ?page=99, or a delete emptied it): never a
            // dead-end — offer a way back to the first page.
            <div className="py-10 text-center">
              <p className="text-gray-500 dark:text-gray-400 mb-3">This page is empty.</p>
              <button type="button" className="btn-secondary" onClick={() => patchParams({ page: null })}>Back to first page</button>
            </div>
          ) : (
            <>
              <div className="overflow-auto max-h-[65vh] rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
                    <tr className="text-left text-gray-500 dark:text-gray-400">
                      <th className={selectionCell('px-3 py-2 w-12 text-center')}>
                        <SelectAllCheckbox
                          allSelected={allDisplayedSelected}
                          onToggle={toggleSelectAll}
                          disabled={adding || deleting}
                        />
                      </th>
                      <th className="px-3 py-2 font-medium">Artist</th>
                      <th className="px-3 py-2 font-medium">Title</th>
                      <th className="px-3 py-2 font-medium">Key</th>
                      <th className="px-3 py-2 font-medium">Mode</th>
                      <th className="px-3 py-2 font-medium text-right">Time signature</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map(entry => {
                      const isSel = selected.has(entry.uid);
                      return (
                        <tr
                          key={entry.uid}
                          onClick={() => navigate(`/catalog/admin/${entry.uid}`)}
                          className={`border-t border-gray-100 dark:border-gray-700 cursor-pointer ${isSel ? 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/40 dark:hover:bg-blue-900/60' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                        >
                          {/* Checkbox cell: selection only — the primitive stops propagation
                              so ticking it doesn't open the entry. */}
                          <td className={selectionCell('px-3 py-2 w-12 text-center')}>
                            <RowSelectionCheckbox
                              checked={isSel}
                              onChange={() => selection.toggle(entry.uid)}
                              label={entry.artist ? `${entry.title} by ${entry.artist}` : entry.title}
                              disabled={adding || deleting}
                            />
                          </td>
                          <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">{entry.artist || '—'}</td>
                          <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                            {entry.title}
                            {entry.publishedAt == null && (
                              <span className="ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Draft</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{entry.key || '—'}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{entry.mode || '—'}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap text-right">{entry.timeSignature || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} totalPages={totalPages} onPageChange={p => patchParams({ page: String(p) })} />
            </>
          )}
        </div>
      )}
      </>)}

      <ConfirmDialog
        isOpen={confirmOpen}
        title={`Delete ${selected.size} catalog entr${selected.size > 1 ? 'ies' : 'y'}`}
        message={`Delete ${selected.size} selected entr${selected.size > 1 ? 'ies' : 'y'} from the Catalog? Users who already added ${selected.size > 1 ? 'these songs' : 'this song'} keep their own copy.`}
        confirmText={deleting ? 'Deleting…' : 'Delete'}
        cancelText="Cancel"
        isDangerous
        onConfirm={handleDeleteSelected}
        onCancel={() => { if (!deleting) setConfirmOpen(false); }}
      />

      <Toast message={toastMessage} />
    </div>
  );
}
