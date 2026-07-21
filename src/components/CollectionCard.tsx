import { Link } from 'react-router-dom';

// Story 20.4: a brand-gradient tile for a curated Collection. Presentational only
// (no fetch) — reused by the /catalog rail and the empty-Songlist preview. The whole
// tile is one target via a stretched-link (absolute inset-0), so it's a single ≥44px
// click/tap area with an accessible name.
export type CollectionCardData = {
  uid: string;
  name: string;
  songCount: number;
};

export default function CollectionCard({ collection }: { collection: CollectionCardData }) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-brand-600 to-primary-700 min-h-[88px] shadow-sm">
      {/* Scrim for text contrast over the gradient (both themes). */}
      <div className="absolute inset-0 bg-black/20" aria-hidden="true" />
      <div className="relative p-4 flex h-full flex-col justify-between">
        <h3 className="font-semibold text-white leading-tight line-clamp-2">{collection.name}</h3>
        <p className="mt-2 text-xs text-white/80">
          {collection.songCount} {collection.songCount === 1 ? 'song' : 'songs'}
        </p>
      </div>
      {/* Stretched-link: covers the whole tile. */}
      <Link
        to={`/catalog/collections/${collection.uid}`}
        className="absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded-lg"
        aria-label={`Open the ${collection.name} collection`}
      />
    </div>
  );
}
