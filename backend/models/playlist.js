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
