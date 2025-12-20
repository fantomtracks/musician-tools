const { createLogger, format, transports } = require('winston');

let consoletransport = new transports.Console({
  format: format.combine(
    format.json(),
    format.colorize(),
    format.simple(), 
    format.splat()
  ), 
  level: "info"
});

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { 
    service: 'musician-tools-backend'
  },
  exceptionHandlers: [
    new transports.File({ filename: 'logs/exceptions.log', maxsize: 5242880 }), 
    consoletransport
  ],
  transports: [
    new transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 5242880 }),
    new transports.File({ filename: 'logs/combined.log', maxsize: 5242880 }), 
    consoletransport
  ]
});

// If we're in development or test, log at debug level
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
  consoletransport.level = "debug";
}

module.exports = logger;
