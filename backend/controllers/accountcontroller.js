const { User } = require('../models');
const createError = require('http-errors');
const logger = require('../logger');
const sessionService = require('../services/sessionService');

// All account routes act on req.session.user — the caller's OWN record. Loading
// by findByPk(req.session.user) is the sanctioned self-only case: the uid IS the
// session owner, so there is no IDOR surface (do NOT copy this bare findByPk onto
// routes that touch another user's records — those must scope by {uid, userUid}).

// GET /api/account — the current user's profile (defaultScope excludes password).
const getProfile = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }
    const user = await User.findByPk(userId);
    if (!user) {
      return next(createError(404, 'User not found'));
    }
    res.json({
      uid: user.uid,
      name: user.name,
      discriminator: user.discriminator,
      handle: user.getHandle(),
      email: user.email,
      emailVerified: user.emailVerified,
      isAdmin: user.isAdmin,
    });
  } catch (error) {
    logger.error('Error fetching profile:', error.message);
    next(createError(500, 'Error fetching profile'));
  }
};

// PUT /api/account/name — change the display name. Keep the current discriminator
// if (name, discriminator) is free, otherwise reassign a free random one (story
// 7.8, same Discord-style mechanic as register 7.7). A duplicate name is never
// refused — only an exhausted name space (out of reach at beta scale) → 409.
const updateName = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }
    const { name } = req.body || {};
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) {
      return next(createError(400, 'Name is required'));
    }
    if (trimmed.length > 255) {
      return next(createError(400, 'Name must be at most 255 characters'));
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return next(createError(404, 'User not found'));
    }

    let saved = false;
    for (let attempt = 0; attempt < 50 && !saved; attempt += 1) {
      // First try keeps the current discriminator; the only unique constraint on
      // this update is (name, discriminator), so a collision means another user
      // already holds that pair — retry with a fresh random discriminator.
      const discriminator = attempt === 0
        ? user.discriminator
        : String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
      try {
        await user.update({ name: trimmed, discriminator });
        saved = true;
      } catch (err) {
        // Retry ONLY on a positively-identified (name, discriminator) collision;
        // any other unique violation is rethrown (don't mask it by spinning the
        // loop into a misleading 409). Consistent with createUser (7.7).
        const fields = err.fields || {};
        const isNameDiscCollision = err.name === 'SequelizeUniqueConstraintError' &&
          ('discriminator' in fields || 'name' in fields ||
            (err.errors || []).some((e) => e.path === 'discriminator' || e.path === 'name'));
        if (isNameDiscCollision) {
          continue;
        }
        throw err;
      }
    }
    if (!saved) {
      return next(createError(409, 'This display name is full, please choose another.'));
    }

    res.json({ name: user.name, discriminator: user.discriminator, handle: user.getHandle() });
  } catch (error) {
    logger.error('Error updating name:', error.message);
    next(createError(500, 'Error updating name'));
  }
};

// PUT /api/account/password — change the password. Requires the current password
// (validPassword), a new one >= 10 chars and confirmed; the bcryptjs setter hashes
// it; the hash is never returned. On success, every OTHER session of the user is
// invalidated (the current one survives). (story 7.8)
const changePassword = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return next(createError(400, 'Current and new password are required'));
    }
    if (typeof newPassword !== 'string' || newPassword.length < 10) {
      return next(createError(400, 'New password must be at least 10 characters'));
    }
    if (newPassword !== confirmPassword) {
      return next(createError(400, 'New password and confirmation do not match'));
    }

    // scope(null) so the hash is loaded for validPassword.
    const user = await User.scope(null).findByPk(userId);
    if (!user) {
      return next(createError(404, 'User not found'));
    }

    const valid = await user.validPassword(currentPassword);
    if (!valid) {
      return next(createError(400, 'Current password is incorrect'));
    }

    await user.update({ password: newPassword }); // setter hashes; never store/return the hash

    // Best-effort: the password is already changed; an invalidation failure must
    // not turn this into a 500 (the user would retry with a now-wrong current
    // password). Log loudly so a failed sign-out-others is visible to ops.
    try {
      await sessionService.invalidateOtherSessions(userId, req.sessionID);
    } catch (invErr) {
      logger.error('Failed to invalidate other sessions after password change', { uid: userId, error: invErr.message });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error changing password:', error.message);
    next(createError(500, 'Error changing password'));
  }
};

module.exports = { getProfile, updateName, changePassword };
