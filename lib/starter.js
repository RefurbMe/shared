'use strict';

const Promise = require('bluebird');
const co = require('co');

const logger = require('./logger');

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
      if (options.knex) {
        yield options.knex.destroy().then(() => logger.info('Database Closed'));
      }

      if (options.http) {
        yield Promise.promisify(options.http.close);
      }

      if (options.publisher) {
        yield Promise.promisify(options.publisher.close);
      }

      if (options.coworkers) {
        yield options.coworkers.close;
      }
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
    if (options.http && options.httpPort) {
      yield Promise.promisify(options.http.listen)(options.httpPort)
        .then(() => logger.info(`HTTP server Started: ${options.httpPort}`));
    }

    if (options.publisher && options.amqUrl && options.publisherExchanges) {
      yield options.publisher.start(options.amqUrl, options.publisherExchanges)
        .then(() => logger.info('Publisher Started'));
    }

    if (options.coworkers && options.amqUrl) {
      yield options.coworkers.start(options.amqUrl)
        .then(() => logger.info('AMQ Started'));
    }

    if (options.cache && options.redisUrl) {
      yield options.cache.start(options.redisUrl)
        .then(() => logger.info('Redis Started'));
    }
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
