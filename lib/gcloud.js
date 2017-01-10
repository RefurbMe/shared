'use strict';

/* eslint global-require: 0 */
/* eslint no-console: 0 */

const path = require('path');
const fs = require('fs');

let rootDir;
let credentials;
let pkg;
let errors;

function init(options) {
  // rootDir
  if (!options.rootDir) throw new Error('Missing rootDir');
  if (options.credentials) {
    credentials = options.credentials;
  } else {
    if (!process.env.GCLOUD_STACKDRIVER_CREDENTIALS) throw new Error('Missing env variable: GCLOUD_STACKDRIVER_CREDENTIALS');
    credentials = JSON.parse(new Buffer(process.env.GCLOUD_STACKDRIVER_CREDENTIALS, 'base64').toString());
  }
  if (!process.env.GCLOUD_PROJECT) throw new Error('Missing env variable: GCLOUD_PROJECT');

  // package.json
  if (!fs.existsSync(options.rootDir)) throw new Error('Invalid root dir');
  const packageJSONPath = path.resolve(options.rootDir, './package.json');
  if (!fs.existsSync(packageJSONPath)) throw new Error('package.json not found');
  pkg = require(packageJSONPath); // eslint-disable-line
  rootDir = options.rootDir;

  if (options.trace) {
    initTrace(options.trace);
  }
  if (options.debug) {
    initDebug(options.debug);
  }
  if (options.error) {
    errors = initError(options.error);
  }
}

function initTrace(optionsOverrideRaw) {
  const optionsOverride = optionsOverrideRaw || {};
  try {
    const options = Object.assign({
      enabled: true,
      logLevel: 1,
      enhancedDatabaseReporting: true,
      ignoreUrls: [/\/~*health/, /favicon.ico/, /robots\.txt/],
      credentials,
    }, optionsOverride);
    return require('@google/cloud-trace').start(options);
  } catch (e) {
    console.error(`Error while loading gcloud/trace agent: ${e.message}`);
    return {};
  }
}

function initDebug(optionsOverrideRaw) {
  const optionsOverride = optionsOverrideRaw || {};
  try {
    const options = Object.assign({
      enabled: true,
      logLevel: 1,
      credentials,
      workingDirectory: rootDir,
      appPathRelativeToRepository: rootDir,
      description: pkg.description,
      serviceContext: {
        service: pkg.name,
        version: pkg.version,
      },
    }, optionsOverride);
    return require('@google/cloud-debug').start(options);
  } catch (e) {
    console.error(`Error while loading gcloud/debug agent: ${e.message}`);
    return {};
  }
}

function initError(optionsOverrideRaw) {
  const optionsOverride = optionsOverrideRaw || {};
  try {
    const options = Object.assign({
      enabled: true,
      logLevel: 1,
      ignoreEnvironmentCheck: true,
      credentials,
      serviceContext: {
        service: pkg.name,
        version: pkg.version,
      },
    }, optionsOverride);
    return require('@google/cloud-errors').start(options);
  } catch (e) {
    console.error(`Error while loading gcloud/error agent: ${e.message}`);
    return {};
  }
}

function expressMiddleWare() {
  if (errors) return errors.express;
  return null;
}

function reportError(e) {
  if (errors) errors.report(e);
}

module.exports = {
  init,
  reportError,
  expressMiddleWare,
};
