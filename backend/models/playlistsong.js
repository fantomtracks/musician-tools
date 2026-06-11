'use strict';

// Story 5.7: join row linking a playlist to one of its songs, in order.
// The song_uid FK cascades on song delete, so a removed song drops out of every
// playlist automatically (no more orphan UIDs to clean by hand).
module.exports = (sequelize, DataTypes) => {
  const PlaylistSong = sequelize.define('PlaylistSong', {
    uid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    playlistUid: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'playlist_uid',
      references: {
        model: 'Playlists',
        key: 'uid'
      },
      onDelete: 'CASCADE'
    },
    songUid: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'song_uid',
      references: {
        model: 'Songs',
        key: 'uid'
      },
      onDelete: 'CASCADE'
    },
    // Order of the song within the playlist (the user-visible order is truth).
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  }, {
    tableName: 'PlaylistSongs',
    timestamps: true,
    indexes: [
      { fields: ['playlist_uid'], name: 'playlist_songs_playlist_uid' },
      { fields: ['playlist_uid', 'song_uid'], name: 'playlist_songs_unique', unique: true }
    ]
  });

  PlaylistSong.associate = function(models) {
    PlaylistSong.belongsTo(models.Playlist, { foreignKey: 'playlistUid' });
    PlaylistSong.belongsTo(models.Song, { foreignKey: 'songUid' });
  };

  return PlaylistSong;
};
