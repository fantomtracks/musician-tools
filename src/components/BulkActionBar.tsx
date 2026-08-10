import type { ReactNode } from 'react';

// The shared bulk-action bar shown above a list once rows are selected (story 22.1).
// The Songlist bar is the visual reference (epic 22, decision D); the Catalog manage
// bar adopted it — its former `rounded-lg border bg-gray-50` variant is gone.
//
// The component owns:
//   • the shell + the "N {noun} selected" label (the object name is a prop, so the
//     Songlist can keep its verbatim "song(s)" while the Catalog says entry/entries),
//   • the `count === 0` guard — it returns null, so no page repeats `{n > 0 && ...}`,
//   • the `flex flex-wrap gap-2` group the actions are dropped into.
// The actions themselves are 100% domain and stay in the pages, as `children`.
//
// DECISION (epic 22, C): there is NO generic <MultiSelectTable>. The columns
// legitimately differ per surface — the Songlist carries instrument/tuning/lastPlayed,
// the Catalog carries key/mode/timeSignature — so we share the BAR and the checkbox
// primitives (SelectionCheckbox.tsx), never the table. This closes the untracked
// descope of story 19.9: don't re-attempt that abstraction on the next surface.
// `relative z-30` is load-bearing, found in browser QA: `.glass-effect` uses
// backdrop-filter, which creates a STACKING CONTEXT (not only the containing block the
// project already documents). A dropdown rendered `absolute z-20` inside a child of
// this bar is therefore trapped in the bar's context, and the table that follows in the
// DOM paints straight over it — the menu shows the column headers through itself.
// Giving the bar its own z-index lifts the whole context above the table. z-30 sits
// above the sticky `thead` (z-10) and below the app header (z-40) and modals (z-50).
const SHELL = 'card-base glass-effect p-4 relative z-30';

export interface BulkActionBarProps {
  count: number;
  // Object name for the label. `noun` is used verbatim when no `nounPlural` is given
  // (the Songlist passes "song(s)"); pass both for real pluralisation ("entry"/"entries").
  noun: string;
  nounPlural?: string;
  children: ReactNode;
  className?: string;
}

export function BulkActionBar({ count, noun, nounPlural, children, className }: BulkActionBarProps) {
  // Centralised guard: render NOTHING (not an empty node) so a `space-y-*` parent keeps
  // the exact spacing it had when each page guarded the bar itself.
  if (count === 0) return null;

  const label = `${count} ${count === 1 ? noun : (nounPlural ?? noun)} selected`;

  return (
    <div className={className ? `${SHELL} ${className}` : SHELL}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{label}</span>
        <div className="flex flex-wrap gap-2">{children}</div>
      </div>
    </div>
  );
}

export default BulkActionBar;
