//This file loads the configuration for the current environment, it is designed this way to comply with the sequelize-cli
const logger = require('../logger');
if (process.env.NODE_ENV !== 'production') {
  logger.info('loading .env file');
  require('dotenv').config();
}

module.exports = {
  development: {
    // Configuration for development environment
    url: process.env.DATABASE_URL_DEV,
    jwtsecret: 'musician-secret-key',
    connectionoptions: {
      dialect: 'postgres',
      dialectOptions: {
        ssl: {
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
    jwtsecret: 'musician-secret-key',
    connectionoptions: {
      dialect: 'postgres',
      ssl: process.env.DB_ENABLE_SSL,
      dialectOptions: {
        ssl: process.env.DB_ENABLE_SSL && {
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
    jwtsecret: process.env.JWT_SECRET || 'musician-secret-key',
    connectionoptions: {
      dialect: 'postgres',
      ssl: process.env.DB_ENABLE_SSL,
      dialectOptions: {
        ssl: process.env.DB_ENABLE_SSL && {
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
    jwtsecret: process.env.JWT_SECRET,
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
