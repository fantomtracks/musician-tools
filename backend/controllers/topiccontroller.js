const { Topic } = require('../models');
const { Op, fn, col, where: whereFn } = require('sequelize');
const createError = require('http-errors');
const logger = require('../logger');

// Mirror the unique index expression `lower(f_unaccent(name))` so a conflict can
// be resolved to the canonical existing row. The client cannot perfectly
// replicate Postgres `unaccent`, so the server is the single source of truth.
function foldedNameMatch(name) {
  return whereFn(
    fn('lower', fn('f_unaccent', col('name'))),
    fn('lower', fn('f_unaccent', name))
  );
}

// Reject malformed uids before they reach Postgres (invalid uuid input throws a DB error → 500)
const { UUID_PATTERN } = require('../utils/uuid');

// GET all topics for logged-in user
const getAllTopics = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const topics = await Topic.findAll({
      where: { userUid: userId },
      order: [['createdAt', 'DESC']]
    });
    res.json(topics);
  } catch (error) {
    logger.error('Error fetching topics:', error);
    next(createError(500, 'Error fetching topics'));
  }
};

// POST create new topic
const createTopic = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const { name, category } = req.body || {};
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) {
      return next(createError(400, 'Name is required'));
    }
    if (trimmedName.length > 255) {
      return next(createError(400, 'Name must be at most 255 characters'));
    }

    const trimmedCategory = typeof category === 'string' ? category.trim() : '';
    if (trimmedCategory.length > 255) {
      return next(createError(400, 'Category must be at most 255 characters'));
    }

    const topic = await Topic.create({
      userUid: userId,
      name: trimmedName,
      category: trimmedCategory || null
    });

    res.status(201).json(topic);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      // The unique index folds case + accents beyond what the client can mirror,
      // so a "Create" the UI offered may still collide. Return the canonical
      // existing topic so the client selects it deterministically instead of
      // re-folding (which silently fails on non-decomposable letters like ø/æ).
      let existing = null;
      try {
        existing = await Topic.findOne({
          where: { [Op.and]: [{ userUid: req.session.user }, foldedNameMatch(req.body.name.trim())] }
        });
      } catch (lookupError) {
        logger.error('Topic conflict lookup failed:', lookupError);
      }
      return res.status(409).json({ message: 'Topic already exists', topic: existing });
    }
    logger.error('Error creating topic:', error);
    next(createError(500, 'Error creating topic'));
  }
};

// PUT update topic
const updateTopic = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    if (!UUID_PATTERN.test(req.params.uid)) {
      return next(createError(404, 'Topic not found'));
    }

    // Scoped lookup (story 7.5): not-found and not-yours both 404 — no ownership 403.
    const topic = await Topic.findOne({ where: { uid: req.params.uid, userUid: userId } });
    if (!topic) {
      return next(createError(404, 'Topic not found'));
    }
    // Story 8.2: the system "Free practice" topic cannot be renamed or edited.
    // This is a legitimate non-ownership 403 (the user owns it) — it STAYS 403.
    if (topic.isSystem) {
      return next(createError(403, 'Cannot edit the system topic'));
    }

    const { name, category } = req.body || {};

    let nextName = topic.name;
    if (name !== undefined) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) {
        return next(createError(400, 'Name is required'));
      }
      if (trimmedName.length > 255) {
        return next(createError(400, 'Name must be at most 255 characters'));
      }
      nextName = trimmedName;
    }

    let nextCategory = topic.category;
    if (category !== undefined) {
      if (category !== null && typeof category !== 'string') {
        return next(createError(400, 'Category must be a string'));
      }
      const trimmedCategory = typeof category === 'string' ? category.trim() : '';
      if (trimmedCategory.length > 255) {
        return next(createError(400, 'Category must be at most 255 characters'));
      }
      nextCategory = trimmedCategory || null;
    }

    await topic.update({ name: nextName, category: nextCategory });
    res.json(topic);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return next(createError(409, 'Topic already exists'));
    }
    logger.error('Error updating topic:', error);
    next(createError(500, 'Error updating topic'));
  }
};

// DELETE topic
const deleteTopic = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    if (!UUID_PATTERN.test(req.params.uid)) {
      return next(createError(404, 'Topic not found'));
    }

    // Scoped lookup (story 7.5): not-found and not-yours both 404 — no ownership 403.
    const topic = await Topic.findOne({ where: { uid: req.params.uid, userUid: userId } });
    if (!topic) {
      return next(createError(404, 'Topic not found'));
    }
    // Story 8.2: the system "Free practice" topic cannot be deleted.
    // Legitimate non-ownership 403 (the user owns it) — it STAYS 403.
    if (topic.isSystem) {
      return next(createError(403, 'Cannot delete the system topic'));
    }

    await topic.destroy();
    res.json({ message: 'Topic deleted successfully' });
  } catch (error) {
    logger.error('Error deleting topic:', error);
    next(createError(500, 'Error deleting topic'));
  }
};

module.exports = {
  getAllTopics,
  createTopic,
  updateTopic,
  deleteTopic,
};
