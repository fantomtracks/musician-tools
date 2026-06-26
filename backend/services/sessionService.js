const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

// Single, reusable session-invalidation helper (story 7.8; reused by 7.11 etc.).
// On a change-password (or future credential change), every OTHER session of the
// user is dropped while the current one survives.
//
// The session store is connect-pg-simple (Postgres table `session`) ONLY in
// production; dev/test use express-session's in-memory MemoryStore, which has no
// `session` table — so we no-op outside production rather than crash on a missing
// relation. The `sess` JSON carries our `user` (uid); the current session is kept
// by excluding req.sessionID.
async function invalidateOtherSessions(userUid, currentSid) {
  if (process.env.NODE_ENV !== 'production') {
    return 0;
  }
  await sequelize.query(
    'DELETE FROM "session" WHERE sid <> :sid AND sess ->> \'user\' = :uid',
    { replacements: { sid: currentSid, uid: userUid }, type: QueryTypes.DELETE }
  );
  return undefined;
}

// Rotate the session ID on privilege elevation — login, and the verify-email
// auto-login (story 7.13). Prevents session fixation: the pre-auth session ID
// (and the CSRF token minted on it) must not carry into the authenticated
// session. Promisifies express-session's callback-based regenerate; callers set
// loggedIn/user on the FRESH session it produces.
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

module.exports = { invalidateOtherSessions, regenerateSession };
