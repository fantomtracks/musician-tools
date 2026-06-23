const { User, Topic } = require('../models');
const createError = require('http-errors');
const logger = require('../logger');
const { Op } = require('sequelize');
const { FREE_PRACTICE_NAME } = require('../constants/topics');

const createUser = async (req, res, next) => {
  // req.body is undefined when the request body is not JSON (story 7.5) — treat
  // as empty so a malformed request yields a clean 400, not a 500.
  const body = req.body || {};
  const usermail = body.email || 'unknown';
  logger.info('Registering new user', { usermail });

  try {
    // Assign a free 4-digit discriminator for the display name (Discord-style
    // identity, story 7.2). The unique (name, discriminator) index is the source
    // of truth: on a rare race we retry with a new value. Email conflicts bubble
    // to the handler below. (The full register/anti-enumeration flow lands in 7.7.)
    let newUser = null;
    for (let attempt = 0; attempt < 50 && !newUser; attempt += 1) {
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
        const onEmail = (err.errors || []).some((e) => e.path === 'email');
        if (err.name === 'SequelizeUniqueConstraintError' && !onEmail) {
          continue; // (name, discriminator) collision — try another discriminator
        }
        throw err;
      }
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
      auth: true
    });
  } catch (err) {
    logger.error('Error registering user:', err.message);
    if (err.name === 'SequelizeUniqueConstraintError') {
      return next(createError(400, 'Username or email already taken'));
    }
    next(createError(400, err.message));
  }
};

const loginUser = async (req, res, next) => {
  logger.info('Login attempt');

  try {
    // req.body is undefined when the request body is not JSON (story 7.5); a
    // missing login/password yields the same generic 400 (no enumeration oracle).
    const { login, password } = req.body || {};
    if (!login || !password) {
      return next(createError(400, 'Invalid username/email or password'));
    }

    const user = await User.scope(null).findOne({
      where: {
        [Op.or]: [
          { email: { [Op.iLike]: login } },
          { name: { [Op.iLike]: login } }
        ]
      }
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
