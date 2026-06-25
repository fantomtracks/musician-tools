const { User, Topic } = require('../models');
const createError = require('http-errors');
const logger = require('../logger');
const { FREE_PRACTICE_NAME } = require('../constants/topics');
const authEmails = require('../services/authEmails');

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

    // Authenticate via the session cookie only — no JWT (story 7.1).
    let newSession = req.session;
    newSession.loggedIn = true;
    newSession.user = newUser.uid;

    const { password, ...userWithoutPassword } = newUser.dataValues;

    res.status(201).json({
      ...userWithoutPassword,
      handle: newUser.getHandle(), // story 7.8: AuthContext holds the handle
      auth: true
    });
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

    logger.info('User login successful', { uid: user.uid });

    // Authenticate via the session cookie only — no JWT (story 7.1).
    let newSession = req.session;
    newSession.loggedIn = true;
    newSession.user = user.uid;

    res.status(200).json({
      auth: true,
      userId: user.uid,
      sessionId: newSession.id,
      user: {
        uid: user.uid,
        name: user.name,
        discriminator: user.discriminator,
        handle: user.getHandle(), // story 7.8: AuthContext holds the handle
        email: user.email,
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

module.exports = {
  createUser,
  loginUser,
  logoutUser
};
