import type { ReactNode } from 'react';

// Amber "already exists" banner shared by the Song edit form (duplicate already in
// your songlist) and the Catalog curator form (duplicate already in the Catalog).
// Presentational only — the caller passes the message (and any action) as children,
// so both forms render the exact same box in the exact same spot (after title).
export function DuplicateBanner({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 p-3 text-sm text-amber-800 dark:text-amber-100"
    >
      {children}
    </div>
  );
}
