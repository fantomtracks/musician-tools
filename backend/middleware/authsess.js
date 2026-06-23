const createError = require('http-errors');
const logger = require('../logger');

const authsess = async (req, res, next) => {
  logger.info('Checking authentication for protected route', {
    sessionID: req.sessionID,
    loggedIn: req.session?.loggedIn,
    hasUser: !!req.session?.user,
    path: req.path
  });
  
  const session = req.session;

  if (session.loggedIn === true) {
    try {
      logger.info('User authenticated', { userId: session.user });
      next();
    } catch (error) {
      logger.warn('Unauthorized to access this resource', { error: error.message });
      res.status(401).send({ error: 'Unauthorized to access this resource' });
    }
  } else {
    logger.warn('No valid session found', { 
      sessionID: req.sessionID,
      loggedIn: session.loggedIn 
    });
    next(createError(401, 'Please login to view this page.'));
  }
};

module.exports = authsess;
