import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { verificationService } from '../services/verificationService';

function RegisterPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleResend = async () => {
    setResendMessage(null);
    try {
      setResending(true);
      await verificationService.resend(formData.email);
      setResendMessage('Verification email sent — check your inbox.');
    } catch {
      setResendMessage('Could not send right now, please try again later.');
    } finally {
      setResending(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Mirror the server rule (story 7.7): password must be at least 10 characters.
    if (formData.password.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }

    try {
      setLoading(true);
      const result = await register(formData.name, formData.email, formData.password);
      // New email → logged in, go to the app. Existing email → generic 'pending'
      // result (the real owner was emailed); show a neutral screen that never
      // reveals whether the email already exists (anti-enumeration).
      if (result.status === 'created') {
        navigate('/songs');
      } else {
        setSubmitted(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
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
            <h1 className="text-3xl font-bold text-gray-900">Get started</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">Create your Musician Tools account</p>
          </div>
        </div>

        {submitted ? (
          /* Neutral, ambiguous confirmation — never reveals whether the email
             already exists (story 7.7 + hard gate 7.13: register no longer
             auto-logs-in, so a new and an existing email show the SAME screen).
             You must click the link to activate the account before signing in. */
          <div className="rounded-lg border border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 px-4 py-4 text-sm space-y-2" role="status">
            <p className="font-medium">Check your email</p>
            <p>
              We&apos;ve sent a confirmation link. Click it to activate your account, then sign in. If you already have
              an account, we&apos;ve emailed you about it instead.
            </p>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="font-medium underline hover:no-underline disabled:opacity-60"
            >
              {resending ? 'Sending...' : 'Resend the link'}
            </button>
            {resendMessage && <span className="block text-gray-600 dark:text-gray-300">{resendMessage}</span>}
            <Link to="/login" className="block text-brand-600 dark:text-brand-400 font-medium hover:text-brand-700 dark:hover:text-brand-300">
              Go to sign in
            </Link>
          </div>
        ) : (
        <>
        {/* Error Message */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-base">Username</label>
            <input
              className="input-base"
              type="text"
              name="name"
              placeholder="Choose a username"
              value={formData.name}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="label-base">Email</label>
            <input
              className="input-base"
              type="email"
              name="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="label-base">Password</label>
            <input
              className="input-base"
              type="password"
              name="password"
              placeholder="Create a password"
              value={formData.password}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="label-base">Confirm Password</label>
            <input
              className="input-base"
              type="password"
              name="confirmPassword"
              placeholder="Confirm your password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="btn-primary w-full justify-center"
            disabled={loading}
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        </>
        )}

        {/* Sign in link */}
        <div className="text-center text-sm text-gray-600 dark:text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-600 dark:text-brand-400 font-medium hover:text-brand-700 dark:hover:text-brand-300">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
