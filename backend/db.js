const { Sequelize } = require('sequelize');
// `./config/env` loads `.env` and resolves the environment ONCE, before anything reads NODE_ENV.
// This line used to be `process.env.NODE_ENV || 'production'` placed ABOVE the require that loaded
// `.env` — so a process started without NODE_ENV connected to PRODUCTION while every later reader
// saw `development`. Do not reintroduce a local fallback here (story 24.1).
const { env } = require('./config/env');
const config = require('./config/config')[env];
const logger = require('./logger');
let sequelize;

if (config.connectionoptions){
  sequelize = new Sequelize(config.url, config.connectionoptions);
}
else{
  sequelize = new Sequelize(config.url);
}

sequelize.authenticate()
  .then(() => {
    logger.info('Connection to the DB has been established successfully.');
  })
  .catch(error => {
    logger.error('Unable to connect to the database:', {error});
  });

module.exports = sequelize;
