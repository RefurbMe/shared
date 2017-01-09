'use strict';

const winston = require('winston');
const expressWinston = require('express-winston');

const gcloud = require('./gcloud');

const errors = (process.env.ENABLE_GCLOUD_ERROR) ? gcloud.error(process.cwd()) : {};

const colorize = process.env.NODE_ENV !== 'production';

let level = 'debug';
if (process.env.NODE_ENV === 'production') level = 'info';
if (process.env.NODE_ENV === 'test') level = 'error';

// Logger to capture all requests and output them to the console.
// [START requests]
const requestLogger = expressWinston.logger({
  transports: [
    new winston.transports.Console({
      level,
      json: false,
      colorize,
    }),
  ],
  expressFormat: true,
  meta: false,
  skip: (req) => {
    const urlLog = req.url.substring(0, 500);
    return /^\/assets|(\.(ico|png|jpg|gif|jpeg|woff|woff2|ttf|svg|css|js))|~*health/ig.exec(urlLog);
  },
});
// [END requests]

// Logger to capture any top-level errors and output json diagnostic info.
// [START errors]
const errorLogger = expressWinston.errorLogger({
  transports: [
    new winston.transports.Console({
      level,
      json: true,
      colorize,
    }),
  ],
});
// [END errors]

module.exports = {
  requestLogger,
  errorLogger,
  expressMiddleWare: errors.express,
  error: () => {
    if (errors.report) errors.report(arguments[0]);
    winston.error.apply(this, arguments);
  },
  warn: winston.warn,
  info: winston.info,
  log: winston.log,
  verbose: winston.verbose,
  debug: winston.debug,
  silly: winston.silly,
};
