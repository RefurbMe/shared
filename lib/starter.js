'use strict';

const Promise = require('bluebird');

const logger = require('./logger');

function exitProcess(signal) {
  const exitCode = (/^SIG/.exec(signal)) ? 0 : 1;
  setTimeout(() => process.exit(exitCode), 10);
}

module.exports = function(servers) {
  let waitingForExit = false;

  const closeGracefully = (signal) => {
    if (waitingForExit) return;
    logger.info(`Gracefully shutting down from ${signal}...`);


    let dbPromise = Promise.resolve();
    if (servers.knex) {
      dbPromise = servers.knex.destroy().then(() => logger.info('Database Closed'));
    }

    let httpPromise = Promise.resolve();
    if (servers.http) {
      httpPromise = Promise.promisify(servers.http.close);
    }

    let amqPromise = Promise.resolve();
    if (server.amq) {
      amqPromise = Promise.promisify(server.amq.close);
    }

    Promise.all([dbPromise, httpPromise, amqPromise])
    .then(() => {
      exitProcess(signal);
    })
    .catch((e) => {
      logger.error(e);
      exitProcess(signal);
    });
  };

  if (servers.knex) {
    let failureCount = 0;
    function checkDb() {
      return servers.knex.raw('SELECT 1')
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
        return closeGracefully('NODB');
      });
    }
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
}
