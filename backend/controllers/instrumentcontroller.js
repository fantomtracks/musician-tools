const { Instrument } = require('../models');
const createError = require('http-errors');
const logger = require('../logger');
const { isUuid } = require('../utils/uuid');

// GET all instruments for logged-in user
const getAllInstruments = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const instruments = await Instrument.findAll({
      where: { userUid: userId },
      order: [['createdAt', 'DESC']]
    });
    res.json(instruments);
  } catch (error) {
    logger.error('Error fetching instruments:', error);
    next(createError(500, 'Error fetching instruments'));
  }
};

// POST create new instrument
const createInstrument = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const { name, type, brand, model } = req.body || {};
    if (!name) {
      return next(createError(400, 'Name is required'));
    }

    const instrument = await Instrument.create({
      userUid: userId,
      name,
      type,
      brand,
      model
    });

    res.status(201).json(instrument);
  } catch (error) {
    logger.error('Error creating instrument:', error);
    next(createError(500, 'Error creating instrument'));
  }
};

// PUT update instrument
const updateInstrument = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    // Scoped lookup (story 7.5): not-found and not-yours both 404 — no ownership 403.
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Instrument not found'));
    }
    const instrument = await Instrument.findOne({ where: { uid: req.params.uid, userUid: userId } });
    if (!instrument) {
      return next(createError(404, 'Instrument not found'));
    }

    const { name, type, brand, model } = req.body || {};
    await instrument.update({
      name: name !== undefined ? name : instrument.name,
      type: type !== undefined ? type : instrument.type,
      brand: brand !== undefined ? brand : instrument.brand,
      model: model !== undefined ? model : instrument.model,
    });

    res.json(instrument);
  } catch (error) {
    logger.error('Error updating instrument:', error);
    next(createError(500, 'Error updating instrument'));
  }
};

// DELETE instrument
const deleteInstrument = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    // Scoped lookup (story 7.5): not-found and not-yours both 404 — no ownership 403.
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Instrument not found'));
    }
    const instrument = await Instrument.findOne({ where: { uid: req.params.uid, userUid: userId } });
    if (!instrument) {
      return next(createError(404, 'Instrument not found'));
    }

    await instrument.destroy();
    res.json({ message: 'Instrument deleted successfully' });
  } catch (error) {
    logger.error('Error deleting instrument:', error);
    next(createError(500, 'Error deleting instrument'));
  }
};

module.exports = {
  getAllInstruments,
  createInstrument,
  updateInstrument,
  deleteInstrument,
};
