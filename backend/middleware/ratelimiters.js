const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const createError = require('http-errors');

// Named, reusable rate limiters (story 7.4). A shared transverse brick: future
// stories require these limiters instead of re-rolling their own. Relies on
// `app.set('trust proxy', 1)` (set in server.js, story 7.1) so IP-keyed limiters
// see the real client IP behind Fly.io.
//
// In-memory MemoryStore (express-rate-limit default): per-instance, reset on
// deploy — accepted for beta; a persistent store (Redis/PG) is a future upgrade.

// Generic 429 routed through the global error handler ({ status, message }).
function tooMany(req, res, next) {
  next(createError(429));
}

// No RateLimit-* / Retry-After headers: these are anti-abuse security limiters,
// not API quotas — advertising the threshold/window/reset just helps an attacker
// pace requests, and nothing on the front reads them. Keeps the 429 detail-free
// (anti-oracle, like the CSRF/404 normalization elsewhere in Epic 7).
const base = {
  standardHeaders: false,
  legacyHeaders: false,
  handler: tooMany,
};

const loginLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 10 });

const forgotPasswordLimiter = rateLimit({ ...base, windowMs: 60 * 60 * 1000, limit: 5 });

// Keyed by the authenticated user, not IP. The req.ip fallback also satisfies the
// v8.2+ validator (a keyGenerator naming req.ip must reference ipKeyGenerator).
const emailSendLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => (req.session && req.session.user) || ipKeyGenerator(req.ip),
});

// Change-password — 5 / 15 min / account (story 7.8). Keyed by the authenticated
// user (req.ip fallback for the v8.2+ validator). Mounted on PUT /api/account/password.
const changePasswordLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => (req.session && req.session.user) || ipKeyGenerator(req.ip),
});

module.exports = { loginLimiter, forgotPasswordLimiter, emailSendLimiter, changePasswordLimiter };
