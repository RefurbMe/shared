'use strict';

const co = require('co');
const Promise = require('bluebird');
const ping = require('ping');

const logger = require('./logger');
const utils = require('./utils');
const cacheStore = require('./cache');
const publisher = require('./publisher');

function exitProcess(signal) {
  logger.info(`Process killed from signal: ${signal}`);
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
        .then(() => logger.info('> Database Closed'));
        actions.push(prm);
      }

      if (httpServer) {
        const prm = new Promise((resolve, reject) => {
          httpServer.close((err) => {
            if (err) return reject(err);
            return resolve(true);
          });
        })
        .then(() => logger.info('> HTTP Server Closed'));
        actions.push(prm);
      }

      if (publisherObject) {
        const prm = new Promise((resolve, reject) => {
          publisherObject.close((err) => {
            if (err) return reject(err);
            return resolve(true);
          });
        })
        .then(() => logger.info('> Publisher Closed'));
        actions.push(prm);
      }

      if (coworkersApp) {
        const prm = coworkersApp.close()
        .then(() => logger.info('> Coworkers Closed'));
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
        logger.warn(`Error connecting to database - ${dbFailureCount} attempts - retying in ${waitCount / 1000}s...`);
        return Promise.delay(waitCount).then(() => checkDb());
      }
      logger.error(new Error('Error connecting to database'));
      closeGracefully('NODB');
      waitingForExit = true;
      return null;
    });
  };

  const pingHosts = (hostList) => {
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
      setTimeout(() => pingHosts(hostList), pingFrequency);
      return true;
    })
    .catch((err) => {
      if (pingFailureCount < pingFailureMax) {
        pingFailureCount += 1;
        const waitCount = 1000 * pingFailureCount;
        logger.warn(`Unable to ping ${err.message} - ${pingFailureCount} attempts - retying in ${waitCount / 1000}s...`);
        return Promise.delay(waitCount).then(() => pingHosts(hostList));
      }
      logger.error(new Error(`Error connecting to ${err.message}`));
      closeGracefully('NOHOST');
      waitingForExit = true;
      return null;
    });
  };

  chain.ping = (hostList, options) => {
    if (options && options.failureMax) pingFailureMax = options.failureMax;
    if (options && options.frequency) pingFrequency = options.frequency;
    promiseOrder.push('checkHosts');
    promises.checkHosts = () => {
      return pingHosts(utils.uniqueValues(hostList))
      .then(() => {
        logger.info('> All hosts are good');
      });
    };
    return chain;
  };

  chain.cache = (redisUrl) => {
    promises.cache = () => {
      return new Promise((resolve, reject) => {
        try {
          cacheStore.start(redisUrl);
          resolve(true);
        } catch (e) {
          reject(e);
        }
      })
      .then(() => {
        logger.info('> Cache Started');
      });
    };
    promiseOrder.push('cache');
    return chain;
  };

  chain.publisher = (amqUrl, publisherExchanges) => {
    publisherObject = publisher;
    promises.publisher = () => {
      return publisherObject.start(amqUrl, publisherExchanges)
      .then(() => {
        logger.info('> Publisher Started');
      });
    };
    promiseOrder.push('publisher');
    return chain;
  };

  chain.coworkers = (amqUrl, _coworkersApp) => {
    coworkersApp = _coworkersApp;
    promises.coworkers = () => {
      return coworkersApp.start(amqUrl)
      .then(() => {
        logger.info('> Coworkers Started');
      });
    };
    promiseOrder.push('coworkers');
    return chain;
  };

  chain.express = (expressApp, port) => {
    promises.express = () => {
      return new Promise((resolve, reject) => {
        httpServer = expressApp.listen(port, (err) => {
          if (err) return reject(err);
          return resolve(true);
        });
      })
      .then(() => {
        logger.info(`> HTTP server Started: ${port}`);
      });
    };
    promiseOrder.push('express');
    return chain;
  };

  chain.knex = (_knexObject, options) => {
    if (options && options.failureMax) dbFailureMax = options.failureMax;
    if (options && options.frequency) dbFrequency = options.frequency;
    knexObject = _knexObject;
    promises.knex = checkDb;
    promiseOrder.push('knex');
    return chain;
  };

  chain.then = (prm) => {
    const promiseName = `custom${countCustom}`;
    promises[promiseName] = prm;
    promiseOrder.push(promiseName);
    countCustom += 1;
    return chain;
  };

  chain.done = (message) => {
    logger.info('Starting services...');
    return utils.seqPromise(promiseOrder, (promiseName) => {
      if (promises[promiseName]) return promises[promiseName]();
      return Promise.resolve();
    })
    .then(() => {
      logger.info(message || 'Ready to rock! 🍺');
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
