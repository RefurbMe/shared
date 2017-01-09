'use strict';

/* eslint no-unused-vars: 0 */

const bodyParser = require('body-parser');
const morgan = require('morgan');
const compression = require('compression');

const logger = require('./logger');

function addStandard(app) {
  app.disable('x-powered-by');
  app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true, parameterLimit: 10000 }));

  // health check
  app.get('/~health', (req, res) => {
    return res.send('ok');
  });

  // Remove trailing slashes
  app.use((req, res, next) => {
    if (req.path.substr(-1) === '/' && req.path.length > 1) {
      const query = req.url.slice(req.path.length);
      res.redirect(301, req.path.slice(0, -1) + query);
    } else {
      next();
    }
  });
}

function addCompression(app) {
  app.use(compression());
}

function addLogs(app) {
  const logMode = (process.env.NODE_ENV === 'development') ? 'dev' : 'combined';
  app.use(morgan(logMode, {
    stream: logger.stream,
    skip: (req, res) => {
      const urlLog = req.url.substring(0, 500);
      return /(\.(ico|png|jpg|gif|jpeg|woff|woff2|ttf|svg|css|js))|~*health/ig.exec(urlLog);
    },
  }));
}

function addErrorHandlers(app, isHTML) {
  if (logger.expressMiddleWare) {
    app.use(logger.expressMiddleWare);
  }

  // Page not found
  app.use((req, res, next) => {
    res.status(404);
    logger.error(`404: ${req.url}`, { status: 404, url: req.url });
    if (isHTML && req.accepts('html')) return res.render('pages/404', req.defaultVars);
    return res.send({ error: 'Not found' });
  });

  // Error middleware
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    const errorObject = {
      error: err.message,
      status,
    };
    logger.error(err.message, errorObject);

    if (process.env.NODE_ENV === 'production') {
      if (isHTML && req.accepts('html')) return res.render('pages/500', req.defaultVars);
      return res.send({ error: 'Internal server error' });
    }

    errorObject.trace = err;
    errorObject.stack = err.stack;
    res.status(err.status || 500);
    return res.send(errorObject);
  });
}

module.exports = {
  addStandard,
  addCompression,
  addLogs,
  addErrorHandlers,
};
