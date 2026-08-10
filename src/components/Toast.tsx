// The app's transient confirmation toast (story 22.5). Four screens carried their own
// copy of this markup; three were byte-identical and the Songlist's had drifted
// (bottom-right, a lighter grey, a larger text, a fade-in — and no `role="status"`, so
// screen readers never announced it). This is the single version: bottom-centre,
// announced.
//
// The live region stays MOUNTED and only its text changes — same reason as the history
// status of MySessionsPage: mounting a `role="status"` at the same moment as its text
// is unreliably announced by assistive tech (the region must pre-exist the mutation).
// The visible bubble itself is still conditional, so nothing is painted when idle.
// `aria-label` gives the region a stable accessible name to target in tests.
//
// Callers keep their own `const [toastMessage, setToastMessage] = useState<string | null>(null)`
// + `setTimeout(2500)` — the project convention — and just hand the value over: no
// `{toastMessage && ...}` guard per page, and deliberately NO global toast provider.
const SHELL =
  'fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50';

export function Toast({ message }: { message?: string | null }) {
  return (
    <div role="status" aria-live="polite" aria-label="Notification">
      {message ? <div className={SHELL}>{message}</div> : null}
    </div>
  );
}

export default Toast;
