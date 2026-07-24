import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { songService, RefreshFromCatalogError } from '../services/songService';
import type { Song } from '../services/songService';
import { ConfirmDialog } from './ConfirmDialog';

// Story 21.2: on a Song fiche, surface the Catalog source (provenance + link) and offer a
// Refresh when the source has drifted. Self-contained (own getSong fetch) so the ~2000-line
// Songs.tsx doesn't grow fetch/state — dropped in with one element. Renders NOTHING when the
// song isn't a Catalog copy or its source is gone/unpublished (getSong omits `sourceCatalog`).

export default function CatalogSourceBanner({
  songUid,
  onRefreshed,
}: {
  songUid: string;
  onRefreshed?: (song: Song) => void;
}) {
  const [source, setSource] = useState<Song['sourceCatalog'] | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  // A refresh POST can outlive this banner: the parent keys us by songUid, so switching songs
  // unmounts this instance while the request is still in flight. Guard the post-await setState /
  // onRefreshed so a resolved refresh never contaminates the next song's fiche.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true; // reset on (re)mount — StrictMode runs cleanup then setup again
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch the source-link/drift info for this song (StrictMode-safe, abortable).
  useEffect(() => {
    const ctrl = new AbortController();
    setFeedback(null);
    songService.getSong(songUid)
      .then(song => { if (!ctrl.signal.aborted) setSource(song.sourceCatalog ?? null); })
      .catch(err => { if (!ctrl.signal.aborted) console.error('CatalogSourceBanner: failed to load song source', err); }); // degrade: no banner
    return () => ctrl.abort();
  }, [songUid]);

  // Nothing to show unless there's a source link/banner OR a lingering feedback message
  // (e.g. an error after the source vanished).
  if (!source && !feedback) return null;

  const handleRefresh = async () => {
    if (refreshing || !source) return;
    setRefreshing(true);
    try {
      const updated = await songService.refreshSongFromCatalog(songUid);
      if (!mountedRef.current) return; // banner unmounted mid-request → don't touch the next song
      setSource(updated.sourceCatalog ?? { ...source, drift: false }); // drift cleared
      setFeedback({ message: 'Updated to the Catalog version.', isError: false });
      setConfirmOpen(false);
      onRefreshed?.(updated);
    } catch (err) {
      if (!mountedRef.current) return;
      // Both 409 codes mean the link is dead: source unpublished/deleted, or the song is no
      // longer a Catalog copy. Clear the source either way so the user can't re-hit a dead-end.
      if (err instanceof RefreshFromCatalogError) {
        setSource(null);
        setFeedback({
          message: err.code === 'source_unavailable'
            ? 'The source is no longer in the Catalog.'
            : 'This song is no longer linked to the Catalog.',
          isError: true,
        });
      } else {
        setFeedback({ message: 'Could not refresh from the Catalog.', isError: true });
      }
      setConfirmOpen(false);
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  };

  return (
    <div className="mb-4 space-y-2">
      {/* Provenance (Niveau 1) */}
      {source && (
        <p className="flex flex-wrap items-center gap-x-1 text-sm text-gray-500 dark:text-gray-400">
          <span aria-hidden="true">↳</span>Added from the
          <Link
            to={`/catalog/${source.uid}`}
            className="inline-flex min-h-[44px] items-center text-brand-600 dark:text-brand-400 hover:underline"
          >
            Catalog
          </Link>
        </p>
      )}

      {/* Drift banner + Refresh */}
      {source?.drift && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-4 py-3">
          <span className="text-sm text-amber-800 dark:text-amber-200">A newer version of this song is in the Catalog.</span>
          <button
            type="button"
            className="btn-secondary text-sm min-h-[44px] shrink-0"
            onClick={() => setConfirmOpen(true)}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      )}

      {feedback && (
        <div
          role={feedback.isError ? 'alert' : 'status'}
          aria-live={feedback.isError ? 'assertive' : 'polite'}
          className={`rounded-md px-3 py-2 text-sm font-medium ${feedback.isError
            ? 'border border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
            : 'border border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300'}`}
        >
          {feedback.message}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Refresh from the Catalog"
        message="Update key, BPM, etc. to the Catalog version? Your instrument, tuning and notes are kept."
        confirmText={refreshing ? 'Refreshing…' : 'Refresh'}
        cancelText="Cancel"
        onConfirm={handleRefresh}
        onCancel={() => { if (!refreshing) setConfirmOpen(false); }}
      />
    </div>
  );
}
