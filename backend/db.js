const { Sequelize } = require('sequelize');
const env = process.env.NODE_ENV || 'production';
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
