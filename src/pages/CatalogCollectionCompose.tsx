import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { catalogService, CollectionNotFoundError } from '../services/catalogService';
import type { CatalogCollectionDetail, CatalogSong } from '../services/catalogService';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ListSkeleton } from '../components/ListSkeleton';
import { Toast } from '../components/Toast';
import { BulkActionBar } from '../components/BulkActionBar';
import { RowSelectionCheckbox, SelectAllCheckbox } from '../components/SelectionCheckbox';
import { selectionCell } from '../utils/selectionCell';
import { useRowSelection } from '../hooks/useRowSelection';
import { runBounded, BatchSkippedError } from '../utils/runBounded';
import { useGlobalToast } from '../contexts/GlobalToastContext';
import {
  comboboxInputAria,
  comboboxOptionAria,
  handleComboKeyDown,
  useScrollHighlightIntoView,
} from '../utils/comboboxKeyboard';

// Curator Collection composer (story 20.2). Lives at /catalog/manage/collections/:uid:
// rename / delete the Collection, see its member entries (Remove each), and Add entries
// via a keyboard-accessible search typeahead (no drag, DL-14). Curator-only; reuses the
// backend Collections API (20.1). The typeahead reuses the shared comboboxKeyboard utils
// (NOT AutocompleteInput, which is a string picker).

const DEBOUNCE_MS = 280;
const SEARCH_LIMIT = 10;
// Same pool as the other bulk actions (22.2). Members are not paginated, so a batch is
// bounded by the size of the collection.
const REMOVE_CONCURRENCY = 4;

// Outcome of a bulk removal, kept OUTSIDE <BulkActionBar> (it unmounts itself at zero
// selection, and a fully successful removal empties the selection — the recap would
// vanish as it is written). Two segments only: the endpoint is unconditionally
// idempotent (destroy + 200 even for an absent link), so "already removed" is not a
// state the backend can report and a rejection is always a real error.
interface RemoveRecap {
  removed: number;
  failed: number;
}

// A short "Artist · Title" label for a catalog entry.
function entryLabel(e: CatalogSong): string {
  return e.artist ? `${e.artist} · ${e.title}` : e.title;
}

function DraftBadge() {
  return (
    <span className="ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
      Draft
    </span>
  );
}

