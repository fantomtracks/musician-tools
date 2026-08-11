import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlobalToastContext } from './GlobalToastContext';
import Toast from '../components/Toast';

// Mounted ABOVE the router (see main.tsx) so a message raised by a page still shows after that
// page has unmounted — which is the entire point (story 24.2).
//
// Reuses the existing <Toast>: same bottom-centre bubble, same permanently-mounted
// `role="status"` live region. Writing a second toast component would have re-created the
// divergence story 22.5 spent its time removing.
const DISMISS_AFTER_MS = 6000;

export function GlobalToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showGlobalToast = useCallback((next: string) => {
    // A second batch must replace the first message, not queue behind it: the newest outcome is
    // the one the user is waiting on.
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(next);
    timerRef.current = setTimeout(() => setMessage(null), DISMISS_AFTER_MS);
  }, []);

  // StrictMode mounts twice in dev and in this project's tests; without this cleanup the first
  // unmount would leave a timer that clears a message the second mount has just set.
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Memoised so every consumer does not re-render each time the message changes.
  const value = useMemo(() => ({ showGlobalToast }), [showGlobalToast]);

  return (
    <GlobalToastContext.Provider value={value}>
      {children}
      <Toast message={message} />
    </GlobalToastContext.Provider>
  );
}

export default GlobalToastProvider;
