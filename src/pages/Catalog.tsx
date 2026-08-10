import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { catalogService } from '../services/catalogService';
import type { CatalogListResponse, CatalogFacets, CatalogCollection } from '../services/catalogService';
import CatalogList from '../components/CatalogList';
import CatalogFilters from '../components/CatalogFilters';
import CollectionCard from '../components/CollectionCard';
import { ListSkeleton } from '../components/ListSkeleton';
import { Pagination } from '../components/Pagination';
import { useSonglistMatcher } from '../hooks/useSonglistMatcher';
import { useRowSelection } from '../hooks/useRowSelection';
import { useBulkAddToSonglist, describeAddRecap, isAddRecapNegative } from '../hooks/useBulkAddToSonglist';
import { BulkRecap } from '../components/BulkRecap';
import { BulkActionBar } from '../components/BulkActionBar';
import { ConfirmDialog } from '../components/ConfirmDialog';

const EMPTY_FACETS: CatalogFacets = { genre: [], key: [], mode: [], timeSignature: [] };
const asArr = (s: string): string[] => (s ? s.split(',').filter(Boolean) : []);

// Browse the shared Catalog (story 19.3). READ-ONLY surface: search + intrinsic
// filters + paginated list. The "Add to my songlist" button + duplicate flag are
// story 19.4; the Collections/Recently-added rails are Epic 20.
//
// URL-as-state (DL-10): useSearchParams is the SINGLE source of truth for search +
// filters + page. No mirrored useState. Back-button restores the view for free.

const DEBOUNCE_MS = 280;

