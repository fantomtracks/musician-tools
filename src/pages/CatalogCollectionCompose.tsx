import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { catalogService, CollectionNotFoundError } from '../services/catalogService';
import type { CatalogCollectionDetail, CatalogSong } from '../services/catalogService';
import { ConfirmDialog } from '../components/ConfirmDialog';
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

  const removeEntry = async (entry: CatalogSong) => {
    if (!collection) return;
    const index = collection.songs.findIndex(s => s.uid === entry.uid);
    setCollection(prev => prev ? { ...prev, songs: prev.songs.filter(s => s.uid !== entry.uid) } : prev);
    try {
      await catalogService.removeSongFromCollection(collection.uid, entry.uid);
      showToast(`Removed "${entryLabel(entry)}"`);
    } catch {
      // revert AT the original position (not the tail)
      setCollection(prev => {
        if (!prev) return prev;
        const songs = [...prev.songs];
        songs.splice(index < 0 ? songs.length : index, 0, entry);
        return { ...prev, songs };
      });
      showToast('Could not remove that entry.');
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
    if (!collection || deleting) return;
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
        <div className="mt-4 space-y-2" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 rounded bg-gray-100 dark:bg-gray-700 animate-pulse" />
          ))}
        </div>
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
              className="inline-flex items-center rounded-md border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 px-3 py-1.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/30"
              onClick={() => setConfirmOpen(true)}
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
          {collection.songs.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 py-8 text-center">
              No entries yet — search above to add some.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700">
              {collection.songs.map(entry => (
                <li key={entry.uid} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {entry.artist ? `${entry.artist} · ` : ''}{entry.title}
                      {entry.publishedAt == null && <DraftBadge />}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {entry.key || '—'}{entry.bpm ? ` · ${entry.bpm} BPM` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 min-h-[44px]"
                    onClick={() => removeEntry(entry)}
                    aria-label={`Remove ${entry.title}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

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

      {toastMessage && (
        <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
