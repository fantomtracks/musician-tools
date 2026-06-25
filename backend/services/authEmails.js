const emailService = require('./emailService');

// Composition of the account/email-flow messages (story 7.7+). emailService is
// the transport (sole send point); this module owns the subjects/bodies so the
// verify-signup / password-reset / change-email flows (7.9–7.11) share one home
// instead of inlining HTML in each controller. Links use APP_BASE_URL.

// Build an absolute app link, tolerating a trailing slash on APP_BASE_URL
// (e.g. 'https://app/' → 'https://app/verify-email…'), so a misconfigured env
// never produces 'app//verify-email'.
function appLink(path) {
  const base = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
  return `${base}${path}`;
}

// FR-A8: tell the real owner that someone tried to sign up with their email.
async function sendSignupAttemptNotice(email) {
  return emailService.sendEmail({
    to: email,
    subject: 'Sign-up attempt with your email',
    html: `<p>Someone just tried to create a Musician Tools account with this email address.</p>
<p>If this was you, you already have an account — just <a href="${appLink('/login')}">sign in</a> (you can reset your password from there if needed).</p>
<p>If this wasn't you, you can safely ignore this email: no account was created or changed.</p>`,
  });
}

// Story 7.9: confirm-your-email link sent after signup (and on resend). The
// VerifyEmailPage reads ?token=… and posts it back to /api/auth/verify-email.
async function sendVerifyEmail(email, token) {
  const link = appLink(`/verify-email?token=${token}`);
  return emailService.sendEmail({
    to: email,
    subject: 'Confirm your email',
    html: `<p>Welcome to Musician Tools! Please confirm your email address to finish setting up your account.</p>
<p><a href="${link}">Confirm my email</a></p>
<p>This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>`,
  });
}

// Story 7.10: password-reset link. The ResetPasswordPage reads ?token=… and
// posts it back with the new password to /api/auth/reset-password.
async function sendPasswordResetEmail(email, token) {
  const link = appLink(`/reset-password?token=${token}`);
  return emailService.sendEmail({
    to: email,
    subject: 'Reset your password',
    html: `<p>We received a request to reset your Musician Tools password.</p>
<p><a href="${link}">Choose a new password</a></p>
<p>This link expires in 1 hour and can be used once. If you didn't request this, you can ignore this email — your password stays unchanged.</p>`,
  });
}

// Story 7.11: confirm a NEW email (verify-before-switch). Sent to the new address;
// the shared VerifyEmailPage reads ?token=…&flow=change-email and confirms it.
async function sendChangeEmail(newEmail, token) {
  const link = appLink(`/verify-email?token=${token}&flow=change-email`);
  return emailService.sendEmail({
    to: newEmail,
    subject: 'Confirm your new email',
    html: `<p>You asked to change your Musician Tools email to this address.</p>
<p><a href="${link}">Confirm this email</a></p>
<p>This link expires in 1 hour and can be used once. Until you confirm, your account keeps its current email. If you didn't request this, you can ignore this email.</p>`,
  });
}

module.exports = { sendSignupAttemptNotice, sendVerifyEmail, sendPasswordResetEmail, sendChangeEmail };
