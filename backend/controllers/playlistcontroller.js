const { Playlist, PlaylistSong, Song, sequelize } = require('../models');
const { Op, fn, col, where: whereFn } = require('sequelize');
const createError = require('http-errors');
const logger = require('../logger');
const { isUuid } = require('../utils/uuid');

// Story 5.7: songs live in the PlaylistSongs join table (real FK), not the
// legacy Playlist.song_uids JSON column. The API contract is unchanged — every
// response still carries an ordered `songUids` array, derived from the join.

// Story 10.1: mirror the unique index expression `lower(name)` so a name
// collision can be resolved to the canonical existing playlist. Case-only
// (the index is lower(name)) → exact parity with the .toLowerCase() picker.
function foldedNameMatch(name) {
  return whereFn(fn('lower', col('name')), String(name == null ? '' : name).trim().toLowerCase());
}

// Resolve the existing playlist that a name conflict (23505) refers to, with its
// derived songUids, so the client can select it deterministically. Returns null
// if it cannot be resolved (best-effort, never throws).
const findExistingByName = async (userId, name, excludeUid) => {
  try {
    const and = [{ userUid: userId }, foldedNameMatch(name)];
    if (excludeUid) and.push({ uid: { [Op.ne]: excludeUid } });
    const existing = await Playlist.findOne({ where: { [Op.and]: and } });
    if (!existing) return null;
    const byPlaylist = await songUidsByPlaylist([existing.uid]);
    return withSongUids(existing, byPlaylist.get(existing.uid) || []);
  } catch (lookupError) {
    logger.error('Playlist conflict lookup failed:', lookupError);
    return null;
  }
};

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

    // Trim before persist (mirror topiccontroller) so the stored name matches the
    // lower(name) unique index and the foldedNameMatch lookup — otherwise a
    // whitespace-padded name collides on the index but cannot be resolved.
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) {
      return next(createError(400, 'Name is required'));
    }
    if (trimmedName.length > 255) {
      return next(createError(400, 'Name must be at most 255 characters'));
    }

    const { playlist, finalUids } = await sequelize.transaction(async (transaction) => {
      const created = await Playlist.create({
        userUid: userId,
        name: trimmedName,
        description: description || null
      }, { transaction });
      const persisted = await syncPlaylistSongs(created.uid, songUids, userId, transaction);
      return { playlist: created, finalUids: persisted };
    });

    res.status(201).json(withSongUids(playlist, finalUids));
  } catch (error) {
    // Story 10.1: a duplicate name (case-insensitive) hits the functional unique
    // index → return the canonical existing playlist so the client selects it.
    if (error.name === 'SequelizeUniqueConstraintError') {
      const existing = await findExistingByName(req.session.user, (req.body || {}).name);
      return res.status(409).json({ message: 'Playlist already exists', playlist: existing });
    }
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

    // Trim + validate a renamed name (mirror topiccontroller); an omitted name
    // leaves the existing one untouched.
    let nextName = playlist.name;
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

    const finalUids = await sequelize.transaction(async (transaction) => {
      await playlist.update({
        name: nextName,
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
    // Story 10.1: a rename onto a name already taken (case-insensitive) → 409
    // with the existing playlist (excluding the one being edited).
    if (error.name === 'SequelizeUniqueConstraintError') {
      const existing = await findExistingByName(req.session.user, (req.body || {}).name, req.params.uid);
      return res.status(409).json({ message: 'Playlist already exists', playlist: existing });
    }
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
