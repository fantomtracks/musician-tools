'use strict';

module.exports = (sequelize, DataTypes) => {
  const SongPlay = sequelize.define('SongPlay', {
    uid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    songUid: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    instrumentUid: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    instrumentType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    playedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    // The session entry this play represents (story 4.2); null for standalone
    // plays (retro-imported history, or a no-instrument mark). No `field:` map:
    // SongPlays columns are camelCase in DB. The FK + ON DELETE CASCADE is
    // declared here too (not only in the migration) so a sync-first environment
    // (fresh local / CI, where sequelize.sync runs before migrations) creates
    // the cascade — otherwise deleting a session would orphan its plays.
    sessionItemUid: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'SessionItems',
        key: 'uid'
      },
      onDelete: 'CASCADE'
    },
  }, {
    // The FK is filtered by the cascade and by the session controller's
    // play sync (update/destroy where sessionItemUid) — index it.
    indexes: [
      { fields: ['sessionItemUid'], name: 'song_plays_session_item_uid' }
    ]
  });

  SongPlay.associate = function(models) {
    SongPlay.belongsTo(models.Song, { foreignKey: 'songUid' });
    SongPlay.belongsTo(models.Instrument, { foreignKey: 'instrumentUid' });
    SongPlay.belongsTo(models.SessionItem, { foreignKey: 'sessionItemUid' });
  };

  return SongPlay;
};
