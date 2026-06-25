const emailService = require('./emailService');

// Composition of the account/email-flow messages (story 7.7+). emailService is
// the transport (sole send point); this module owns the subjects/bodies so the
// verify-signup / password-reset / change-email flows (7.9–7.11) share one home
// instead of inlining HTML in each controller. Links use APP_BASE_URL.

// FR-A8: tell the real owner that someone tried to sign up with their email.
async function sendSignupAttemptNotice(email) {
  const appUrl = process.env.APP_BASE_URL;
  return emailService.sendEmail({
    to: email,
    subject: 'Sign-up attempt with your email',
    html: `<p>Someone just tried to create a Musician Tools account with this email address.</p>
<p>If this was you, you already have an account — just <a href="${appUrl}/login">sign in</a> (you can reset your password from there if needed).</p>
<p>If this wasn't you, you can safely ignore this email: no account was created or changed.</p>`,
  });
}

module.exports = { sendSignupAttemptNotice };
