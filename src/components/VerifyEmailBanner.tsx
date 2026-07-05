import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { verificationService } from '../services/verificationService';
import { RateLimitError } from '../services/rateLimit';

// Persistent soft-gate banner (story 7.9): shown to a logged-in user whose email
// is not yet verified. Only when emailVerified === false (not undefined, so a
// user stored before 7.9 doesn't see it until their next login).
function VerifyEmailBanner() {
  const { isAuthenticated, user } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (!isAuthenticated || !user || user.emailVerified !== false) {
    return null;
  }

  const handleResend = async () => {
    if (!user) return;
    setMessage(null);
    try {
      setSending(true);
      await verificationService.resend(user.email);
      setMessage('Verification email sent — check your inbox.');
    } catch (err) {
      // This resend hits the same rate-limited endpoint (story 7.4) — surface the
      // clear "too many attempts" copy instead of the generic fallback (story 15.1).
      setMessage(err instanceof RateLimitError ? err.message : 'Could not send right now, please try again later.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-800 dark:bg-amber-900/40 dark:border-amber-800 dark:text-amber-200" role="status">
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span>Please verify your email to confirm your account.</span>
        <button
          type="button"
          onClick={handleResend}
          disabled={sending}
          className="font-medium underline hover:no-underline disabled:opacity-60"
        >
          {sending ? 'Sending...' : 'Resend link'}
        </button>
        {message && <span className="text-amber-700 dark:text-amber-300">{message}</span>}
      </div>
    </div>
  );
}

export default VerifyEmailBanner;
