'use strict';

// Single source of generic, anti-enumeration responses (story 7.6). Reused by
// every email flow (forgot-password, resend-verification, change-email) so the
// reply is identical whether or not an account exists — never leak existence.
const CHECK_YOUR_INBOX = 'If an account matches, we sent an email with the next steps.';

module.exports = { CHECK_YOUR_INBOX };
