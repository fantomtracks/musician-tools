//This file loads the configuration for the current environment, it is designed this way to comply with the sequelize-cli
const logger = require('../logger');
// `.env` is loaded by ./env, which MUST be required before anything reads NODE_ENV — that
// ordering is the whole point of story 24.1. Requiring it here also validates the environment
// for sequelize-cli, which loads this file through .sequelizerc.
const { sslEnabled } = require('./env');

module.exports = {
  development: {
    // Configuration for development environment
    url: process.env.DATABASE_URL_DEV,
    dialect: 'postgres',
    connectionoptions: {
      dialect: 'postgres',
      dialectOptions: {
        // Conditional, like test/staging. It used to be hardcoded, so `NODE_ENV=development` —
        // the project's own official instruction — could not reach the docker-compose Postgres,
        // which does not speak SSL. An official instruction that does not work is worse than none.
        ssl: sslEnabled && {
          require: true,
          rejectUnauthorized: false,
        },
      },
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
      logging: msg => {
        logger.debug(msg, { service: 'database' });
      },
    },
    root_url: 'http://localhost:5173',
  },
  test: {
    // Configuration for local unit tests
    url: process.env.DATABASE_URL_DEV,
    dialect: 'postgres',
    connectionoptions: {
      dialect: 'postgres',
      ssl: sslEnabled,
      dialectOptions: {
        ssl: sslEnabled && {
          require: true,
          rejectUnauthorized: false,
        },
      },
      pool: {
        max: 2, // smaller pool for tests
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
      logging: msg => {
        logger.debug(msg, { service: 'database' });
      },
    },
  },
  staging: {
    // Configuration for remote staging environment
    url: process.env.DATABASE_URL_REMOTE,
    dialect: 'postgres',
    connectionoptions: {
      dialect: 'postgres',
      ssl: sslEnabled,
      dialectOptions: {
        ssl: sslEnabled && {
          require: true,
          rejectUnauthorized: false,
        },
      },
      pool: {
        max: parseInt(process.env.DB_POOL_MAX) || 5,
        min: parseInt(process.env.DB_POOL_MIN) || 0,
        acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 60000,
        idle: parseInt(process.env.DB_POOL_IDLE) || 10000,
      },
      logging: msg => {
        logger.debug(msg, { service: 'database' });
      },
    },
  },
  production: {
    // Configuration for production environment
    url: process.env.DATABASE_URL_PROD,
    dialect: 'postgres',
    connectionoptions: {
      dialect: 'postgres',
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      },
      pool: {
        max: parseInt(process.env.DB_POOL_MAX) || 5, // max connections per instance
        min: parseInt(process.env.DB_POOL_MIN) || 0, // min idle connections
        acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 60000, // max time (ms) to wait for connection
        idle: parseInt(process.env.DB_POOL_IDLE) || 10000, // idle time (ms) before closing connection
        evict: parseInt(process.env.DB_POOL_EVICT) || 1000, // how often (ms) to check for idle connections
      },
      logging: false, // disable logging in production
    },
    root_url: process.env.ROOT_URL,
  }
};
