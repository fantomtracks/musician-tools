'use strict';

module.exports = (sequelize, DataTypes) => {
  // Catalog entry: a canonical, SHARED song record (no owner). Mirrors the
  // INTRINSIC subset of Songs columns so "Add to my songlist" (story 19.4) is a
  // 1:1 copy. NO userUid, and none of the instrument/personal fields (instrument,
  // instrumentTuning, instrumentDifficulty, capo, technique, instrumentLinks,
  // notes, lastPlayed, myInstrumentUid) — those only exist on the personal Song.
  const CatalogSong = sequelize.define('CatalogSong', {
    uid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    // Story 19.1: GLOBAL canonical uniqueness on (lower(title), COALESCE(lower(artist), ''))
    // is enforced by a FUNCTIONAL unique index created in migration
    // 20260715000000-create-catalog-songs. It is not expressible via the Sequelize
    // `indexes` DSL, so it is intentionally NOT declared here — sync({alter:false})
    // must not try to create or drop it. Same discipline as Song (17.1) but WITHOUT
    // user_uid (the key is global). The controller maps 23505 -> a typed 409.
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    artist: {
      type: DataTypes.STRING,
      allowNull: true
    },
    album: {
      type: DataTypes.STRING,
      allowNull: true
    },
    key: {
      type: DataTypes.STRING,
      allowNull: true
    },
    bpm: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null
    },
    mode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    timeSignature: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'time_signature'
    },
    durationSeconds: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      field: 'duration_seconds'
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
    streamingLinks: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      field: 'streaming_links'
    },
    pitchStandard: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 440,
      field: 'pitch_standard'
    }
  }, {
    tableName: 'CatalogSongs',
    timestamps: true
  });

  return CatalogSong;
};
