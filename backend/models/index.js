'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const basename = path.basename(__filename);

// Single point of decision — see backend/config/env.js. This used to duplicate
// `process.env.NODE_ENV || 'production'` from db.js, so the same bug had to be fixed twice or not
// at all (story 24.1).
const { env } = require('../config/env');
const config = require('../config/config')[env];

const db = {};
let sequelize = require('../db');

if (config.connectionoptions){
  sequelize = new Sequelize(config.url, config.connectionoptions);
}
else{
  sequelize = new Sequelize(config.url);
}

fs
  .readdirSync(__dirname)
  .filter(file => {
    return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js');
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
