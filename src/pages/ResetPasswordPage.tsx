import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { passwordResetService } from '../services/passwordResetService';

// Public page reached from the email link (?token=…) — story 7.10.
function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      setLoading(true);
      await passwordResetService.reset(token, newPassword, confirmPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Choose a new password</h1>
        </div>

        {done ? (
          <div className="space-y-4 text-center">
            <div className="rounded-lg border border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/40 dark:text-green-300 px-4 py-4 text-sm" role="status">
              Your password has been changed. For your security, your other sessions were signed out.
            </div>
            <Link to="/login" className="btn-primary inline-flex">Sign in</Link>
          </div>
        ) : !token ? (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-300 px-4 py-4 text-sm">
            This reset link is invalid. Request a new one from{' '}
            <Link to="/forgot-password" className="font-medium underline">the reset page</Link>.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <input
              className="input-base"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (at least 10 characters)"
              autoComplete="new-password"
              disabled={loading}
            />
            <input
              className="input-base"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              disabled={loading}
            />
            <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
              {loading ? 'Saving...' : 'Change password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default ResetPasswordPage;
