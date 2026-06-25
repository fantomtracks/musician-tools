import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { verificationService } from '../services/verificationService';

type Status = 'verifying' | 'success' | 'error';

// Public page reached from the email link (?token=…). Shared with the change-email
// confirmation (story 7.11). Verifies the token, then — if the user is logged in —
// refreshes emailVerified so the banner disappears.
function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const { isAuthenticated, user, patchUser } = useAuth();
  const [status, setStatus] = useState<Status>('verifying');
  // Run the verify exactly once: the token is single-use, so a second call (React
  // StrictMode double-invoke in dev, or a re-render) would re-POST a now-consumed
  // token and wrongly flip the page to 'error'.
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      return;
    }
    verificationService.verify(token)
      .then(() => {
        setStatus('success');
        if (isAuthenticated) patchUser({ emailVerified: true });
      })
      .catch(() => {
        // A consumed token on a redundant click / refresh isn't a real failure if
        // the (logged-in) account is already verified — show success, not an error.
        if (isAuthenticated && user?.emailVerified) {
          setStatus('success');
        } else {
          setStatus('error');
        }
      });
    // run once on mount (guarded by ranRef)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center space-y-4">
        {status === 'verifying' && (
          <p className="text-gray-600 dark:text-gray-300">Verifying your email…</p>
        )}
        {status === 'success' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Email confirmed ✓</h1>
            <p className="text-gray-600 dark:text-gray-300">Your email address is now verified.</p>
            <Link to="/songs" className="btn-primary inline-flex">Go to the app</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Link invalid or expired</h1>
            <p className="text-gray-600 dark:text-gray-300">
              This verification link can&apos;t be used. If you&apos;re signed in, request a new one from the banner; otherwise{' '}
              <Link to="/login" className="text-brand-600 dark:text-brand-400 font-medium hover:underline">sign in</Link>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default VerifyEmailPage;
