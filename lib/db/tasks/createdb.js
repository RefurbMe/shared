'use strict';

const dbLoader = require('../');
const config = require('../config');
const utils = require('../utils');

const database = process.env.DB_NAME || global.DB_NAME;
if (!database) utils.throwError('Missing env variable: DB_NAME');

dbLoader.init(config.pgUrl, 'postgres');
const db = dbLoader.getKnexObject();

utils.checkIfDatabaseExists(db, database)
.then((exists) => {
  if (exists) utils.throwError(`${database} already exists`);
  return db.raw(`CREATE DATABASE ${database};`)
  .then(() => {
    utils.info(`${database} successfully created!`);
    return db.destroy();
  });
})
.catch((e) => {
  utils.throwError(`Error while creating ${database}: ${e.message}`);
})
.then(() => {
  utils.exitProcess(0);
});
