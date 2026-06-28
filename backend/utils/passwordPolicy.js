'use strict';

// Minimum password length, enforced at set-time only (register 7.7, change 7.8,
// reset 7.10). Login is never length-gated — it would lock out beta accounts
// created before the rule (decision 2026-06-25).
const MIN_PASSWORD_LENGTH = 10;

// Shared validation for a "new password + confirmation" pair (change-password and
// reset-password). Returns an error message string, or null if valid. Register
// uses only the length rule below (no confirmation, different copy).
function validateNewPassword(newPassword, confirmPassword) {
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    return `New password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (newPassword !== confirmPassword) {
    return 'New password and confirmation do not match';
  }
  return null;
}

module.exports = { MIN_PASSWORD_LENGTH, validateNewPassword };
