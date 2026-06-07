'use strict';

module.exports = (sequelize, DataTypes) => {
  const PracticeSession = sequelize.define('PracticeSession', {
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
    // The "day" of a session is the client's local date, stored verbatim (FR19).
    // DATEONLY keeps it free of any timezone conversion.
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    instrumentType: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'instrument_type'
    },
    durationMinutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'duration_minutes'
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'PracticeSessions',
    timestamps: true,
    indexes: [
      { fields: ['user_uid', 'date'], name: 'practice_sessions_user_uid_date' }
    ]
  });

  PracticeSession.associate = function(models) {
    PracticeSession.belongsTo(models.User, { foreignKey: 'userUid' });
    PracticeSession.hasMany(models.SessionItem, { foreignKey: 'sessionUid', as: 'items' });
  };

  return PracticeSession;
};
