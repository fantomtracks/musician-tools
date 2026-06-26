import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';
import { verificationService } from '../services/verificationService';

function LoginPage() {
  const [formData, setFormData] = useState({
    login: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Story 7.13: correct credentials on an unverified account → show a verify
  // prompt with a resend action instead of an error.
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResendMessage(null);

    try {
      setLoading(true);
      const { needsVerification: unverified } = await login(formData.login, formData.password);
      if (unverified) {
        setNeedsVerification(true);
        return;
      }
      navigate('/songs');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendMessage(null);
    try {
      setResending(true);
      await verificationService.resend(formData.login);
      setResendMessage('Verification email sent — check your inbox.');
    } catch {
      setResendMessage('Could not send right now, please try again later.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-950 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* Logo & Header */}
        <div className="text-center space-y-4">
          <Link to="/" className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-2xl">♪</span>
            </div>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Welcome back</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">Sign in to your Musician Tools account</p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Story 7.13: email not verified — prompt to confirm + resend the link. */}
        {needsVerification && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200 px-4 py-3 text-sm space-y-2" role="status">
            <p className="font-medium">Verify your email to sign in</p>
            <p>We sent a confirmation link to your email. Click it to activate your account, then sign in.</p>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="font-medium underline hover:no-underline disabled:opacity-60"
            >
              {resending ? 'Sending...' : 'Resend verification email'}
            </button>
            {resendMessage && <span className="block text-amber-700 dark:text-amber-300">{resendMessage}</span>}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-base">Email</label>
            <input
              className="input-base"
              type="email"
              name="login"
              placeholder="Enter your email"
              value={formData.login}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="label-base">Password</label>
            <div className="relative">
              <input
                className="input-base pr-10"
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={loading}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    <line x1="3" y1="3" x2="21" y2="21" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary w-full justify-center"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          {/* Below Sign in so the tab order is login → password → Sign in
              (typing the password, Tab lands on the submit button, not here). */}
          <div className="text-center text-sm">
            <Link to="/forgot-password" className="text-brand-600 dark:text-brand-400 font-medium hover:text-brand-700 dark:hover:text-brand-300">
              Forgot password?
            </Link>
          </div>
        </form>

        {/* Sign up link */}
        <div className="text-center text-sm text-gray-600 dark:text-gray-400">
          Don't have an account?{' '}
          <Link to="/register" className="text-brand-600 dark:text-brand-400 font-medium hover:text-brand-700 dark:hover:text-brand-300">
            Create one
          </Link>
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-950 text-gray-500 dark:text-gray-400">
              Demo credentials available
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
