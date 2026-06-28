const { Playlist, PlaylistSong, Song, sequelize } = require('../models');
const createError = require('http-errors');
const logger = require('../logger');
const { isUuid } = require('../utils/uuid');

// Story 5.7: songs live in the PlaylistSongs join table (real FK), not the
// legacy Playlist.song_uids JSON column. The API contract is unchanged — every
// response still carries an ordered `songUids` array, derived from the join.

// Ordered songUids for a set of playlists, as Map<playlistUid, string[]>.
const songUidsByPlaylist = async (playlistUids, transaction) => {
  const map = new Map();
  if (playlistUids.length === 0) return map;
  const rows = await PlaylistSong.findAll({
    where: { playlistUid: playlistUids },
    order: [['position', 'ASC']],
    transaction
  });
  rows.forEach(row => {
    if (!map.has(row.playlistUid)) map.set(row.playlistUid, []);
    map.get(row.playlistUid).push(row.songUid);
  });
  return map;
};

// Replace a playlist's join rows from an ordered songUids array. Keeps only the
// owner's existing songs (FK integrity + ownership), preserves order, drops
// duplicates. Returns the final ordered list actually persisted.
const syncPlaylistSongs = async (playlistUid, songUids, userId, transaction) => {
  const requested = Array.isArray(songUids) ? songUids : [];
  const owned = requested.length === 0 ? [] : await Song.findAll({
    where: { uid: requested, userUid: userId },
    attributes: ['uid'],
    transaction
  });
  const ownedSet = new Set(owned.map(song => song.uid));
  const finalUids = [];
  const seen = new Set();
  for (const uid of requested) {
    if (ownedSet.has(uid) && !seen.has(uid)) {
      seen.add(uid);
      finalUids.push(uid);
    }
  }
  await PlaylistSong.destroy({ where: { playlistUid }, transaction });
  if (finalUids.length > 0) {
    await PlaylistSong.bulkCreate(
      finalUids.map((uid, index) => ({ playlistUid, songUid: uid, position: index })),
      { transaction }
    );
  }
  return finalUids;
};

const withSongUids = (playlist, songUids) => ({ ...playlist.toJSON(), songUids });

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
    const byPlaylist = await songUidsByPlaylist(playlists.map(p => p.uid));
    res.json(playlists.map(p => withSongUids(p, byPlaylist.get(p.uid) || [])));
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

    // Scoped lookup (story 7.5): not-found and not-yours both 404 — no ownership 403.
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Playlist not found'));
    }
    const playlist = await Playlist.findOne({ where: { uid: req.params.uid, userUid: userId } });
    if (!playlist) {
      return next(createError(404, 'Playlist not found'));
    }

    const byPlaylist = await songUidsByPlaylist([playlist.uid]);
    res.json(withSongUids(playlist, byPlaylist.get(playlist.uid) || []));
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

    const { name, description, songUids } = req.body || {};

    if (!name) {
      return next(createError(400, 'Name is required'));
    }

    const { playlist, finalUids } = await sequelize.transaction(async (transaction) => {
      const created = await Playlist.create({
        userUid: userId,
        name,
        description: description || null
      }, { transaction });
      const persisted = await syncPlaylistSongs(created.uid, songUids, userId, transaction);
      return { playlist: created, finalUids: persisted };
    });

    res.status(201).json(withSongUids(playlist, finalUids));
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

    // Scoped lookup (story 7.5): not-found and not-yours both 404 — no ownership 403.
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Playlist not found'));
    }
    const playlist = await Playlist.findOne({ where: { uid: req.params.uid, userUid: userId } });
    if (!playlist) {
      return next(createError(404, 'Playlist not found'));
    }

    const { name, description, songUids } = req.body || {};

    const finalUids = await sequelize.transaction(async (transaction) => {
      await playlist.update({
        name: name !== undefined ? name : playlist.name,
        description: description !== undefined ? description : playlist.description
      }, { transaction });
      // Only re-sync on a real array; an omitted (or null) songUids means
      // "leave the songs as they are", never "clear the playlist".
      if (Array.isArray(songUids)) {
        return syncPlaylistSongs(playlist.uid, songUids, userId, transaction);
      }
      const byPlaylist = await songUidsByPlaylist([playlist.uid], transaction);
      return byPlaylist.get(playlist.uid) || [];
    });

    res.json(withSongUids(playlist, finalUids));
  } catch (error) {
    logger.error('Error updating playlist:', error);
    next(createError(500, 'Error updating playlist'));
  }
};

// DELETE playlist (cascades its PlaylistSongs via FK)
const deletePlaylist = async (req, res, next) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return next(createError(401, 'Unauthorized'));
    }

    // Scoped lookup (story 7.5): not-found and not-yours both 404 — no ownership 403.
    if (!isUuid(req.params.uid)) {
      return next(createError(404, 'Playlist not found'));
    }
    const playlist = await Playlist.findOne({ where: { uid: req.params.uid, userUid: userId } });
    if (!playlist) {
      return next(createError(404, 'Playlist not found'));
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
    if (!isUuid(playlistUid)) {
      return next(createError(404, 'Playlist not found'));
    }
    if (!isUuid(songUid)) {
      return next(createError(404, 'Song not found'));
    }

    // Scoped lookup (story 7.5): not-found and not-yours both 404 — no ownership 403.
    const playlist = await Playlist.findOne({ where: { uid: playlistUid, userUid: userId } });
    if (!playlist) {
      return next(createError(404, 'Playlist not found'));
    }

    const finalUids = await sequelize.transaction(async (transaction) => {
      const byPlaylist = await songUidsByPlaylist([playlist.uid], transaction);
      const current = byPlaylist.get(playlist.uid) || [];
      if (current.includes(songUid)) return current;
      return syncPlaylistSongs(playlist.uid, [...current, songUid], userId, transaction);
    });

    res.json(withSongUids(playlist, finalUids));
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
    if (!isUuid(playlistUid)) {
      return next(createError(404, 'Playlist not found'));
    }
    if (!isUuid(songUid)) {
      return next(createError(404, 'Song not found'));
    }

    // Scoped lookup (story 7.5): not-found and not-yours both 404 — no ownership 403.
    const playlist = await Playlist.findOne({ where: { uid: playlistUid, userUid: userId } });
    if (!playlist) {
      return next(createError(404, 'Playlist not found'));
    }

    const finalUids = await sequelize.transaction(async (transaction) => {
      const byPlaylist = await songUidsByPlaylist([playlist.uid], transaction);
      const current = byPlaylist.get(playlist.uid) || [];
      return syncPlaylistSongs(playlist.uid, current.filter(uid => uid !== songUid), userId, transaction);
    });

    res.json(withSongUids(playlist, finalUids));
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
