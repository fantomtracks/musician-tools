'use strict';

module.exports = (sequelize, DataTypes) => {
  const SessionItem = sequelize.define('SessionItem', {
    uid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    sessionUid: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'session_uid',
      references: {
        model: 'PracticeSessions',
        key: 'uid'
      },
      onDelete: 'CASCADE'
    },
    songUid: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'song_uid',
      references: {
        model: 'Songs',
        key: 'uid'
      },
      onDelete: 'SET NULL'
    },
    topicUid: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'topic_uid',
      references: {
        model: 'Topics',
        key: 'uid'
      },
      onDelete: 'SET NULL'
    },
    // Snapshot of the referenced song title / topic name at attach time (FR4):
    // an entry keeps its display name even after the song/topic is deleted.
    label: {
      type: DataTypes.STRING,
      allowNull: false
    },
    minutes: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'SessionItems',
    timestamps: true,
    indexes: [
      { fields: ['session_uid'], name: 'session_items_session_uid' }
    ]
  });

  SessionItem.associate = function(models) {
    SessionItem.belongsTo(models.PracticeSession, { foreignKey: 'sessionUid' });
    SessionItem.belongsTo(models.Song, { foreignKey: 'songUid' });
    SessionItem.belongsTo(models.Topic, { foreignKey: 'topicUid' });
  };

  return SessionItem;
};
