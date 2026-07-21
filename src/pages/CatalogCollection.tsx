import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { catalogService, CollectionNotFoundError } from '../services/catalogService';
import type { CatalogCollectionDetail } from '../services/catalogService';
import { ConfirmDialog } from '../components/ConfirmDialog';

// Story 20.4: user-facing detail of a curated Collection. Shows its members and lets
// the user import the WHOLE collection into their Songlist in one action (a mirror
// Playlist is created/reused server-side, story 20.3). Non-curators see published
// members only (backend draft-safety, 20.1). A deep-link to a removed collection shows
// a calm not-found. Mirrors CatalogEntry's shape.

export default function CatalogCollection() {
  const { uid } = useParams();
  const [collection, setCollection] = useState<CatalogCollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null);
  const showToast = (message: string, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    if (!uid) return;
    const ctrl = new AbortController();
    setLoading(true);
    setNotFound(false);
    setError(false);
    catalogService.getCollection(uid, ctrl.signal)
      .then(c => { setCollection(c); setLoading(false); })
      .catch(err => {
        if (err?.name === 'AbortError') return;
        if (err instanceof CollectionNotFoundError) setNotFound(true);
        else setError(true);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [uid]);

  const handleImport = async () => {
    if (!collection || importing) return;
    setImporting(true);
    try {
      const recap = await catalogService.importCollection(collection.uid);
      let message = `Added ${recap.added}`;
      if (recap.skipped > 0) message += ` · ${recap.skipped} already in your songlist`;
      if (recap.failed > 0) message += ` · ${recap.failed} failed`;
      showToast(message);
      setConfirmOpen(false);
    } catch (err) {
      showToast(err instanceof CollectionNotFoundError
        ? 'This collection no longer exists.'
        : 'Could not import the collection.', true);
      setConfirmOpen(false);
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-3" aria-hidden="true">
        <div className="h-8 w-2/3 rounded bg-gray-100 dark:bg-gray-700 animate-pulse" />
        <div className="h-24 rounded bg-gray-100 dark:bg-gray-700 animate-pulse" />
      </div>
    );
  }

  if (notFound || error || !collection) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-300">
          {notFound ? 'This collection no longer exists.' : 'Something went wrong.'}
        </p>
        <Link to="/catalog" className="btn-secondary inline-block mt-4">Browse the Catalog</Link>
      </div>
    );
  }

  const count = collection.songs.length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{collection.name}</h1>
      {collection.description && (
        <p className="mt-1 text-gray-600 dark:text-gray-300">{collection.description}</p>
      )}
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{count} {count === 1 ? 'song' : 'songs'}</p>

      <div className="my-6">
        <button
          type="button"
          className="btn-primary min-h-[44px]"
          onClick={() => setConfirmOpen(true)}
          disabled={importing || count === 0}
        >
          {importing ? 'Adding…' : 'Add collection to my songlist'}
        </button>
      </div>

      {count === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 py-6 text-center">This collection is empty.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700">
          {collection.songs.map(entry => (
            <li key={entry.uid} className="px-4 py-3">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {entry.artist ? `${entry.artist} · ` : ''}{entry.title}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {entry.key || '—'}{entry.bpm ? ` · ${entry.bpm} BPM` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Link to="/catalog" className="inline-block mt-8 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Browse the Catalog</Link>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Add collection to my songlist"
        message={`Add ${count} ${count === 1 ? 'song' : 'songs'} to your Songlist? A "${collection.name}" playlist will be created or reused.`}
        confirmText={importing ? 'Adding…' : 'Add to my songlist'}
        cancelText="Cancel"
        onConfirm={handleImport}
        onCancel={() => { if (!importing) setConfirmOpen(false); }}
      />

      {toast && (
        <div
          role={toast.isError ? 'alert' : 'status'}
          aria-live={toast.isError ? 'assertive' : 'polite'}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 text-white text-sm px-4 py-2 rounded-lg shadow-lg ${toast.isError ? 'bg-red-700' : 'bg-gray-900'}`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
