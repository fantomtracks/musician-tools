'use strict';

module.exports = (sequelize, DataTypes) => {
  const Song = sequelize.define('Song', {
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
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    bpm: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null
    },
    key: {
      type: DataTypes.STRING,
      allowNull: true
    },
    chords: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    tabs: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    album: {
      type: DataTypes.STRING,
      allowNull: true
    },
    tunning: {
      type: DataTypes.STRING,
      allowNull: true
    },
    instrument: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null
    },
    artist: {
      type: DataTypes.STRING,
      allowNull: true
    },
    lastPlayed: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_played'
    }
  }, {
    tableName: 'Songs',
    timestamps: true
  });

  Song.associate = function(models) {
    Song.belongsTo(models.User, { foreignKey: 'userUid' });
  };

  return Song;
};
