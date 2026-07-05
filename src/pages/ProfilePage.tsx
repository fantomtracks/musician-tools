import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { profileService, type Profile } from '../services/profileService';
import { RateLimitError } from '../services/rateLimit';

function ProfilePage() {
  const { patchUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Display name
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  // Email (verify-before-switch, story 7.11)
  const [newEmail, setNewEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  // A rate-limit 429 (story 15.1) renders amber (info), distinct from a red error.
  const [emailRateLimited, setEmailRateLimited] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwRateLimited, setPwRateLimited] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    profileService.getProfile()
      .then((p) => { setProfile(p); setName(p.name); })
      .catch(() => setLoadError('Could not load your profile.'));
  }, []);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError(null);
    if (!name.trim()) {
      setNameError('Name is required');
      return;
    }
    try {
      setSavingName(true);
      const updated = await profileService.updateName(name.trim());
      setProfile((prev) => (prev ? { ...prev, name: updated.name, discriminator: updated.discriminator, handle: updated.handle } : prev));
      patchUser({ name: updated.name, discriminator: updated.discriminator, handle: updated.handle });
      showToast('Display name updated');
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Failed to update name');
    } finally {
      setSavingName(false);
    }
  };

  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailRateLimited(false);
    setEmailMsg(null);
    try {
      setSavingEmail(true);
      await profileService.requestEmailChange(newEmail.trim());
      // Generic, anti-enumeration message — never reveals if the address is taken.
      setEmailMsg('If that address is available, we sent a confirmation link to it. Your current email stays until you confirm.');
      setNewEmail('');
    } catch (err) {
      if (err instanceof RateLimitError) {
        setEmailRateLimited(true);
        setEmailError(err.message);
      } else {
        setEmailError(err instanceof Error ? err.message : 'Failed to request the change');
      }
    } finally {
      setSavingEmail(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwRateLimited(false);
    if (newPassword.length < 10) {
      setPwError('New password must be at least 10 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('New password and confirmation do not match');
      return;
    }
    try {
      setSavingPw(true);
      await profileService.changePassword(currentPassword, newPassword, confirmPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password changed — your other sessions were signed out');
    } catch (err) {
      if (err instanceof RateLimitError) {
        setPwRateLimited(true);
        setPwError(err.message);
      } else {
        setPwError(err instanceof Error ? err.message : 'Failed to change password');
      }
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Profile</h1>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-300 px-4 py-3 text-sm">{loadError}</div>
      )}
      {toast && (
        <div className="rounded-lg border border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/40 dark:text-green-300 px-4 py-3 text-sm" role="status">{toast}</div>
      )}

      {/* Display name */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Display name</h2>
        {profile && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Your handle: <span className="font-mono">{profile.handle}</span></p>
        )}
        <form onSubmit={handleSaveName} className="space-y-3">
          {nameError && <p className="text-sm text-red-600 dark:text-red-400">{nameError}</p>}
          <input
            className="input-base"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name"
            disabled={savingName}
          />
          <button type="submit" className="btn-primary" disabled={savingName}>
            {savingName ? 'Saving...' : 'Save name'}
          </button>
        </form>
      </section>

      {/* Email — verify-before-switch (story 7.11) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Email</h2>
        <p className="text-sm text-gray-700 dark:text-gray-300">{profile?.email ?? '—'}</p>
        {profile?.pendingEmail && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Pending change to <span className="font-medium">{profile.pendingEmail}</span> — check that inbox to confirm.
          </p>
        )}
        {profile && !profile.emailVerified ? (
          // Changing email requires a verified current address (server: requireVerified
          // → 403). Surface that instead of letting the form fail opaquely.
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Verify your current email first (use the banner above) to be able to change it.
          </p>
        ) : (
          <form onSubmit={handleRequestEmailChange} className="space-y-3">
            {emailError && <p className={emailRateLimited ? 'text-sm text-amber-700 dark:text-amber-300' : 'text-sm text-red-600 dark:text-red-400'} role={emailRateLimited ? 'status' : undefined}>{emailError}</p>}
            {emailMsg && <p className="text-sm text-green-700 dark:text-green-400">{emailMsg}</p>}
            <input
              className="input-base"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="New email address"
              required
              disabled={savingEmail}
            />
            <button type="submit" className="btn-primary" disabled={savingEmail}>
              {savingEmail ? 'Sending...' : 'Change email'}
            </button>
          </form>
        )}
      </section>

      {/* Password */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-3">
          {pwError && <p className={pwRateLimited ? 'text-sm text-amber-700 dark:text-amber-300' : 'text-sm text-red-600 dark:text-red-400'} role={pwRateLimited ? 'status' : undefined}>{pwError}</p>}
          <input
            className="input-base"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password"
            autoComplete="current-password"
            disabled={savingPw}
          />
          <input
            className="input-base"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (at least 10 characters)"
            autoComplete="new-password"
            disabled={savingPw}
          />
          <input
            className="input-base"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            autoComplete="new-password"
            disabled={savingPw}
          />
          <button type="submit" className="btn-primary" disabled={savingPw}>
            {savingPw ? 'Changing...' : 'Change password'}
          </button>
        </form>
      </section>
    </div>
  );
}

export default ProfilePage;
