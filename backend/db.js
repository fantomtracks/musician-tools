const { Sequelize } = require('sequelize');
// `./config/env` loads `.env` and resolves the environment ONCE, before anything reads NODE_ENV.
// This line used to be `process.env.NODE_ENV || 'production'` placed ABOVE the require that loaded
// `.env` — so a process started without NODE_ENV connected to PRODUCTION while every later reader
// saw `development`. Do not reintroduce a local fallback here (story 24.1).
const { env } = require('./config/env');
const config = require('./config/config')[env];
const logger = require('./logger');

// Which variable config.js reads for each environment. Kept HERE only to make the error below
// nameable — config.js remains the source of truth. A test asserts the two never diverge,
// otherwise this table would recreate exactly the duplication story 24.1 removed.
const DATABASE_URL_VAR = {
  development: 'DATABASE_URL_DEV',
  test: 'DATABASE_URL_DEV',
  staging: 'DATABASE_URL_REMOTE',
  production: 'DATABASE_URL_PROD',
};

// Without this, an unset URL surfaced as `The "url" argument must be of type string. Received
// undefined` — a raw Sequelize stack naming neither the variable nor the environment. Observed
// for real while booting the production image without secrets. This module already refuses to
// start with a clear message when NODE_ENV is missing; the URL deserves the same treatment.
if (!config || !config.url) {
  throw new Error(
    `No database URL for NODE_ENV=${env}.\n` +
    `config/config.js builds it from ${DATABASE_URL_VAR[env] || 'a DATABASE_URL_* variable'}, ` +
    'which is missing or empty.\n' +
    'Set it in the real environment or in backend/.env.'
  );
}

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
// Named export alongside the default: the anti-drift test needs the table, and every existing
// consumer keeps doing `require('../db')` to get the Sequelize instance unchanged.
module.exports.DATABASE_URL_VAR = DATABASE_URL_VAR;
