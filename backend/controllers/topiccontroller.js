const { Topic } = require('../models');
const createError = require('http-errors');
const logger = require('../logger');

// Reject malformed uids before they reach Postgres (invalid uuid input throws a DB error → 500)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    const { name, category } = req.body;
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
      return next(createError(409, 'Topic already exists'));
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

    const topic = await Topic.findByPk(req.params.uid);
    if (!topic) {
      return next(createError(404, 'Topic not found'));
    }
    if (topic.userUid !== userId) {
      return next(createError(403, 'Forbidden'));
    }
    // Story 8.2: the system "Free practice" topic cannot be renamed or edited.
    if (topic.isSystem) {
      return next(createError(403, 'Cannot edit the system topic'));
    }

    const { name, category } = req.body;

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

    const topic = await Topic.findByPk(req.params.uid);
    if (!topic) {
      return next(createError(404, 'Topic not found'));
    }
    if (topic.userUid !== userId) {
      return next(createError(403, 'Forbidden'));
    }
    // Story 8.2: the system "Free practice" topic cannot be deleted.
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
