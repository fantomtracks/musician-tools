const { User, Topic } = require('../models');
const createError = require('http-errors');
const logger = require('../logger');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { FREE_PRACTICE_NAME } = require('../constants/topics');

const createUser = async (req, res, next) => {
  const usermail = req.body.email || 'unknown';
  logger.info('Registering new user', { usermail });

  try {
    const newUser = await User.create({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      isAdmin: false
    });

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

    // Create session and JWT token after registration
    const token = jwt.sign(
      { userId: newUser.uid },
      process.env.JWT_SECRET || 'MUSICIAN_SECRET',
      { expiresIn: '24h' }
    );

    let newSession = req.session;
    newSession.loggedIn = true;
    newSession.user = newUser.uid;
    newSession.token = token;

    const { password, ...userWithoutPassword } = newUser.dataValues;
    
    res.status(201).json({
      ...userWithoutPassword,
      auth: true,
      token
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
    const user = await User.scope(null).findOne({
      where: {
        [Op.or]: [
          { email: { [Op.iLike]: req.body.login } },
          { name: { [Op.iLike]: req.body.login } }
        ]
      }
    });

    if (!user) {
      return next(createError(400, 'Invalid username/email or password'));
    }

    const isValidPassword = await user.validPassword(req.body.password);
    if (!isValidPassword) {
      return next(createError(400, 'Invalid username/email or password'));
    }

    logger.info('User login successful', { uid: user.uid });

    const token = jwt.sign(
      { userId: user.uid },
      process.env.JWT_SECRET || 'MUSICIAN_SECRET',
      { expiresIn: '24h' }
    );

    let newSession = req.session;
    newSession.loggedIn = true;
    newSession.user = user.uid;
    newSession.token = token;

    res.status(200).json({
      auth: true,
      userId: user.uid,
      sessionId: newSession.id,
      token,
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
