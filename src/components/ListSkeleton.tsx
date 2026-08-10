// The two loading placeholders of the Catalog screens (story 22.5), previously copied
// row-for-row across five spots. Both are `aria-hidden` — they are visual filler, and
// the real "is it loading" signal belongs to the page (aria-busy / the fetched content).
//
// <ListSkeleton>       — a list/table placeholder: N grey bars.
// <DetailPageSkeleton> — a detail page placeholder: a title bar + a content block.
const BAR = 'rounded bg-gray-100 dark:bg-gray-700 animate-pulse';

// `rows` matches what the surface usually shows (a page of entries, a shorter list of
// collections); `className` lets a caller keep its own outer spacing.
export function ListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={className ? `space-y-2 ${className}` : 'space-y-2'} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`h-10 ${BAR}`} />
      ))}
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-3" aria-hidden="true">
      <div className={`h-8 w-2/3 ${BAR}`} />
      <div className={`h-24 ${BAR}`} />
    </div>
  );
}
