'use strict';

const bcryptjs = require('bcryptjs');
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    uid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    name: {
      // Not unique on its own — Discord-style identity allows duplicate display
      // names, disambiguated by discriminator (unique index on the pair). (7.2)
      type: DataTypes.STRING,
      allowNull: false
    },
    discriminator: {
      // 4-digit zero-padded STRING ('0042', never 42). Nullable in DB: set by the
      // backfill, then by register (7.7). Handle is shown as `${name}#${discriminator}`.
      type: DataTypes.STRING,
      allowNull: true
    },
    email: {
      // citext in DB (case-insensitive unique). The model keeps STRING; sync
      // ({alter:false}) does not change the existing column type. (7.2)
      type: DataTypes.STRING,
      allowNull: false,
      unique: {
        arg: true,
        msg: 'This email is already taken.'
      },
      validate: {
        isEmail: {
          msg: 'Invalid email address'
        }
      }
    },
    emailVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'email_verified'
    },
    pendingEmail: {
      // verify-before-switch target (story 7.11); null until a change is pending.
      type: DataTypes.STRING,
      allowNull: true,
      field: 'pending_email'
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      set(value) {
        const salt = bcryptjs.genSaltSync(10);
        this.setDataValue('password', bcryptjs.hashSync(value, salt));
      }
    },
    isAdmin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }, {
    tableName: 'Users',
    timestamps: true,
    defaultScope: {
      attributes: {
        exclude: ['password']
      }
    },
    indexes: [
      // Same name as migration 20260623000000 so sync({alter:false}) sees it
      // as already present and does not try to recreate it.
      { unique: true, fields: ['name', 'discriminator'], name: 'users_name_discriminator_unique' }
    ]
  });

  User.prototype.validPassword = function(password) {
    return bcryptjs.compare(password, this.password);
  };

  User.associate = function(models) {
    User.hasMany(models.Song, { foreignKey: 'userUid' });
  };

  return User;
};
