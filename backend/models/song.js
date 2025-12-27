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
    notes: {
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
    pitchStandard: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 440,
      field: 'pitch_standard'
    },
    tunning: {
      type: DataTypes.STRING,
      allowNull: true
    },
    technique: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null
    },
    instrumentLinks: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null
    },
    instrumentDifficulty: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null
    },
    instrument: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null
    },
    myInstrumentUid: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'my_instrument_uid',
      references: {
        model: 'Instruments',
        key: 'uid'
      },
      onDelete: 'SET NULL'
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
    Song.belongsTo(models.Instrument, { foreignKey: 'myInstrumentUid' });
  };

  return Song;
};
