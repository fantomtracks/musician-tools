const jwt = require('jsonwebtoken');
const createError = require('http-errors');
const logger = require('../logger');

const authsess = async (req, res, next) => {
  logger.info('Checking authentication for protected route');
  const session = req.session;

  if (session.loggedIn === true) {
    try {
      logger.info('Found existing session ID in cookies: %s', req.sessionID);
      next();
    } catch (error) {
      logger.warn('Unauthorized to access this resource');
      res.status(401).send({ error: 'Unauthorized to access this resource' });
    }
  } else {
    next(createError(401, 'Please login to view this page.'));
  }
};

module.exports = authsess;
