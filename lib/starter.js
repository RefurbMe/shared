'use strict';

const Promise = require('bluebird');
const co = require('co');

const logger = require('./logger');

let httpServer;

function exitProcess(signal) {
  const exitCode = (/^SIG/.exec(signal)) ? 0 : 1;
  setTimeout(() => process.exit(exitCode), 10);
}

module.exports = function (options) {
  let waitingForExit = false;

  const closeGracefully = (signal) => {
    if (waitingForExit) return;
    logger.info(`Gracefully shutting down from ${signal}...`);

    co(function* () {
      const actions = [];
      if (options.knex) {
        actions.push(options.knex.destroy().then(() => logger.info('Database Closed')));
      }

      if (httpServer) {
        actions.push(Promise.promisify(httpServer.close)());
      }

      if (options.publisher) {
        actions.push(Promise.promisify(options.publisher.close)());
      }

      if (options.coworkers) {
        actions.push(options.coworkers.close);
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

  if (options.knex) {
    let failureCount = 0;
    const checkDb = function checkDb() {
      return options.knex.raw('SELECT 1')
      .then(() => {
        failureCount = 0;
        return setTimeout(checkDb, 10000); // Check every 10 sec
      })
      .catch((err) => {
        if (failureCount < 5) {
          failureCount += 1;
          logger.error(`Error connecting to Postgres - ${failureCount} attempt`);
          return setTimeout(checkDb, 1000);
        }
        logger.error(err);
        closeGracefully('NODB');
        waitingForExit = true;
        return null;
      });
    };
    checkDb();
  }

  ['SIGINT', 'SIGTERM', 'SIGQUIT', 'uncaughtException', 'unhandledRejection']
  .forEach((signal) => {
    process.on(signal, (err) => {
      if (err) logger.error(err);
      closeGracefully(signal);
      waitingForExit = true;
    });
  });

  return co(function* () {
    const actions = [];
    if (options.http && options.httpPort) {
      const httpPromise = new Promise((resolve, reject) => {
        httpServer = options.http.listen(options.httpPort, (err) => {
          if (err) return reject(err);
          return resolve(true);
        });
      })
      .then(() => {
        logger.info(`HTTP server Started: ${options.httpPort}`);
      });
      actions.push(httpPromise);
    }

    if (options.publisher && options.amqUrl && options.publisherExchanges) {
      actions.push(options.publisher.start(options.amqUrl, options.publisherExchanges)
        .then(() => logger.info('Publisher Started')));
    }

    if (options.coworkers && options.amqUrl) {
      actions.push(options.coworkers.start(options.amqUrl)
        .then(() => logger.info('AMQ Started')));
    }

    if (options.cache && options.redisUrl) {
      options.cache.start(options.redisUrl);
      logger.info('Redis Started');
    }
    yield actions;
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
