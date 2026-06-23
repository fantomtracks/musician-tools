const crypto = require('crypto');
const createError = require('http-errors');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Synchronizer-token CSRF guard (story 7.3). A per-session token (stored in the
// session, i.e. the Postgres session store in prod) must be echoed in the
// X-CSRF-Token header on every mutation. Safe methods are exempt. The token is
// minted lazily on first request so GET /api/csrf-token can hand it to the front.
// Rejections are generic (no detail) to avoid being an oracle.
//
// A CSRF rejection carries the X-CSRF-Token-Invalid marker so the client can
// tell it apart from a legitimate authorization 403 (e.g. non-owner PUT/DELETE,
// "Cannot edit the system topic"): only the former warrants a token refresh +
// replay. Without the marker the client would double-submit every authz 403.
function reject(res, next) {
  res.set('X-CSRF-Token-Invalid', '1');
  return next(createError(403, 'Forbidden'));
}

function csrf(req, res, next) {
  if (!req.session) {
    return reject(res, next);
  }

  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const provided = Buffer.from(req.get('X-CSRF-Token') || '');
  const expected = Buffer.from(req.session.csrfToken);

  // timingSafeEqual requires equal-length buffers; check length first.
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return reject(res, next);
  }

  return next();
}

module.exports = csrf;
