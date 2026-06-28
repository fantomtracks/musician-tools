const { User, Topic } = require('../models');
const createError = require('http-errors');
const logger = require('../logger');
const { FREE_PRACTICE_NAME } = require('../constants/topics');
const authEmails = require('../services/authEmails');
const authTokenService = require('../services/authTokenService');
const sessionService = require('../services/sessionService');
const { CHECK_YOUR_INBOX } = require('../constants/messages');

const createUser = async (req, res, next) => {
  // req.body is undefined when the request body is not JSON (story 7.5) — treat
  // as empty so a malformed request yields a clean 400, not a 500.
  const body = req.body || {};
  const usermail = body.email || 'unknown';
  logger.info('Registering new user', { usermail });

  // Story 7.7: minimum password length enforced at registration only (set-time).
  // This validates the password the user just typed — it reveals nothing about
  // whether an email exists. (Login is NOT length-gated: it would lock out beta
  // accounts created before this rule — decision confirmed 2026-06-25.)
  if (typeof body.password !== 'string' || body.password.length < 10) {
    return next(createError(400, 'Password must be at least 10 characters'));
  }

  try {
    // Assign a free 4-digit discriminator for the display name (Discord-style
    // identity, story 7.2). The unique (name, discriminator) index is the source
    // of truth: on a rare race we retry with a new value. Email conflicts bubble
    // to the handler below. (The full register/anti-enumeration flow lands in 7.7.)
    let newUser = null;
    let emailTaken = false;
    for (let attempt = 0; attempt < 50 && !newUser && !emailTaken; attempt += 1) {
      const discriminator = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
      try {
        newUser = await User.create({
          name: body.name,
          email: body.email,
          password: body.password,
          discriminator,
          isAdmin: false
        });
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
          // Retry a new discriminator ONLY for a positively-identified
          // (name, discriminator) collision. Any OTHER unique violation — incl.
          // an email conflict that arrives without parsed error detail (terse
          // Postgres errors / poolers leave err.errors/err.fields empty) — is
          // treated as an existing email: the anti-enumeration safe default,
          // never spinning into a 409 "name is full" oracle. (story 7.7)
          const fields = err.fields || {};
          const isNameDiscCollision =
            'discriminator' in fields || 'name' in fields ||
            (err.errors || []).some((e) => e.path === 'discriminator' || e.path === 'name');
          if (isNameDiscCollision) {
            continue;
          }
          emailTaken = true; // existing email — anti-enumeration flow below, never thrown/revealed
          break;
        }
        throw err;
      }
    }

    // Story 7.7 anti-enumeration: an existing email never reveals itself. Notify
    // the real owner (best-effort) and return the SAME generic response — no
    // "email already taken" oracle, and no account created. (The new-email path
    // auto-logs-in below; the resulting behavioural differential is an accepted
    // beta residual — far weaker than the explicit message it replaces.)
    if (emailTaken) {
      // Best-effort: a delivery failure must NOT change or fail the generic
      // response, otherwise it becomes an enumeration oracle.
      try {
        await authEmails.sendSignupAttemptNotice(body.email);
      } catch (mailErr) {
        logger.error('Failed to send existing-email signup notice', { error: mailErr.message });
      }
      return res.status(200).json({ auth: false, pending: true });
    }

    if (!newUser) {
      // All 9999 discriminators for this name are taken (out of reach at beta scale).
      return next(createError(409, 'This display name is full, please choose another.'));
    }

    logger.info('User registered successfully', { uid: newUser.uid });

    // Story 8.2: seed the per-user system "Free practice" topic so a user can
    // log unstructured time from day one. Best-effort: registration must never
    // fail over this. NB: there is no read-path self-heal yet, so on the rare
    // seed failure the user has no system topic until a future backfill runs —
    // acceptable at beta scale; revisit if it proves flaky.
    try {
      await Topic.findOrCreate({
        where: { userUid: newUser.uid, name: FREE_PRACTICE_NAME },
        defaults: { isSystem: true, category: null },
      });
    } catch (seedErr) {
      logger.error('Failed to seed Free practice topic', { uid: newUser.uid, error: seedErr.message });
    }

    // Story 7.9 soft gate: send a verify-email token (24h). Best-effort — the
    // user is logged in directly with emailVerified=false regardless; a delivery
    // failure must never fail registration (they can resend from the banner).
    try {
      const verifyToken = await authTokenService.issueToken(newUser.uid, 'verify_email');
      await authEmails.sendVerifyEmail(newUser.email, verifyToken);
    } catch (verifyErr) {
      logger.error('Failed to send verification email', { uid: newUser.uid, error: verifyErr.message });
    }

    // Story 7.13 (hard email gate): registration no longer auto-logs-in. The
    // account exists but stays unverified; the user must confirm via the email
    // link before they can sign in. Return the SAME generic response as the
    // existing-email path above → register is uniform and reveals nothing about
    // whether the email already existed (anti-enumeration, supersedes the 7.7
    // auto-login residual).
    return res.status(200).json({ auth: false, pending: true });
  } catch (err) {
    logger.error('Error registering user:', err.message);
    // No email/name existence oracle (story 7.7): unique-email conflicts are
    // handled in the loop above (generic pending response). Anything reaching
    // here is a genuine input validation error (e.g. invalid email, missing
    // field) whose message is about the submitted data, not account existence.
    next(createError(400, err.message));
  }
};

