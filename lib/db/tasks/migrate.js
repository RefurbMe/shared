'use strict';

const dbLoader = require('../');
const config = require('../config');
const utils = require('../utils');

const database = process.env.DB_NAME || global.DB_NAME;
if (!database) utils.throwError('Missing env variable: DB_NAME');

dbLoader.init(config.pgUrl, database);
const db = dbLoader.getKnexObject();

utils.checkIfDatabaseExists(db, database)
.then((exists) => {
  if (!exists) utils.throwError(`${database} doesn't exists`);
  return db.migrate.latest()
  .then(() => {
    utils.info(`${database} successfully migrated!`);
    return db.destroy();
  });
})
.catch((e) => {
  utils.throwError(`Error while migrating ${database}: ${e.message}`);
})
.then(() => {
  utils.exitProcess(0);
});
