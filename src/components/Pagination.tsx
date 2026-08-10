// The Previous / "Page X of Y" / Next footer shared by the Catalog browse and manage
// tables (story 22.5). Both pages carried it byte-identical, including the
// `{totalPages > 1 && ...}` guard — which now lives here, like <BulkActionBar>'s
// empty-selection guard, so a page can render it unconditionally.
//
// The component owns no state: `page` comes from the URL on both surfaces
// (useSearchParams is the single source of truth) and `onPageChange` writes it back.
export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  // Written as the negation of the pages' original `{totalPages > 1 && ...}` rather
  // than `totalPages <= 1`: the two differ on NaN (both comparisons are false), and a
  // NaN slipping through would otherwise render "Page 1 of NaN" with Next enabled.
  if (!(totalPages > 1)) return null;
  return (
    <div className="flex items-center justify-center gap-4 mt-4">
      <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
      <span className="text-sm text-gray-500 dark:text-gray-400">Page {page} of {totalPages}</span>
      <button type="button" className="btn-secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button>
    </div>
  );
}

export default Pagination;
