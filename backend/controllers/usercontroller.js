const { User } = require('../models');
const createError = require('http-errors');
const logger = require('../logger');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

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