export default function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') || '';
  const key = searchParams.get('key') || '';
  const mode = searchParams.get('mode') || '';
  const timeSignature = searchParams.get('timeSignature') || '';
  const genre = searchParams.get('genre') || '';
  const page = Math.max(1, Math.floor(Number(searchParams.get('page'))) || 1);

  // Whitespace-only search is not a real query (the server trims it) → don't flip
  // the title to "Results (n)" for it.
  const hasQuery = !!(search.trim() || key || mode || timeSignature || genre);

  const [searchInput, setSearchInput] = useState(search);
  const [data, setData] = useState<CatalogListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refetchToken, setRefetchToken] = useState(0); // bumped by Retry to force a refetch
  const abortRef = useRef<AbortController | null>(null);
  const { findExisting, addToCache, refresh: refreshSonglist } = useSonglistMatcher(); // client-side "already in songlist" flag (19.4)
  const [facets, setFacets] = useState<CatalogFacets>(EMPTY_FACETS);
  // Story 20.4: the Collections rail (shown above the list when there is no query).
  const [collections, setCollections] = useState<CatalogCollection[] | null>(null);

  // Story 22.4: reader-side selection. Ephemeral (no persistKey) and "within-page" like
  // the curator table — it SURVIVES pagination, which is why a Clear selection escape
  // hatch is mandatory: a song left ticked can scroll out of reach.
  const selection = useRowSelection();
  const bulkAdd = useBulkAddToSonglist(addToCache);
  const [confirmAddOpen, setConfirmAddOpen] = useState(false);

  // The recap closes at the user's next selection gesture — driven by the handlers, not
  // by comparing snapshots (an empty-selection fingerprint kills the recap on the very
  // frame it appears; lesson from 22.3).
  const userToggle = (uid: string) => { bulkAdd.setRecap(null); selection.toggle(uid); };
  const clearSelection = () => { bulkAdd.setRecap(null); selection.clear(); };

  // A recap describes one batch over one result set: a new search, filter or page makes
  // it describe rows that are no longer there — and its "retry" advice unactionable.
  useEffect(() => { bulkAdd.setRecap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, key, mode, timeSignature, genre, page]);

  // A new query or facet = a new working set: the selection goes with it. Paging is NOT
  // in the deps — the selection survives pagination on purpose (19.9).
  useEffect(() => {
    if (selection.size > 0) selection.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, key, mode, timeSignature, genre]);

  const handleAddSelected = async () => {
    const result = await bulkAdd.run(Array.from(selection.selected));
    if (!result) return;
    selection.removeMany(result.settledUids);
    // A 409 without its song leaves the duplicate flag unknowable from the response —
    // reload the songlist so those rows stop advertising "Add".
    if (result.recap.needsSonglistRefresh) refreshSonglist();
    setConfirmAddOpen(false);
  };

  // Facet values (distinct across the whole Catalog) for the filter pills. Loaded once.
  useEffect(() => {
    const ctrl = new AbortController();
    catalogService.getFacets(ctrl.signal)
      .then(f => setFacets(f))
      .catch(() => { /* degrade: no pills, search still works */ });
    return () => ctrl.abort();
  }, []);

  // Collections for the rail. Loaded once; on error stays null → the rail is absent.
  useEffect(() => {
    const ctrl = new AbortController();
    catalogService.listCollections(ctrl.signal)
      .then(c => setCollections(c))
      .catch(() => { /* degrade: no rail */ });
    return () => ctrl.abort();
  }, []);

  // Toggle a value in a comma-separated multi-select filter param (resets to page 1).
  const toggleFacet = (param: 'genre' | 'key' | 'mode' | 'timeSignature', value: string) => {
    const current = asArr(searchParams.get(param) || '');
    const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
    patchParams({ [param]: next.length ? next.join(',') : null, page: null });
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

  // Keep the text input in sync when the URL changes out-of-band (back button).
  useEffect(() => { setSearchInput(search); }, [search]);

  // Debounce the text input into the URL (the source of truth). Reset to page 1.
  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => patchParams({ search: searchInput || null, page: null }), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Fetch whenever the URL-derived query changes; abort a superseded request so
  // out-of-order responses never paint stale results.
  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(false);
    catalogService.listCatalog({ search, key, mode, timeSignature, genre, page }, ctrl.signal)
      .then(res => { setData(res); setLoading(false); })
      .catch(err => {
        if (err?.name === 'AbortError') return;
        setError(true);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [search, key, mode, timeSignature, genre, page, refetchToken]);

  const total = data?.total ?? 0;
  const limit = data?.limit ?? 24;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const displayedUids = data?.items.map(i => i.uid) ?? [];
  const allDisplayedSelected = selection.allDisplayedSelected(displayedUids);
  // Select-all is "within page": it unions/subtracts only what is on screen, so a
  // selection made on another page survives.
  const userSelectAll = () => {
    bulkAdd.setRecap(null);
    if (allDisplayedSelected) selection.removeMany(displayedUids);
    else selection.addMany(displayedUids);
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Catalog</h1>

      {/* Search is always above the list (DL-5). */}
      <input
        type="search"
        aria-label="Search the catalog"
        className="input-base"
        placeholder="Search by title or artist…"
        value={searchInput}
        onChange={e => setSearchInput(e.target.value)}
      />

      <div className="mt-4">
        <CatalogFilters
          facets={facets}
          selected={{ genre: asArr(genre), key: asArr(key), mode: asArr(mode), timeSignature: asArr(timeSignature) }}
          onToggle={toggleFacet}
        />
      </div>

      {/* Collections rail (DL-5): above the list, only with no query; folds away on search.
          Empty collections (songCount 0 — e.g. all-draft members for a non-curator) are
          hidden so a tile is never a dead-end. */}
      {(() => {
        const railCollections = (!hasQuery && collections) ? collections.filter(c => c.songCount > 0) : [];
        return railCollections.length > 0 && (
          <section className="mt-6" aria-labelledby="collections-rail-heading">
            <h2 id="collections-rail-heading" className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">Collections</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {railCollections.map(c => <CollectionCard key={c.uid} collection={c} />)}
            </div>
          </section>
        );
      })()}

      <div className="flex items-center justify-between mt-6 mb-2">
        <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200" aria-live="polite">
          {hasQuery ? `Results (${total})` : 'All songs'}
        </h2>
        {hasQuery && (
          <button type="button" className="btn-secondary text-xs" onClick={() => setSearchParams(new URLSearchParams())}>
            Clear filters
          </button>
        )}
      </div>

      {/* Skeleton ONLY on the first load (no data yet). On a re-fetch (filter/search
          change) we keep the current list visible and just dim it — no flash. */}
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

      {/* Bulk bar + recap live OUTSIDE the results branch: a filter with no matches (or
          a failed refetch) must not take away the recap of a batch that just wrote to
          the songlist, nor the Clear selection escape hatch for a selection that
          survives pagination. */}
      <BulkActionBar count={selection.size} noun="song" nounPlural="songs" className="mb-4">
        <button
          type="button"
          className="btn-primary text-sm px-3 py-1.5"
          onClick={() => setConfirmAddOpen(true)}
          disabled={bulkAdd.running}
        >
          Add selected to my songlist
        </button>
        <button
          type="button"
          className="inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          onClick={clearSelection}
          disabled={bulkAdd.running}
        >
          Clear selection
        </button>
      </BulkActionBar>

      {bulkAdd.recap && (
        <BulkRecap
          key={isAddRecapNegative(bulkAdd.recap) ? 'recap-alert' : 'recap-status'}
          message={describeAddRecap(bulkAdd.recap)}
          negative={isAddRecapNegative(bulkAdd.recap)}
          onDismiss={() => bulkAdd.setRecap(null)}
          className="mb-4"
        />
      )}

      {!error && data && (
        <div className={loading ? 'opacity-50 transition-opacity duration-150' : 'transition-opacity duration-150'} aria-busy={loading}>
          {data.total === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 py-10 text-center">
              {hasQuery ? 'No songs match your search.' : 'The Catalog is filling up — check back soon.'}
            </p>
          ) : (
            <>
              {data.items.length > 0
                ? <CatalogList
                    items={data.items}
                    existingFor={findExisting}
                    onAdded={addToCache}
                    selectedUids={selection.selected}
                    onToggle={userToggle}
                    allSelected={allDisplayedSelected}
                    onToggleAll={userSelectAll}
                    selectionDisabled={bulkAdd.running || loading}
                  />
                : <p className="text-gray-500 dark:text-gray-400 py-6 text-center">This page is empty — go back to a previous page.</p>}
              <Pagination page={page} totalPages={totalPages} onPageChange={p => patchParams({ page: String(p) })} />
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmAddOpen}
        title={`Add ${selection.size} ${selection.size === 1 ? 'song' : 'songs'} to my songlist`}
        // Spelled out on purpose: the neighbouring "Add collection to my songlist"
        // button DOES create a mirror playlist (20.3). A subset does not (epic 22,
        // decision B), and the two must not look interchangeable.
        message={`Add ${selection.size} selected ${selection.size === 1 ? 'song' : 'songs'} to your Songlist? No playlist is created — only the whole-collection shortcut does that.`}
        confirmText={bulkAdd.running ? 'Adding…' : 'Add to my songlist'}
        cancelText="Cancel"
        onConfirm={handleAddSelected}
        onCancel={() => { if (!bulkAdd.running) setConfirmAddOpen(false); }}
      />
    </div>
  );
}
