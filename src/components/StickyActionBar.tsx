import type { ReactNode } from 'react';

// The shared sticky "Back / status / action" bar shell used by the Song form and the
// Catalog form (story 19.10). Only the SHELL is shared — the content (the Back button,
// the save-status indicator, the Catalog Publish button) is passed as `children` and
// stays page-specific. The shell's `flex items-center justify-between gap-3` lays the
// children out as left/right groups.
//
// className (kept byte-identical to the two former inline copies):
//   • `top-16` sits the bar just under the app header (h-16).
//   • GOTCHA: the caller MUST render this OUTSIDE any `.glass-effect` card. That card
//     uses `backdrop-filter`, which makes it a containing block — a `position: sticky`
//     child would then stick to the card (which scrolls away) instead of the viewport.
const SHELL =
  'sticky top-16 z-20 mb-4 px-4 py-3 rounded-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between gap-3';

export function StickyActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `${SHELL} ${className}` : SHELL}>{children}</div>;
}

export default StickyActionBar;
