const createError = require('http-errors');
const { User } = require('../models');

// Soft-gate guard (story 7.9): blocks sensitive actions (change-email 7.11,
// future songlist sharing) for users whose email isn't verified yet. The rest
// of the app stays usable while unverified. Mount AFTER authsess (req.session.user
// is set). Created here but NOT mounted on any route until 7.11 consumes it.
//
// The 403 is a legitimate, non-ownership rejection (like the "system topic" 403)
// — do NOT collapse it to 404.
const requireVerified = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.session.user);
    if (!user) {
      return next(createError(401, 'Unauthorized'));
    }
    if (!user.emailVerified) {
      return next(createError(403, 'Email verification required'));
    }
    return next();
  } catch (error) {
    return next(createError(500, 'Verification check failed'));
  }
};

module.exports = requireVerified;
