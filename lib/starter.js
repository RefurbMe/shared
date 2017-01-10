'use strict';

const co = require('co');
const Promise = require('bluebird');
const ping = require('net-ping');

const logger = require('./logger');
const utils = require('./utils');

let httpServer;

function exitProcess(signal) {
  const exitCode = (/^SIG/.exec(signal)) ? 0 : 1;
  setTimeout(() => process.exit(exitCode), 10);
}

module.exports = function (options) {
  let waitingForExit = false;
  let pingFailureCount = 0;
  let dbFailureCount = 0;

  const closeGracefully = (signal) => {
    if (waitingForExit) return;
    logger.info(`Gracefully shutting down from ${signal}...`);

    co(function* () {
      const actions = [];
      if (options.knex) {
        actions.push(options.knex.destroy().then(() => logger.info('Database Closed')));
      }

      if (httpServer) {
        actions.push(new Promise((resolve, reject) => {
          httpServer.close((err) => {
            if (err) return reject(err);
            return resolve(true);
          });
        }).then(() => logger.info('HTTP Server Closed')));
      }

      if (options.publisher) {
        actions.push(new Promise((resolve, reject) => {
          options.publisher.close((err) => {
            if (err) return reject(err);
            return resolve(true);
          });
        }).then(() => logger.info('Publisher Closed')));
      }

      if (options.coworkers) {
        actions.push(options.coworkers.close().then(() => logger.info('AMQ Closed')));
      }
      yield actions;
    })
    .then(() => {
      exitProcess(signal);
    })
    .catch((e) => {
      logger.error(e);
      exitProcess(signal);
      waitingForExit = true;
    });
  };

  function checkDb() {
    return options.knex.raw('SELECT 1')
    .then(() => {
      dbFailureCount = 0;
      setTimeout(checkDb, 10000);
      return true;
    })
    .catch((err) => {
      if (dbFailureCount < 5) {
        dbFailureCount += 1;
        logger.error(`Error connecting to Postgres - ${dbFailureCount} attempt`);
        const waitCount = 1000 * dbFailureCount;
        return Promise.delay(waitCount).then(() => checkDb());
      }
      logger.error(err);
      closeGracefully('NODB');
      waitingForExit = true;
      return null;
    });
  }

  function pingHosts() {
    const session = ping.createSession();
    return Promise.all(options.checkHost.map((host) => {
      return new Promise((resolve, reject) => {
        session.pingHost(host, (err, target) => {
          if (err) return reject(err);
          return resolve(target);
        });
      });
    }))
    .then(() => {
      pingFailureCount = 0;
      setTimeout(pingHosts, 30000); // Check every 30 sec
      return true;
    })
    .catch((err) => {
      if (pingFailureCount < 5) {
        pingFailureCount += 1;
        const waitCount = 1000 * pingFailureCount;
        logger.error(`Error connecting to Postgres - ${pingFailureCount} attempt - waitCount ${waitCount / 1000}s`);
        return Promise.delay(waitCount).then(() => pingHosts());
      }
      logger.error(err);
      closeGracefully('NOHOST');
      waitingForExit = true;
      return null;
    });
  }

  ['SIGINT', 'SIGTERM', 'SIGQUIT', 'uncaughtException', 'unhandledRejection']
  .forEach((signal) => {
    process.on(signal, (err) => {
      if (err) logger.error(err);
      closeGracefully(signal);
      waitingForExit = true;
    });
  });

  const promises = {};
  if (options.http && options.httpPort) {
    promises.http = new Promise((resolve, reject) => {
      httpServer = options.http.listen(options.httpPort, (err) => {
        if (err) return reject(err);
        return resolve(true);
      });
    })
    .then(() => {
      logger.info(`HTTP server Started: ${options.httpPort}`);
    });
  }

  if (options.publisher && options.amqUrl && options.publisherExchanges) {
    promises.publisher = options.publisher.start(options.amqUrl, options.publisherExchanges)
      .then(() => logger.info('Publisher Started'));
  }

  if (options.coworkers && options.amqUrl) {
    promises.coworkers = options.coworkers.start(options.amqUrl)
      .then(() => logger.info('AMQ Started'));
  }

  if (options.cache && options.redisUrl) {
    promises.cache = new Promise((resolve, reject) => {
      try {
        options.cache.start(options.redisUrl);
        resolve(true);
      } catch (e) {
        reject(e);
      }
    })
    .then(() => logger.info('Cache Started'));
  }

  if (options.custom) {
    promises.custom = options.custom;
  }

  if (options.knex) {
    promises.knex = checkDb();
  }

  if (options.checkHost) {
    promises.checkHost = pingHosts();
  }

  const defaultOrder = options.order || ['checkHost', 'knex', 'cache', 'custom', 'publisher', 'coworkers', 'http'];

  return utils.seqPromise(defaultOrder, (promiseName) => {
    if (promises[promiseName]) return promises[promiseName];
    return null;
  })
  .then(() => {
    logger.info('Ready to rock!');
  })
  .catch((e) => {
    logger.error(e);
    exitProcess('START');
    waitingForExit = true;
  });
};
