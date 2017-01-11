'use strict';

const amqplib = require('amqplib');

const logger = require('./logger');

let channel;
let connection;
let retryCount = 0;

function start(amqUrl, exchanges) {
  if (channel) return Promise.resolve(channel);
  return amqplib.connect(amqUrl)
  .then((conn) => {
    connection = conn;
    return conn.createChannel();
  })
  .then((ch) => {
    channel = ch;
    return Promise.all(exchanges.map((exchange) => {
      return channel.assertExchange(exchange, 'direct');
    }));
  })
  .catch((err) => {
    if (retryCount < 6) {
      connection = null;
      channel = null;
      retryCount += 1;
      logger.error(`Error connecting to AMQ - ${retryCount} attempt`);
      return setTimeout(start, retryCount * 1000);
    }
    logger.error(err);
    return process.exit(1);
  });
}

function publish(toPublish, exchangeName) {
  if (!channel) throw new Error('Not connected to AMQ');
  const preview = JSON.stringify(toPublish).substr(0, 100);
  logger.info(`-> ${exchangeName}: ${preview}...`);
  channel.publish(exchangeName, 'direct', new Buffer(JSON.stringify(toPublish)), {});
}

function close() {
  if (!channel) return Promise.resolve(true);

  try {
    return channel.close()
    .then(() => {
      if (!connection) return Promise.resolve(true);
      return connection.close(connection);
    });
  } catch (e) {
    logger.warn('> Publisher already closed');
    return Promise.resolve(true);
  }
}

module.exports = {
  start,
  close,
  publish,
};
