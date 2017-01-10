'use strict';

const winston = require('winston');
const expressWinston = require('express-winston');
const gcloud = require('./gcloud');

const isProd = (process.env.NODE_ENV === 'production');

let level = 'debug';
if (process.env.NODE_ENV === 'production') level = 'info';
if (process.env.NODE_ENV === 'test') level = 'error';

const defaultOptions = {
  level,
  json: false,
  colorize: !isProd,
};

// [START requests]
const requestLogger = expressWinston.logger({
  transports: [
    new winston.transports.Console(defaultOptions),
  ],
  msg: '{{res.statusCode}} {{req.method}} {{res.responseTime}}ms {{req.url}}',
  colorize: !isProd,
  meta: true,
  skip: (req) => {
    const urlLog = req.url.substring(0, 500);
    return /(^\/assets)|(\.(ico|png|jpg|gif|jpeg|woff|woff2|ttf|svg|css|js))|~*health/ig.exec(urlLog);
  },
});
// [END requests]

// [START errors]
const errorLogger = expressWinston.errorLogger({
  transports: [
    new winston.transports.Console(defaultOptions),
  ],
});
// [END errors]

module.exports = () => {
  return {
    requestLogger,
    errorLogger,
    gcloudErrorsMiddleWare: gcloud.expressMiddleWare(),
    error: (e) => {
      gcloud.reportError(e);
      winston.error(e);
    },
    warn: winston.warn,
    info: winston.info,
    log: winston.log,
    verbose: winston.verbose,
    debug: winston.debug,
    silly: winston.silly,
  };
};
