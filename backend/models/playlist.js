'use strict';

module.exports = (sequelize, DataTypes) => {
  const Playlist = sequelize.define('Playlist', {
    uid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    userUid: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_uid',
      references: {
        model: 'Users',
        key: 'uid'
      },
      onDelete: 'CASCADE'
    },
    // Story 10.1: uniqueness per user is case-insensitive, enforced by the
    // FUNCTIONAL unique index `playlists_user_uid_name_ci` on
    // (user_uid, lower(name)) — see migration 20260628000200. It is not
    // expressible via the Sequelize index DSL, so it lives in the migration only
    // (sync({alter:false}) must not try to create/drop it).
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    songUids: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      field: 'song_uids'
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'Playlists'
  });

  Playlist.associate = (models) => {
    Playlist.belongsTo(models.User, {
      foreignKey: 'userUid',
      targetKey: 'uid',
      as: 'user'
    });
  };

  return Playlist;
};