const loginUser = async (req, res, next) => {
  logger.info('Login attempt');

  try {
    // req.body is undefined when the request body is not JSON (story 7.5); a
    // missing login/password yields the same generic 400 (no enumeration oracle).
    const { login, password } = req.body || {};
    // Both must be non-empty strings: a non-string `login` (array/object) would
    // otherwise reach Sequelize as an IN-list / operator value. Same generic 400.
    if (typeof login !== 'string' || typeof password !== 'string' || !login || !password) {
      return next(createError(400, 'Invalid username/email or password'));
    }

    // Email is the only identifier (story 7.7): no more name login. The email
    // column is citext (7.2), so an exact equality is already case-insensitive —
    // no iLike needed.
    const user = await User.scope(null).findOne({
      where: { email: login.trim() }
    });

    if (!user) {
      return next(createError(400, 'Invalid username/email or password'));
    }

    const isValidPassword = await user.validPassword(password);
    if (!isValidPassword) {
      return next(createError(400, 'Invalid username/email or password'));
    }

    // Hard email gate (story 7.13): an unverified account cannot sign in. This is
    // surfaced ONLY after correct credentials (the caller has proven they own the
    // account), so it is not an enumeration oracle — a wrong password still gets
    // the generic 400 above. The client offers a "resend verification" action.
    if (!user.emailVerified) {
      logger.info('Login blocked: email not verified', { uid: user.uid });
      return res.status(403).json({ auth: false, code: 'email_not_verified' });
    }

    logger.info('User login successful', { uid: user.uid });

    // Rotate the session ID on this privilege elevation (session-fixation
    // hardening): the pre-auth session and its CSRF token are discarded. The
    // client clears its cached CSRF token on login so the next mutation mints a
    // fresh one. Authenticate via the session cookie only — no JWT (story 7.1).
    await sessionService.regenerateSession(req);
    req.session.loggedIn = true;
    req.session.user = user.uid;
    // Story 7.13 (hard gate, app-wide): stamp the verified state onto the
    // session so authsess can enforce it on EVERY request, not just at this
    // door. A session is only ever created here and in verifyEmail — both past
    // the verification check — so loggedIn always implies emailVerified.
    req.session.emailVerified = true;

    res.status(200).json({
      auth: true,
      userId: user.uid,
      sessionId: req.session.id,
      user: {
        uid: user.uid,
        name: user.name,
        discriminator: user.discriminator,
        handle: user.getHandle(), // story 7.8: AuthContext holds the handle
        email: user.email,
        emailVerified: user.emailVerified, // story 7.9: drives the verify-email banner
        isAdmin: user.isAdmin
      }
    });
  } catch (err) {
    logger.error('Login error:', err.message);
    next(createError(500, 'Login error'));
  }
};

const logoutUser = async (req, res, next) => {
  logger.info('Logout');

  req.session.destroy(function(err) {
    if (err) {
      logger.error('Session destroy error:', err);
      return res.status(500).json({ auth: true });
    }
  });

  res.status(200).json({ auth: false });
};

// POST /api/auth/verify-email — public, token-based (the token IS the authority).
// Marks the token's user verified. A null result (unknown/used/expired token) is
// a generic 400 (anti-oracle). (story 7.9)
const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return next(createError(400, 'Invalid or expired verification link'));
    }
    const result = await authTokenService.verifyToken(token, 'verify_email');
    if (!result) {
      return next(createError(400, 'Invalid or expired verification link'));
    }
    await User.update({ emailVerified: true }, { where: { uid: result.userUid } });

    // Story 7.13 (hard email gate): clicking the link is reached while logged OUT
    // (registration no longer auto-logs-in), so confirm + sign in in one step.
    // The single-use token (emailed to this address) proves ownership → safe to
    // open a session here. Return the user so the client can hydrate auth state.
    const user = await User.scope(null).findByPk(result.userUid);
    // The account could have been deleted between token issuance and this click;
    // a valid token for a vanished user is treated as an expired link, not a 500.
    if (!user) {
      return next(createError(400, 'Invalid or expired verification link'));
    }
    // Rotate the session ID on this privilege elevation (session-fixation
    // hardening), same as login — discards the pre-auth session + CSRF token.
    await sessionService.regenerateSession(req);
    req.session.loggedIn = true;
    req.session.user = user.uid;
    req.session.emailVerified = true; // app-wide hard gate (see loginUser)
    res.json({
      success: true,
      user: {
        uid: user.uid,
        name: user.name,
        discriminator: user.discriminator,
        handle: user.getHandle(),
        email: user.email,
        emailVerified: true,
        isAdmin: user.isAdmin
      }
    });
  } catch (err) {
    logger.error('Email verification error:', err.message);
    next(createError(500, 'Email verification error'));
  }
};

