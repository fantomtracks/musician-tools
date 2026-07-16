import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { catalogService, CatalogNotFoundError } from '../services/catalogService';
import type { CatalogListResponse } from '../services/catalogService';
import { ConfirmDialog } from '../components/ConfirmDialog';

// Curator hub to MANAGE the shared Catalog (story 19.5). Songlist-style table:
// per-row checkboxes + a "Delete selected" bar on top (bulk delete), and a row click
// opens that entry's edit form — no per-row Edit/Delete buttons. Non-curators are
// redirected (privilege gate, not a 404 oracle). Backend CRUD + requireCurator: 19.1.

const DEBOUNCE_MS = 280;

export default function CatalogManage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') || '';
  const page = Math.max(1, Math.floor(Number(searchParams.get('page'))) || 1);

  const [searchInput, setSearchInput] = useState(search);
  const [data, setData] = useState<CatalogListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refetchToken, setRefetchToken] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2500);
  };

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

  // Role gate (after hooks, so hook order is stable). Not a 404 oracle.
  if (!user?.isCurator) {
    return <Navigate to="/" replace />;
  }

  const total = data?.total ?? 0;
  const limit = data?.limit ?? 24;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const displayedUids = data?.items.map(i => i.uid) ?? [];
  const allDisplayedSelected = displayedUids.length > 0 && displayedUids.every(u => selected.has(u));

  const toggleSelect = (uid: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(uid)) next.delete(uid); else next.add(uid);
    return next;
  });

  const toggleSelectAll = () => setSelected(prev => {
    const next = new Set(prev);
    if (displayedUids.every(u => next.has(u))) displayedUids.forEach(u => next.delete(u));
    else displayedUids.forEach(u => next.add(u));
    return next;
  });

  const handleDeleteSelected = async () => {
    if (selected.size === 0 || deleting) return;
    const uids = Array.from(selected);
    setDeleting(true);
    const results = await Promise.allSettled(uids.map(u => catalogService.deleteCatalogEntry(u)));
    // A 404 (already gone) counts as deleted; only a real error is a failure.
    const removed = uids.filter((_, i) => {
      const r = results[i];
      return r.status === 'fulfilled' || (r.status === 'rejected' && r.reason instanceof CatalogNotFoundError);
    });
    const failedCount = uids.length - removed.length;
    showToast(failedCount
      ? `${failedCount} entr${failedCount > 1 ? 'ies' : 'y'} could not be deleted.`
      : `${removed.length} entr${removed.length > 1 ? 'ies' : 'y'} deleted`);

    const removedSet = new Set(removed);
    const remainingOnPage = data?.items.filter(i => !removedSet.has(i.uid)).length ?? 0;
    if (remainingOnPage === 0 && page > 1) {
      // Page emptied on a non-first page → step back so we never land on a blank page.
      patchParams({ page: page - 1 <= 1 ? null : String(page - 1) });
    } else {
      setData(prev => prev
        ? { ...prev, items: prev.items.filter(i => !removedSet.has(i.uid)), total: Math.max(0, prev.total - removed.length) }
        : prev);
    }
    setSelected(prev => { const n = new Set(prev); removed.forEach(u => n.delete(u)); return n; });
    setDeleting(false);
    setConfirmOpen(false);
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Manage the Catalog</h1>
        <Link to="/catalog/admin" className="btn-primary text-sm shrink-0">New entry</Link>
      </div>

      <input
        type="search"
        aria-label="Search the catalog"
        className="input-base"
        placeholder="Search by title or artist…"
        value={searchInput}
        onChange={e => setSearchInput(e.target.value)}
      />

      {/* Bulk-action bar (Songlist-style): shows once entries are selected. */}
      {selected.size > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{selected.size} selected</span>
          <button
            type="button"
            className="inline-flex items-center rounded-md bg-red-600 text-white px-3 py-1.5 text-sm hover:bg-red-700 disabled:opacity-50"
            onClick={() => setConfirmOpen(true)}
            disabled={deleting}
          >
            Delete selected
          </button>
        </div>
      )}

      <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200 mt-6 mb-2" aria-live="polite">
        {search.trim() ? `Results (${total})` : `All entries (${total})`}
      </h2>

      {loading && !data && (
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 rounded bg-gray-100 dark:bg-gray-700 animate-pulse" />
          ))}
        </div>
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
                      <th className="px-3 py-2 w-12 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-brand-500 dark:accent-brand-400"
                          checked={allDisplayedSelected}
                          onChange={toggleSelectAll}
                          aria-label={allDisplayedSelected ? 'Deselect all' : 'Select all'}
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
                          {/* Checkbox cell: selection only; stop propagation so ticking it doesn't open the entry. */}
                          <td className="px-3 py-2 w-12 text-center" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer accent-brand-500 dark:accent-brand-400"
                              checked={isSel}
                              onChange={() => toggleSelect(entry.uid)}
                              aria-label={`Select ${entry.title}`}
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
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-4">
                  <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => patchParams({ page: String(page - 1) })}>Previous</button>
                  <span className="text-sm text-gray-500 dark:text-gray-400">Page {page} of {totalPages}</span>
                  <button type="button" className="btn-secondary" disabled={page >= totalPages} onClick={() => patchParams({ page: String(page + 1) })}>Next</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

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

      {toastMessage && (
        <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
