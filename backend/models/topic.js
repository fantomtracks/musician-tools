'use strict';

module.exports = (sequelize, DataTypes) => {
  const Topic = sequelize.define('Topic', {
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
    category: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Story 8.2: marks the per-user "Free practice" topic. System topics are
    // pinned in the entry picker and cannot be renamed or deleted. Never set
    // from client input — only the registration seed / backfill flips it true.
    isSystem: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_system'
    }
  }, {
    tableName: 'Topics',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['user_uid', 'name'], name: 'topics_user_uid_name' },
      { fields: ['name'], name: 'topics_name' }
    ]
  });

  Topic.associate = function(models) {
    Topic.belongsTo(models.User, { foreignKey: 'userUid' });
  };

  return Topic;
};
