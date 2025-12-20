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
      type: DataTypes.STRING,
      unique: {
        arg: true,
        msg: 'This username is already taken.'
      },
      allowNull: false
    },
    email: {
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
    }
  });

  User.prototype.validPassword = function(password) {
    return bcryptjs.compare(password, this.password);
  };

  User.associate = function(models) {
    User.hasMany(models.Song, { foreignKey: 'userUid' });
  };

  return User;
};