export default function CatalogCollectionCompose() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { uid = '' } = useParams();

  const [collection, setCollection] = useState<CatalogCollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [refetchToken, setRefetchToken] = useState(0);

  // Rename
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const savingNameRef = useRef(false); // in-flight guard (Enter can fire before re-render)

  // Delete
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Add-by-search typeahead
  const [searchInput, setSearchInput] = useState('');
  const [results, setResults] = useState<CatalogSong[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Story 22.3: members are a selectable table. Ephemeral selection (no persistKey) and
  // NOT paginated, so select-all REPLACES the selection instead of unioning a page in.
  const selection = useRowSelection();
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const removingRef = useRef(false); // in-flight guard: the render-time flag lags a click
  const [removeRecap, setRemoveRecap] = useState<RemoveRecap | null>(null);
  const mountedRef = useRef(true);
  const batchAbortRef = useRef<AbortController | null>(null);
  const { showGlobalToast } = useGlobalToast();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Story 24.2 — drain the queue: what has not started writes nothing.
      batchAbortRef.current?.abort();
    };
  }, []);

  // The recap closes at the user's next selection gesture. Driven by the HANDLERS, not
  // by comparing selection snapshots: a fingerprint also fires on the batch's own
  // removeMany, and on any tick that slips through the render lag before the boxes are
  // disabled — killing the recap on the very frame it appears.
  const userToggle = (uid: string) => { setRemoveRecap(null); selection.toggle(uid); };
  const userSelectAll = (uids: string[]) => {
    setRemoveRecap(null);
    if (selection.allDisplayedSelected(uids)) selection.clear();
    else selection.selectOnly(uids); // not paginated: select-all REPLACES
  };

  // A different collection means a different set of members: an inherited selection
  // would fire DELETEs at uids that are not its members (the endpoint is idempotent, so
  // they would all "succeed" and the recap would claim removals that never happened),
  // and an empty collection renders no checkbox to untick it with.
  useEffect(() => { selection.clear(); setRemoveRecap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Fetch the collection + its members (StrictMode-safe: abort on unmount/supersede).
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(false);
    setNotFound(false);
    catalogService.getCollection(uid, ctrl.signal)
      .then(res => { setCollection(res); setLoading(false); })
      .catch(err => {
        if (err?.name === 'AbortError') return;
        if (err instanceof CollectionNotFoundError) setNotFound(true);
        else setError(true);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [uid, refetchToken]);

  const memberIds = new Set((collection?.songs ?? []).map(s => s.uid));
  // Exclude current members at RENDER (not inside the search effect), so adding/removing
  // a member never refetches or reopens the dropdown, and a stale in-flight result can't
  // re-surface a just-added entry.
  const visibleResults = results.filter(r => !memberIds.has(r.uid));

  // Debounced search → catalog entries (curator sees drafts). The in-flight request is
  // aborted on cleanup (unmount / next keystroke), so it never paints after unmount.
  useEffect(() => {
    const q = searchInput.trim();
    if (!q) { setResults([]); setOpen(false); setActiveIndex(-1); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchAbortRef.current = ctrl;
      catalogService.listCatalog({ search: q, includeDrafts: true, sort: 'artist', limit: SEARCH_LIMIT }, ctrl.signal)
        .then(res => { setResults(res.items); setOpen(res.items.length > 0); setActiveIndex(-1); })
        .catch(err => { if (err?.name !== 'AbortError') { setResults([]); setOpen(false); } });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [searchInput]);

  useScrollHighlightIntoView(listRef, activeIndex, open);

  // Role gate AFTER hooks (stable hook order). Not a 404 oracle.
  if (!user?.isCurator) {
    return <Navigate to="/" replace />;
  }

  const addEntry = async (entry: CatalogSong) => {
    if (!collection || memberIds.has(entry.uid)) return;
    setOpen(false);
    setActiveIndex(-1);
    // optimistic append; dedupe in the updater so a fast double-add can't duplicate a
    // member (render-time visibleResults then drops it from the dropdown).
    setCollection(prev => (prev && !prev.songs.some(s => s.uid === entry.uid)) ? { ...prev, songs: [...prev.songs, entry] } : prev);
    try {
      await catalogService.addSongToCollection(collection.uid, entry.uid);
      showToast(`Added "${entryLabel(entry)}"`);
    } catch {
      // revert on failure
      setCollection(prev => prev ? { ...prev, songs: prev.songs.filter(s => s.uid !== entry.uid) } : prev);
      showToast('Could not add that entry.');
    }
  };

  // Bulk removal (22.3) — replaces the per-row Remove: one removal path only.
  // Best-effort like every batch in this epic: a failing entry stays in the table AND
  // stays ticked, so the batch is replayable as-is.
  const handleRemoveSelected = async () => {
    // Guards close the dialog instead of returning silently: the selection can be
    // emptied while the dialog is open (the boxes are only frozen once the batch
    // starts), and a mute "Remove 0 entries" dialog that ignores its own button is a
    // dead end.
    if (!collection || selection.size === 0) { setConfirmRemoveOpen(false); return; }
    if (removingRef.current || deleting) return;
    removingRef.current = true;
    setRemoving(true);
    setRemoveRecap(null); // the previous batch's numbers must not hang over this one
    const uids = Array.from(selection.selected);

    const controller = new AbortController();
    batchAbortRef.current = controller;

    try {
      // The signal drives the QUEUE, not the requests: an in-flight removal is allowed to
      // finish so the recap can state it truthfully (story 24.2, decision A).
      const results = await runBounded(uids, REMOVE_CONCURRENCY, u =>
        catalogService.removeSongFromCollection(collection.uid, u), controller.signal);

      const removed = uids.filter((_, i) => results[i].status === 'fulfilled');
      // Never-started items are NOT failures — they touched nothing.
      const skipped = results.filter(r => r.status === 'rejected' && r.reason instanceof BatchSkippedError).length;

      if (!mountedRef.current) {
        if (removed.length) {
          showGlobalToast(`You left while removing songs: ${removed.length} removed from the collection.`
            + (skipped ? ` ${skipped} were not started.` : ''));
        }
        return;
      }

      const removedSet = new Set(removed);
      // Only what actually left the collection leaves the table.
      setCollection(prev => prev ? { ...prev, songs: prev.songs.filter(s => !removedSet.has(s.uid)) } : prev);
      setRemoveRecap({ removed: removed.length, failed: uids.length - removed.length - skipped });
      selection.removeMany(removed);
      setConfirmRemoveOpen(false);
    } finally {
      // `runBounded` never rejects, but an unexpected throw must not strand the page:
      // every control on it is gated on `removing`, including the dialog's own Cancel.
      removingRef.current = false;
      if (mountedRef.current) setRemoving(false);
    }
  };

  const startRename = () => { if (collection) { setNameDraft(collection.name); setRenaming(true); } };
  const saveRename = async () => {
    if (!collection || savingNameRef.current) return;
    const name = nameDraft.trim();
    if (!name || name === collection.name) { setRenaming(false); return; }
    savingNameRef.current = true;
    setSavingName(true);
    try {
      const updated = await catalogService.updateCollection(collection.uid, { name });
      setCollection(prev => prev ? { ...prev, name: updated.name } : prev);
      setRenaming(false);
      showToast('Collection renamed');
    } catch {
      showToast('Could not rename the collection.');
    } finally {
      setSavingName(false);
      savingNameRef.current = false;
    }
  };

  const handleDelete = async () => {
    // `removing` too: confirming a delete while a removal batch is in flight would
    // navigate away mid-batch. Freezing the header button is not enough — a dialog
    // opened BEFORE the batch started stays live.
    if (!collection || deleting || removing) return;
    setDeleting(true);
    try {
      await catalogService.deleteCollection(collection.uid);
      navigate('/catalog/manage?tab=collections');
    } catch {
      showToast('Could not delete the collection.');
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-6">
      <Link to="/catalog/manage?tab=collections" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
        ← Back to collections
      </Link>

      {loading && !collection && !notFound && (
        <ListSkeleton rows={5} className="mt-4" />
      )}

      {notFound && (
        <div className="mt-10 text-center">
          <p className="text-gray-600 dark:text-gray-300">This collection no longer exists.</p>
          <Link to="/catalog/manage?tab=collections" className="btn-secondary mt-3 inline-block">Back to collections</Link>
        </div>
      )}

      {error && (
        <div className="mt-10 text-center">
          <p className="text-gray-600 dark:text-gray-300">Something went wrong.</p>
          <button type="button" className="btn-secondary mt-3" onClick={() => setRefetchToken(t => t + 1)}>Retry</button>
        </div>
      )}

      {collection && (
        <>
          {/* Header: name + rename + delete */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {renaming ? (
              <div className="flex items-center gap-2">
                <input
                  className="input-base"
                  aria-label="Collection name"
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(false); }}
                  autoFocus
                />
                <button type="button" className="btn-primary text-sm" onClick={saveRename} disabled={savingName}>
                  {savingName ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="btn-secondary text-sm" onClick={() => setRenaming(false)} disabled={savingName}>Cancel</button>
              </div>
            ) : (
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {collection.name}
                <button type="button" className="ml-3 text-sm font-normal text-brand-600 dark:text-brand-400 hover:underline" onClick={startRename}>
                  Rename
                </button>
              </h1>
            )}
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 px-3 py-1.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
              onClick={() => setConfirmOpen(true)}
              // Frozen during a batch AND while the removal dialog is open: the two
              // destructive paths must not interleave, and two stacked modals would give
              // the page two "Cancel" buttons with no focus trap to tell them apart.
              disabled={removing || confirmRemoveOpen}
            >
              Delete collection
            </button>
          </div>

          {/* Add-by-search typeahead */}
          <div className="relative mt-6">
            <label htmlFor="collection-search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Add an entry
            </label>
            <input
              id="collection-search"
              type="text"
              className="input-base"
              placeholder="Search by title or artist…"
              value={searchInput}
              disabled={removing}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => handleComboKeyDown(e, visibleResults, activeIndex, setActiveIndex, setOpen, addEntry)}
              onFocus={() => { if (visibleResults.length > 0) setOpen(true); }}
              onBlur={() => setTimeout(() => setOpen(false), 200)}
              {...comboboxInputAria('collection-search-list', open, activeIndex)}
            />
            {open && visibleResults.length > 0 && (
              <div
                ref={listRef}
                id="collection-search-list"
                role="listbox"
                className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-50 max-h-64 overflow-y-auto"
              >
                {visibleResults.map((entry, index) => (
                  <button
                    key={entry.uid}
                    type="button"
                    {...comboboxOptionAria('collection-search-list', index, activeIndex)}
                    className={`w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-600 last:border-b-0 min-h-[44px] ${index === activeIndex ? 'bg-brand-100 dark:bg-brand-900/40' : ''}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={e => e.preventDefault() /* keep input focus so blur-close doesn't cancel the click */}
                    onClick={() => addEntry(entry)}
                  >
                    {entryLabel(entry)}
                    {entry.publishedAt == null && <DraftBadge />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Members */}
          <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200 mt-8 mb-2" aria-live="polite">
            Entries ({collection.songs.length})
          </h2>
          {/* Bulk bar: hides itself at zero selection (22.1). */}
          <BulkActionBar count={selection.size} noun="entry" nounPlural="entries">
            <button
              type="button"
              className="inline-flex items-center rounded-md bg-red-600 text-white px-3 py-1.5 text-sm hover:bg-red-700 disabled:opacity-50"
              onClick={() => setConfirmRemoveOpen(true)}
              disabled={removing || deleting || confirmOpen}
            >
              Remove selected
            </button>
          </BulkActionBar>

          {/* Recap: a SIBLING of the bar, never a child — a fully successful removal
              empties the selection and would take the recap down with the bar. */}
          {removeRecap && (
            <div
              // Keyed on severity: a live region whose role mutates in place is not
              // reliably re-announced.
              key={removeRecap.failed > 0 ? 'recap-alert' : 'recap-status'}
              role={removeRecap.failed > 0 ? 'alert' : 'status'}
              // Named: the shared <Toast> keeps a permanent role="status" region mounted.
              aria-label="Bulk action result"
              className={`mt-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
                removeRecap.failed > 0
                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                  : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
              }`}
            >
              <p>
                {[
                  `${removeRecap.removed} removed`,
                  removeRecap.failed > 0 ? `${removeRecap.failed} failed` : null,
                ].filter(Boolean).join(' · ')}.
                {removeRecap.failed > 0 && ' The failed entries are still selected, so you can retry.'}
              </p>
              <button
                type="button"
                className="shrink-0 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                onClick={() => setRemoveRecap(null)}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          )}

          {collection.songs.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 py-8 text-center">
              No entries yet — search above to add some.
            </p>
          ) : (
            <div className="mt-2 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr className="text-left text-gray-500 dark:text-gray-400">
                    <th className={selectionCell('px-3 py-2 w-12 text-center')}>
                      <SelectAllCheckbox
                        allSelected={selection.allDisplayedSelected(collection.songs.map(s => s.uid))}
                        onToggle={() => userSelectAll(collection.songs.map(s => s.uid))}
                        disabled={removing}
                      />
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">Artist</th>
                    <th scope="col" className="px-3 py-2 font-medium">Title</th>
                    <th scope="col" className="px-3 py-2 font-medium">Key</th>
                    <th scope="col" className="px-3 py-2 font-medium text-right">BPM</th>
                  </tr>
                </thead>
                <tbody>
                  {collection.songs.map(entry => (
                    // No row click: unlike the other tables, this screen has no
                    // destination to open — composing is what happens here.
                    <tr
                      key={entry.uid}
                      className={`border-t border-gray-100 dark:border-gray-700 ${selection.isSelected(entry.uid) ? 'bg-blue-50 dark:bg-blue-900/40' : ''}`}
                    >
                      <td className={selectionCell('px-3 py-2 w-12 text-center')}>
                        <RowSelectionCheckbox
                          checked={selection.isSelected(entry.uid)}
                          onChange={() => userToggle(entry.uid)}
                          label={entry.artist ? `${entry.title} by ${entry.artist}` : entry.title}
                          disabled={removing}
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">{entry.artist || '—'}</td>
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                        {entry.title}
                        {entry.publishedAt == null && <DraftBadge />}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{entry.key || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap text-right">{entry.bpm ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={confirmRemoveOpen}
        title={`Remove ${selection.size} ${selection.size === 1 ? 'entry' : 'entries'}`}
        message={collection
          ? `Remove ${selection.size} selected ${selection.size === 1 ? 'entry' : 'entries'} from "${collection.name}"? The catalog entries themselves are kept.`
          : ''}
        confirmText={removing ? 'Removing…' : 'Remove'}
        cancelText="Cancel"
        isDangerous
        onConfirm={handleRemoveSelected}
        onCancel={() => { if (!removing) setConfirmRemoveOpen(false); }}
      />

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete collection"
        message={collection ? `Delete the "${collection.name}" collection? The catalog entries themselves are kept.` : ''}
        confirmText={deleting ? 'Deleting…' : 'Delete'}
        cancelText="Cancel"
        isDangerous
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setConfirmOpen(false); }}
      />

      <Toast message={toastMessage} />
    </div>
  );
}
