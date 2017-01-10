'use strict';

const co = require('co');
const Promise = require('bluebird');
const ping = require('ping');

const logger = require('./logger');
const utils = require('./utils');
const cacheStore = require('./cache');
const publisher = require('./publisher');

function exitProcess(signal) {
  const exitCode = (/^SIG/.exec(signal)) ? 0 : 1;
  setTimeout(() => process.exit(exitCode), 10);
}

function serviceLoader() {
  const chain = {};

  const promiseOrder = [];
  const promises = {};

  let countCustom = 1;
  let waitingForExit = false;
  let dbFailureCount = 0;
  let dbFailureMax = 5;
  let dbFrequency = 20000;
  let pingFailureCount = 0;
  let pingFailureMax = 5;
  let pingFrequency = 30000;

  let knexObject;
  let publisherObject;
  let httpServer;
  let coworkersApp;

  const closeGracefully = (signal) => {
    if (waitingForExit) return;
    logger.info(`Gracefully shutting down from ${signal}...`);

    co(function* () {
      const actions = [];

      if (knexObject) {
        const prm = knexObject.destroy()
        .then(() => logger.info('Database Closed'));
        actions.push(prm);
      }

      if (httpServer) {
        const prm = new Promise((resolve, reject) => {
          httpServer.close((err) => {
            if (err) return reject(err);
            return resolve(true);
          });
        })
        .then(() => logger.info('HTTP Server Closed'));
        actions.push(prm);
      }

      if (publisherObject) {
        const prm = new Promise((resolve, reject) => {
          publisherObject.close((err) => {
            if (err) return reject(err);
            return resolve(true);
          });
        })
        .then(() => logger.info('Publisher Closed'));
        actions.push(prm);
      }

      if (coworkersApp) {
        const prm = coworkersApp.close()
        .then(() => logger.info('Coworkers Closed'));
        actions.push(prm);
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

  const checkDb = () => {
    if (!knexObject) throw new Error('knexObject not defined');
    return knexObject.raw('SELECT 1')
    .then(() => {
      dbFailureCount = 0;
      setTimeout(checkDb, dbFrequency);
      return true;
    })
    .catch((err) => {
      if (dbFailureCount < dbFailureMax) {
        dbFailureCount += 1;
        const waitCount = 1000 * dbFailureCount;
        logger.error(`Error connecting to databse - ${dbFailureCount} attempts - retying in ${waitCount / 1000}s...`);
        return Promise.delay(waitCount).then(() => checkDb());
      }
      logger.error(err);
      closeGracefully('NODB');
      waitingForExit = true;
      return null;
    });
  };

  const pingHosts = (hostList, options) => {
    if (options.failureMax) dbFailureMax = options.failureMax;
    if (options.frequency) dbFrequency = options.frequency;
    return Promise.all(hostList.map((host) => {
      return new Promise((resolve, reject) => {
        logger.debug(`ping ${host}`);
        ping.sys.probe(host, (isAlive) => {
          if (!isAlive) return reject(new Error(host));
          return resolve(host);
        });
      });
    }))
    .then(() => {
      pingFailureCount = 0;
      setTimeout(() => pingHosts, pingFrequency);
      return true;
    })
    .catch((err) => {
      if (pingFailureCount < pingFailureMax) {
        pingFailureCount += 1;
        const waitCount = 1000 * pingFailureCount;
        logger.error(`Unable to ping ${err.message} - ${pingFailureCount} attempts - retying in ${waitCount / 1000}s...`);
        return Promise.delay(waitCount).then(() => pingHosts(hostList));
      }
      logger.error(err);
      closeGracefully('NOHOST');
      waitingForExit = true;
      return null;
    });
  };

  chain.ping = (hostList, options) => {
    if (options.failureMax) pingFailureMax = options.failureMax;
    if (options.frequency) pingFrequency = options.frequency;
    promiseOrder.push('checkHosts');
    promises.checkHosts = pingHosts(hostList)
    .then(() => {
      logger.info('All hosts are good');
    });
    return chain;
  };

  chain.cache = (redisUrl) => {
    promises.cache = new Promise((resolve, reject) => {
      try {
        cacheStore.start(redisUrl);
        resolve(true);
      } catch (e) {
        reject(e);
      }
    })
    .then(() => {
      logger.info('Cache Started');
    });
    promiseOrder.push('cache');
    return chain;
  };

  chain.publisher = (amqUrl, publisherExchanges) => {
    publisherObject = publisher;
    promises.publisher = publisherObject.start(amqUrl, publisherExchanges)
    .then(() => {
      logger.info('Publisher Started');
    });
    promiseOrder.push('publisher');
    return chain;
  };

  chain.coworkers = (amqUrl, _coworkersApp) => {
    coworkersApp = _coworkersApp;
    promises.coworkers = coworkersApp.start(amqUrl)
    .then(() => {
      logger.info('Coworkers Started');
    });
    promiseOrder.push('coworkers');
    return chain;
  };

  chain.express = (expressApp, port) => {
    promises.express = new Promise((resolve, reject) => {
      httpServer = expressApp.listen(port, (err) => {
        if (err) return reject(err);
        return resolve(true);
      });
    })
    .then(() => {
      logger.info(`HTTP server Started: ${port}`);
    });
    promiseOrder.push('express');
    return chain;
  };

  chain.knex = (_knexObject) => {
    knexObject = _knexObject;
    promises.knex = checkDb();
    promiseOrder.push('knex');
    return chain;
  };

  chain.then = (prm) => {
    const promiseName = `custom${countCustom}`;
    promises[promiseName] = prm();
    promiseOrder.push(promiseName);
    countCustom += 1;
    return chain;
  };

  chain.done = (message) => {
    return utils.seqPromise(promiseOrder, (promiseName) => {
      if (promises[promiseName]) return promises[promiseName];
      return Promise.resolve();
    })
    .then(() => {
      logger.info(message || 'Ready to rock!');
    })
    .catch((e) => {
      logger.error(e);
      exitProcess('START');
      waitingForExit = true;
    });
  };

  ['SIGINT', 'SIGTERM', 'SIGQUIT', 'uncaughtException', 'unhandledRejection']
  .forEach((signal) => {
    process.on(signal, (err) => {
      if (err) logger.error(err);
      closeGracefully(signal);
      waitingForExit = true;
    });
  });

  return chain;
}

module.exports = serviceLoader;
