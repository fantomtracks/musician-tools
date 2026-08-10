import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { catalogService, CatalogNotFoundError } from '../services/catalogService';
import type { CatalogSong } from '../services/catalogService';
import CatalogAddButton from '../components/CatalogAddButton';
import { DetailPageSkeleton } from '../components/ListSkeleton';
import { useSonglistMatcher } from '../hooks/useSonglistMatcher';

// Read-only detail of a Catalog entry (story 19.3). Intrinsic fields only (DL-17) +
// clickable streaming links. A deep-link to a removed/unknown entry shows a calm
// not-found. The "Add to my songlist" button is story 19.4 (no Add here).

const asList = (value: string[] | string | null | undefined): string =>
  Array.isArray(value) ? value.join(', ') : (value ?? '');

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  );
}

export default function CatalogEntry() {
  const { uid } = useParams();
  const { findExisting, addToCache } = useSonglistMatcher(); // "already in songlist" flag (19.4)
  const [entry, setEntry] = useState<CatalogSong | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const ctrl = new AbortController();
    setLoading(true);
    setNotFound(false);
    setError(false);
    catalogService.getCatalogEntry(uid, ctrl.signal)
      .then(e => { setEntry(e); setLoading(false); })
      .catch(err => {
        if (err?.name === 'AbortError') return;
        if (err instanceof CatalogNotFoundError) setNotFound(true);
        else setError(true);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [uid]);

  if (loading) {
    return (
      <DetailPageSkeleton />
    );
  }

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-300">This song is no longer in the Catalog.</p>
        <Link to="/catalog" className="btn-secondary inline-block mt-4">Browse the Catalog</Link>
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-300">Something went wrong.</p>
        <Link to="/catalog" className="btn-secondary inline-block mt-4">Browse the Catalog</Link>
      </div>
    );
  }

  const links = entry.streamingLinks || [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Artist-led header (DL-18). */}
      <p className="text-sm text-gray-500 dark:text-gray-400">{entry.artist || '—'}</p>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">{entry.title}</h1>

      <div className="mb-6">
        <CatalogAddButton entry={entry} existingSong={findExisting(entry)} onAdded={addToCache} />
      </div>

      <div className="card-base p-4 sm:p-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Key" value={entry.key} />
        <Field label="BPM" value={entry.bpm ?? undefined} />
        <Field label="Mode" value={entry.mode} />
        <Field label="Time signature" value={entry.timeSignature} />
        <Field label="Duration (s)" value={entry.durationSeconds ?? undefined} />
        <Field label="Genre" value={asList(entry.genre)} />
        <Field label="Language" value={asList(entry.language)} />
        <Field label="Album" value={entry.album} />
        <Field label="Pitch standard" value={entry.pitchStandard ?? undefined} />
      </div>

      {links.length > 0 && (
        <div className="mt-6">
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">Listen</div>
          <div className="flex flex-wrap gap-2">
            {links.map(link => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      )}

      <Link to="/catalog" className="inline-block mt-8 text-sm text-brand-600 dark:text-brand-400 hover:underline">← Browse the Catalog</Link>
    </div>
  );
}
