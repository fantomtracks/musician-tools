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
      // Per-user uniqueness is case- AND accent-insensitive (story 7.12), enforced
      // by a FUNCTIONAL unique index (user_uid, lower(f_unaccent(name))) created in
      // migration 20260625000000-topics-name-ci-unaccent. That expression isn't
      // representable in Sequelize's index DSL, so it lives only in the migration
      // (see the indexes block below). The column stays a plain STRING.
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
      // Per-user uniqueness lives in the FUNCTIONAL index
      // topics_user_uid_name_ci_unaccent (user_uid, lower(f_unaccent(name))),
      // created in migration 20260625000000 (story 7.12) — case- & accent-
      // insensitive, not expressible in this DSL. sync({alter:false}) never
      // drops it. Its presence is guaranteed by the boot-time fail-fast guard
      // (story 11.1, backend/utils/assertSchema.js), not by a self-healing hook.
      { fields: ['name'], name: 'topics_name' }
    ]
  });

  Topic.associate = function(models) {
    Topic.belongsTo(models.User, { foreignKey: 'userUid' });
  };

  return Topic;
};
