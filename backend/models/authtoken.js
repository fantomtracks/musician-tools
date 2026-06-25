'use strict';

// Single-use, hashed, expiring tokens for the email flows (story 7.6):
// verify_email (signup), password_reset, change_email. The opaque token is sent
// in clear by email but only its sha256 is stored (tokenHash). Pattern follows
// Songs: camelCase JS attributes mapped to snake_case DB columns.
module.exports = (sequelize, DataTypes) => {
  const AuthToken = sequelize.define('AuthToken', {
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
    type: {
      type: DataTypes.ENUM('verify_email', 'password_reset', 'change_email'),
      allowNull: false
    },
    tokenHash: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'token_hash'
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at'
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'used_at'
    }
  }, {
    tableName: 'AuthTokens',
    timestamps: true,
    // verifyToken looks up by token_hash — keep the index here too so the table
    // gets it whichever path creates it (migration in prod, sequelize.sync in dev).
    indexes: [{ fields: ['token_hash'] }]
  });

  AuthToken.associate = function(models) {
    AuthToken.belongsTo(models.User, { foreignKey: 'userUid' });
  };

  return AuthToken;
};