// POST /api/auth/verify-email/resend — authsess + emailSendLimiter. Re-sends a
// fresh verify-email token for the logged-in user. Generic 200 even if already
// verified; best-effort send. (story 7.9)
// Story 7.13: public resend, keyed by email (the user isn't logged in under the
// hard gate). Always returns the SAME generic success — it must never reveal
// whether the email exists or is already verified (anti-enumeration). Rate-limited
// per IP at the route. Reached from the post-register screen and the login
// "verify your email" prompt.
const resendVerificationPublic = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (typeof email === 'string' && email.trim()) {
      const user = await User.scope(null).findOne({ where: { email: email.trim() } });
      if (user && !user.emailVerified) {
        try {
          const token = await authTokenService.issueToken(user.uid, 'verify_email');
          await authEmails.sendVerifyEmail(user.email, token);
        } catch (mailErr) {
          logger.error('Failed to resend verification email', { error: mailErr.message });
        }
      }
    }
  } catch (err) {
    // Never surface an error: a thrown 500 vs a 200 would itself be an oracle.
    logger.error('Resend verification error:', err.message);
  }
  res.json({ success: true });
};

// POST /api/auth/forgot-password — public, rate-limited per IP. ALWAYS returns the
// same generic response (anti-enumeration): no signal about whether the email
// exists. If it does, a password_reset token (1h) is issued + emailed (best-effort).
// (story 7.10)
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body || {};
    const trimmed = typeof email === 'string' ? email.trim() : '';
    if (trimmed) {
      const user = await User.findOne({ where: { email: trimmed } }); // citext, case-insensitive
      if (user) {
        try {
          const token = await authTokenService.issueToken(user.uid, 'password_reset');
          await authEmails.sendPasswordResetEmail(user.email, token);
        } catch (mailErr) {
          logger.error('Failed to send password reset email', { uid: user.uid, error: mailErr.message });
        }
      }
    }
    // Identical reply whether or not the account exists.
    res.json({ message: CHECK_YOUR_INBOX });
  } catch (err) {
    logger.error('Forgot-password error:', err.message);
    next(createError(500, 'Forgot-password error'));
  }
};

// POST /api/auth/reset-password — public, token-based. Sets a new password and
// invalidates ALL of the user's sessions (the request itself is unauthenticated,
// so req.sessionID is anonymous → every real user session is dropped). (story 7.10)
const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword, confirmPassword } = req.body || {};
    if (!token) {
      return next(createError(400, 'Invalid or expired reset link'));
    }
    if (typeof newPassword !== 'string' || newPassword.length < 10) {
      return next(createError(400, 'New password must be at least 10 characters'));
    }
    if (newPassword !== confirmPassword) {
      return next(createError(400, 'New password and confirmation do not match'));
    }

    const result = await authTokenService.verifyToken(token, 'password_reset');
    if (!result) {
      return next(createError(400, 'Invalid or expired reset link'));
    }

    // defaultScope (password excluded) is fine: we only WRITE the password (the
    // setter hashes on update) — no need to load the hash, so don't reach for the
    // login-only scope(null) exception.
    const user = await User.findByPk(result.userUid);
    if (!user) {
      return next(createError(400, 'Invalid or expired reset link'));
    }
    await user.update({ password: newPassword }); // setter hashes; never store/return the hash

    // Best-effort: a failed invalidation must not undo a successful reset.
    try {
      await sessionService.invalidateOtherSessions(result.userUid, req.sessionID);
    } catch (invErr) {
      logger.error('Failed to invalidate sessions after password reset', { uid: result.userUid, error: invErr.message });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Reset-password error:', err.message);
    next(createError(500, 'Reset-password error'));
  }
};

// POST /api/auth/change-email/confirm — public, token-based (story 7.11). Switches
// pendingEmail (carried in the token payload, authoritative) into email. A null
// result / missing payload / unique collision (the address was taken meanwhile)
// all yield the same generic 400.
const confirmEmailChange = async (req, res, next) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return next(createError(400, 'Invalid or expired link'));
    }
    const result = await authTokenService.verifyToken(token, 'change_email');
    const pendingEmail = result && result.payload && result.payload.pendingEmail;
    if (!result || !pendingEmail) {
      return next(createError(400, 'Invalid or expired link'));
    }
    try {
      await User.update({ email: pendingEmail, pendingEmail: null }, { where: { uid: result.userUid } });
    } catch (uniqueErr) {
      // The address was taken between the request and the click — generic reject.
      logger.error('Email change collision on confirm:', uniqueErr.message);
      return next(createError(400, 'Invalid or expired link'));
    }
    // Return the new email so the (possibly logged-in) client can refresh it.
    res.json({ success: true, email: pendingEmail });
  } catch (err) {
    logger.error('Confirm email change error:', err.message);
    next(createError(500, 'Confirm email change error'));
  }
};

module.exports = {
  createUser,
  loginUser,
  logoutUser,
  verifyEmail,
  resendVerificationPublic,
  forgotPassword,
  resetPassword,
  confirmEmailChange
};
