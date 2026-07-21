import { useEffect, useState } from 'react';
import { catalogService } from '../services/catalogService';
import type { CatalogCollection } from '../services/catalogService';
import CollectionCard from './CollectionCard';

// Story 20.4: preview of up to 3 curated Collections, shown under the empty-Songlist
// CTA (story 19.4 crochet). Self-contained (own fetch) so the giant Songs.tsx doesn't
// grow fetch state. Renders NOTHING on error or when there are no collections — the CTA
// alone remains (graceful degradation).
const PREVIEW_COUNT = 3;

export default function EmptySonglistCollections() {
  const [collections, setCollections] = useState<CatalogCollection[] | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    catalogService.listCollections(ctrl.signal)
      .then(c => setCollections(c))
      .catch(() => { /* degrade: CTA only */ });
    return () => ctrl.abort();
  }, []);

  // Hide empty collections (songCount 0) so a preview tile is never a dead-end.
  const shown = (collections ?? []).filter(c => c.songCount > 0).slice(0, PREVIEW_COUNT);
  if (shown.length === 0) return null;

  return (
    <div className="mt-10 text-left">
      <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 text-center">Or start from a collection</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {shown.map(c => <CollectionCard key={c.uid} collection={c} />)}
      </div>
    </div>
  );
}
