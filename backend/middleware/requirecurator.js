const createError = require('http-errors');
const { User } = require('../models');
const logger = require('../logger');

// Story 19.1 (Epic 19 — Catalog): gate WRITE access to the shared Catalog to the
// Curator role (User.isCurator). Runs AFTER authsess on catalog write routes.
//
// Refusal = a FRANK 403, NOT the 404 anti-oracle of story 7.5. That pattern hides
// the EXISTENCE of another user's resource; here a Catalog entry is readable by
// EVERY logged-in user (architecture §3), so there is no existence secret to
// protect on the write path — the only secret is the missing privilege, which is
// not a resource. Documented as a named exception in project-context.md; do NOT
// "fix" this to a 404 in review.
const requireCurator = async (req, res, next) => {
  try {
    const userId = req.session && req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }
    // defaultScope excludes only `password`; isCurator is present.
    const user = await User.findByPk(userId);
    if (!user || user.isCurator !== true) {
      logger.warn('Non-curator attempted a Catalog write', { userId });
      return next(createError(403, "You don't have curator access."));
    }
    next();
  } catch (error) {
    logger.error('requireCurator error:', error);
    next(createError(500, 'Error checking curator access'));
  }
};

module.exports = requireCurator;
