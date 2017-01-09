'use strict';

const winston = require('winston');

const gcloud = require('./gcloud');

const errors = (process.env.ENABLE_GCLOUD_ERROR) ? gcloud.error(process.cwd()) : {};

winston.emitErrs = true;

let levelConsole = 'debug';
if (process.env.NODE_ENV === 'production') levelConsole = 'info';
if (process.env.NODE_ENV === 'test') levelConsole = 'error';

const transports = [];

const consoleTransport = new winston.transports.Console({
  level: levelConsole,
  handleExceptions: true,
  json: false,
  colorize: true,
});

if (process.env.NODE_ENV !== 'test') {
  transports.push(consoleTransport);
}

const logger = new winston.Logger({
  transports,
  exitOnError: false,
});

logger.stream = {
  write: (message) => {
    logger.info(message.replace(/\n$/, ''));
  },
};

logger.on('error', (err) => {
  if (errors.report) errors.report(err);
});

logger.expressMiddleWare = errors.express;

module.exports = logger;
