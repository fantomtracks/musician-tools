import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { passwordResetService } from '../services/passwordResetService';

// Public, pre-auth (story 7.10). The response is intentionally generic — we never
// reveal whether the email exists.
function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setLoading(true);
      await passwordResetService.requestReset(email);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Reset your password</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">We&apos;ll email you a link to choose a new one.</p>
        </div>

        {submitted ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 px-4 py-4 text-sm" role="status">
            If an account matches that email, we just sent a reset link. Check your inbox (and spam).
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <input
              className="input-base"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              disabled={loading}
            />
            <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}

        <div className="text-center text-sm text-gray-600 dark:text-gray-400">
          <Link to="/login" className="text-brand-600 dark:text-brand-400 font-medium hover:text-brand-700 dark:hover:text-brand-300">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
