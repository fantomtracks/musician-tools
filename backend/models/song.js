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
    // Story 17.1: per-user uniqueness on (user_uid, lower(title), COALESCE(lower(artist), ''))
    // is enforced by a FUNCTIONAL unique index created in migration
    // 20260710000000-songs-title-artist-ci-unique. It is not expressible via the
    // Sequelize `indexes` DSL, so it is intentionally NOT declared here — sync()
    // must not try to create or drop it. See the controller for the 23505 -> 409 mapping.
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    bpm: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null
    },
    durationSeconds: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      field: 'duration_seconds'
    },
    key: {
      type: DataTypes.STRING,
      allowNull: true
    },
    capo: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    album: {
      type: DataTypes.STRING,
      allowNull: true
    },
    language: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null
    },
    genre: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null
    },
    pitchStandard: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 440,
      field: 'pitch_standard'
    },
    instrumentTuning: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null
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
    },
    streamingLinks: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      field: 'streaming_links'
    },
    timeSignature: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'time_signature'
    },
    mode: {
      type: DataTypes.STRING,
      allowNull: true
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
