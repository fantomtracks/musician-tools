import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { catalogService } from '../services/catalogService';
import type { CatalogListResponse } from '../services/catalogService';
import CatalogList from '../components/CatalogList';

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

  const filterInput = (label: string, value: string, param: string, placeholder: string) => (
    <div>
      <label className="label-base" htmlFor={`cat-f-${param}`}>{label}</label>
      <input
        id={`cat-f-${param}`}
        className="input-base"
        value={value}
        placeholder={placeholder}
        onChange={e => patchParams({ [param]: e.target.value || null, page: null })}
      />
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        {filterInput('Key', key, 'key', 'e.g. Em')}
        {filterInput('Mode', mode, 'mode', 'e.g. minor')}
        {filterInput('Time signature', timeSignature, 'timeSignature', 'e.g. 4/4')}
        {filterInput('Genre', genre, 'genre', 'e.g. Rock')}
      </div>

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

      {loading && (
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 rounded bg-gray-100 dark:bg-gray-700 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
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

      {/* Truly no results (total 0). An out-of-range page (items empty but total>0)
          is handled below so the pagination controls stay reachable. */}
      {!loading && !error && data && data.total === 0 && (
        <p className="text-gray-500 dark:text-gray-400 py-10 text-center">
          {hasQuery ? 'No songs match your search.' : 'The Catalog is filling up — check back soon.'}
        </p>
      )}

      {!loading && !error && data && data.total > 0 && (
        <>
          {data.items.length > 0
            ? <CatalogList items={data.items} />
            : <p className="text-gray-500 dark:text-gray-400 py-6 text-center">This page is empty — go back to a previous page.</p>}
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
  );
}
