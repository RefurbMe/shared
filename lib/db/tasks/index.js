'use strict';

const createdb = require('./createdb');
const dropdb = require('./dropdb');
const migrate = require('./migrate');
const seed = require('./seed');

function run(action, database) {
  if (action === 'migrate') {
    return migrate(database);
  }

  if (action === 'createdb') {
    return createdb(database);
  }

  if (action === 'dropdb') {
    return dropdb(database);
  }

  if (action === 'seed') {
    return seed(database);
  }

  if (action === 'init') {
    return createdb(database)
    .then(() => migrate(database))
    .then(() => seed(database));
  }

  if (action === 'refresh') {
    return dropdb(database)
    .then(() => createdb(database))
    .then(() => migrate(database))
    .then(() => seed(database));
  }

  return Promise.reject(`${action} is not an action`);
}

module.exports = {
  run,
  createdb,
  dropdb,
  migrate,
  seed,
};
