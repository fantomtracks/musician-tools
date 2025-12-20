const { Song } = require('../models');
const createError = require('http-errors');
const logger = require('../logger');

// GET all songs for logged-in user
const getAllSongs = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const songs = await Song.findAll({
      where: { userUid: userId },
      order: [['createdAt', 'DESC']]
    });
    res.json(songs);
  } catch (error) {
    logger.error('Error fetching songs:', error);
    next(createError(500, 'Error fetching songs'));
  }
};

// GET single song by uid
const getSong = async (req, res, next) => {
  try {
    const song = await Song.findByPk(req.params.uid);
    if (!song) {
      return next(createError(404, 'Song not found'));
    }
    res.json(song);
  } catch (error) {
    logger.error('Error fetching song:', error);
    next(createError(500, 'Error fetching song'));
  }
};

// POST create new song
const createSong = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const { title, bpm, key, chords, tabs, instrument, artist, lastPlayed } = req.body;

    if (!title) {
      return next(createError(400, 'Title is required'));
    }

    const song = await Song.create({
      userUid: userId,
      title,
      bpm: bpm || 120,
      key,
      chords,
      tabs,
      instrument,
      artist,
      lastPlayed: lastPlayed ? new Date(lastPlayed) : null
    });

    res.status(201).json(song);
  } catch (error) {
    logger.error('Error creating song:', error);
    next(createError(500, 'Error creating song'));
  }
};

// PUT update song
const updateSong = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const song = await Song.findByPk(req.params.uid);
    if (!song) {
      return next(createError(404, 'Song not found'));
    }

    // Check ownership
    if (song.userUid !== userId) {
      return next(createError(403, 'Forbidden'));
    }

    const { title, bpm, key, chords, tabs, instrument, artist, lastPlayed } = req.body;

    await song.update({
      title: title || song.title,
      bpm: bpm !== undefined ? bpm : song.bpm,
      key: key !== undefined ? key : song.key,
      chords: chords !== undefined ? chords : song.chords,
      tabs: tabs !== undefined ? tabs : song.tabs,
      instrument: instrument !== undefined ? instrument : song.instrument,
      artist: artist !== undefined ? artist : song.artist,
      lastPlayed: lastPlayed ? new Date(lastPlayed) : song.lastPlayed
    });

    res.json(song);
  } catch (error) {
    logger.error('Error updating song:', error);
    next(createError(500, 'Error updating song'));
  }
};

// DELETE song
const deleteSong = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const song = await Song.findByPk(req.params.uid);
    if (!song) {
      return next(createError(404, 'Song not found'));
    }

    // Check ownership
    if (song.userUid !== userId) {
      return next(createError(403, 'Forbidden'));
    }

    await song.destroy();
    res.json({ message: 'Song deleted successfully' });
  } catch (error) {
    logger.error('Error deleting song:', error);
    next(createError(500, 'Error deleting song'));
  }
};

module.exports = {
  getAllSongs,
  getSong,
  createSong,
  updateSong,
  deleteSong
};
