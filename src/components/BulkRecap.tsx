// The persistent recap of a bulk action (stories 22.2 → 22.4). Extracted because the
// same 25 lines of banner had been copied to a third surface — the exact drift this
// epic exists to stop. The engine was already shared (useBulkAddToSonglist); the
// presentation is now shared too.
//
// Two things this component encodes so no caller has to remember them:
//   • `aria-label` — the shared <Toast> keeps a permanent role="status" region mounted
//     (22.5), so an unnamed live region here would be ambiguous for users and tests.
//   • the caller must pass a `key` that changes with `negative`: a live region whose
//     role mutates in place is not reliably re-announced, remounting it is.
//
// It is deliberately NOT rendered inside <BulkActionBar>: the bar unmounts itself at
// zero selection, and a settled batch empties the selection — a recap living in its
// children would vanish exactly when it must be read.
export function BulkRecap({
  message,
  negative,
  onDismiss,
  className,
}: {
  message: string;
  negative: boolean;
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <div
      role={negative ? 'alert' : 'status'}
      aria-label="Bulk action result"
      className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
        negative
          ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
          : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
      } ${className ?? ''}`}
    >
      <p>{message}</p>
      <button
        type="button"
        className="shrink-0 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export default BulkRecap;
