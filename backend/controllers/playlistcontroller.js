const { Playlist } = require('../models');
const createError = require('http-errors');
const logger = require('../logger');

// GET all playlists for logged-in user
const getAllPlaylists = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const playlists = await Playlist.findAll({
      where: { userUid: userId },
      order: [['createdAt', 'DESC']]
    });
    res.json(playlists);
  } catch (error) {
    logger.error('Error fetching playlists:', error);
    next(createError(500, 'Error fetching playlists'));
  }
};

// GET single playlist by uid
const getPlaylist = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const playlist = await Playlist.findByPk(req.params.uid);
    if (!playlist) {
      return next(createError(404, 'Playlist not found'));
    }

    // Check ownership
    if (playlist.userUid !== userId) {
      return next(createError(403, 'Forbidden'));
    }

    res.json(playlist);
  } catch (error) {
    logger.error('Error fetching playlist:', error);
    next(createError(500, 'Error fetching playlist'));
  }
};

// POST create new playlist
const createPlaylist = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const { name, description, songUids } = req.body;

    if (!name) {
      return next(createError(400, 'Name is required'));
    }

    const playlist = await Playlist.create({
      userUid: userId,
      name,
      description: description || null,
      songUids: songUids || []
    });

    res.status(201).json(playlist);
  } catch (error) {
    logger.error('Error creating playlist:', error);
    next(createError(500, 'Error creating playlist'));
  }
};

// PUT update playlist
const updatePlaylist = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const playlist = await Playlist.findByPk(req.params.uid);
    if (!playlist) {
      return next(createError(404, 'Playlist not found'));
    }

    // Check ownership
    if (playlist.userUid !== userId) {
      return next(createError(403, 'Forbidden'));
    }

    const { name, description, songUids } = req.body;

    await playlist.update({
      name: name !== undefined ? name : playlist.name,
      description: description !== undefined ? description : playlist.description,
      songUids: songUids !== undefined ? songUids : playlist.songUids
    });

    res.json(playlist);
  } catch (error) {
    logger.error('Error updating playlist:', error);
    next(createError(500, 'Error updating playlist'));
  }
};

// DELETE playlist
const deletePlaylist = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const playlist = await Playlist.findByPk(req.params.uid);
    if (!playlist) {
      return next(createError(404, 'Playlist not found'));
    }

    // Check ownership
    if (playlist.userUid !== userId) {
      return next(createError(403, 'Forbidden'));
    }

    await playlist.destroy();
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting playlist:', error);
    next(createError(500, 'Error deleting playlist'));
  }
};

// POST add song to playlist
const addSongToPlaylist = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const { uid: playlistUid, songUid } = req.params;

    const playlist = await Playlist.findByPk(playlistUid);
    if (!playlist) {
      return next(createError(404, 'Playlist not found'));
    }

    // Check ownership
    if (playlist.userUid !== userId) {
      return next(createError(403, 'Forbidden'));
    }

    const songUids = playlist.songUids || [];
    if (!songUids.includes(songUid)) {
      songUids.push(songUid);
      await playlist.update({ songUids });
    }

    res.json(playlist);
  } catch (error) {
    logger.error('Error adding song to playlist:', error);
    next(createError(500, 'Error adding song to playlist'));
  }
};

// DELETE remove song from playlist
const removeSongFromPlaylist = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    const { uid: playlistUid, songUid } = req.params;

    const playlist = await Playlist.findByPk(playlistUid);
    if (!playlist) {
      return next(createError(404, 'Playlist not found'));
    }

    // Check ownership
    if (playlist.userUid !== userId) {
      return next(createError(403, 'Forbidden'));
    }

    const songUids = (playlist.songUids || []).filter(uid => uid !== songUid);
    await playlist.update({ songUids });

    res.json(playlist);
  } catch (error) {
    logger.error('Error removing song from playlist:', error);
    next(createError(500, 'Error removing song from playlist'));
  }
};

module.exports = {
  getAllPlaylists,
  getPlaylist,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist
};
