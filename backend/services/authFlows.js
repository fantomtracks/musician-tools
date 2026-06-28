'use strict';

const authTokenService = require('./authTokenService');
const authEmails = require('./authEmails');
const logger = require('../logger');

// Each auth flow that mails the user (register-verify, resend, forgot-password,
// change-email) issued a one-time token then sent the matching email. Map the
// token type to its sender so the issue+send+best-effort-catch lives in one place.
const SENDERS = {
  verify_email: (email, token) => authEmails.sendVerifyEmail(email, token),
  password_reset: (email, token) => authEmails.sendPasswordResetEmail(email, token),
  change_email: (email, token) => authEmails.sendChangeEmail(email, token),
};

// Issue a token and email it. Best-effort: a token-store or delivery failure is
// logged and swallowed — the caller's flow must never fail (nor reveal an oracle)
// on email. Returns true on success, false on failure. `payload` is only passed to
// issueToken when provided, so call signatures match the per-type token contract.
async function issueAndSend(type, { uid, email, payload } = {}) {
  try {
    const token = payload === undefined
      ? await authTokenService.issueToken(uid, type)
      : await authTokenService.issueToken(uid, type, payload);
    await SENDERS[type](email, token);
    return true;
  } catch (err) {
    logger.error('Failed to issue/send auth email', { type, uid, error: err.message });
    return false;
  }
}

module.exports = { issueAndSend };
