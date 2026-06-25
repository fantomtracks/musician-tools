const { Resend } = require('resend');
const createError = require('http-errors');
const logger = require('../logger');

// Transactional email — the SINGLE send point for the whole app (story 7.6).
// Wraps Resend; the verify-signup / password-reset / change-email flows
// (stories 7.9–7.11) call sendEmail and never touch Resend directly.
// RESEND_API_KEY / EMAIL_FROM are required at boot (server.js fail-fast), and
// APP_BASE_URL (read by the callers to build links) is required there too.
//
// The Resend client is built lazily (and memoized): its constructor THROWS on a
// missing key, so building it at module load would crash any require() path that
// runs before/without the boot env (a route test that forgets to mock 'resend',
// a CLI/migration context). Lazy init keeps merely importing this module safe.
let resend = null;
function getClient() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

// Send one email. Resend resolves to { data, error } rather than throwing on an
// API error, so we inspect error explicitly and surface it (never swallow a
// delivery failure).
async function sendEmail({ to, subject, html }) {
  const { data, error } = await getClient().emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
  });

  if (error) {
    logger.error('Email delivery failed', { error: error.message || String(error) });
    throw createError(502, 'Email delivery failed');
  }

  return data;
}

module.exports = { sendEmail };
