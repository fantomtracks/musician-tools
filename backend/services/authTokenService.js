const crypto = require('crypto');
const { Op } = require('sequelize');
const { AuthToken } = require('../models');

// Token lifetimes per type (story 7.6, architecture Format Patterns).
const EXPIRY_MS = {
  verify_email: 24 * 60 * 60 * 1000, // 24 h
  password_reset: 60 * 60 * 1000,    // 1 h
  change_email: 60 * 60 * 1000,      // 1 h
};

// Only the hash is ever stored/compared — the clear token lives only in the email.
function hashToken(clear) {
  return crypto.createHash('sha256').update(clear).digest('hex');
}

// Mint an opaque single-use token, store its hash, return the CLEAR token (for
// the email link). payload carries flow data (e.g. { pendingEmail } for change_email).
async function issueToken(userUid, type, payload = null) {
  const ttl = EXPIRY_MS[type];
  if (!ttl) {
    throw new Error(`Unknown auth token type: ${type}`);
  }
  const clear = crypto.randomBytes(32).toString('base64url');
  await AuthToken.create({
    userUid,
    type,
    tokenHash: hashToken(clear),
    payload,
    expiresAt: new Date(Date.now() + ttl),
  });
  return clear;
}

// Validate and consume a clear token in ONE atomic UPDATE guarded on unused +
// unexpired (matched by hash + type). Doing the check-and-mark in a single
// statement makes single-use race-free: two concurrent verifies can't both win
// (no TOCTOU). Returns { userUid, payload } on success, null on any failure
// (unknown/used/expired) — callers surface a generic response.
async function verifyToken(clearToken, type) {
  const now = new Date();
  const [count, rows] = await AuthToken.update(
    { usedAt: now },
    {
      where: {
        tokenHash: hashToken(clearToken),
        type,
        usedAt: null,
        expiresAt: { [Op.gt]: now },
      },
      returning: true,
    }
  );
  if (count === 0) return null;
  const token = rows[0];
  return { userUid: token.userUid, payload: token.payload };
}

// Story 12.1: a single-use token whose atomic consume (verifyToken) failed may
// simply have been ALREADY consumed — a redundant click on a 2nd device — rather
// than invalid. This read-only lookup finds a token by hash+type that was already
// used, so the caller can show a friendly "already verified" message. It NEVER
// consumes or grants anything (no session is ever opened from a spent token).
async function findConsumedToken(clearToken, type) {
  const token = await AuthToken.findOne({
    where: { tokenHash: hashToken(clearToken), type, usedAt: { [Op.ne]: null } },
  });
  return token ? { userUid: token.userUid } : null;
}

module.exports = { issueToken, verifyToken, findConsumedToken };
