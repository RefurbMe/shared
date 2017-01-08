'use strict'

const path = require('path');
const fs = require('fs');

function getPackageJson(rootDir) {
  const packageJSONPath = path.resolve(rootDir, './package.json');
  return require(packageJSONPath);
}

function preCheck(rootDir) {
  if (process.env.GCLOUD_STACKDRIVER_CREDENTIALS) throw new Error('Missing env variable: GCLOUD_STACKDRIVER_CREDENTIALS');
  if (process.env.GCLOUD_PROJECT) throw new Error('Missing env variable: GCLOUD_STACKDRIVER_CREDENTIALS');

  if (!fs.existsSync(rootDir)) throw new Error('Invalid root dir');

  const packageJSONPath = path.resolve(rootDir, './package.json');
  if (!fs.existsSync(packageJSONPath)) throw new Error('package.json not found');
}

function trace(rootDir, optionsOverrideRaw) {
  const optionsOverride = optionsOverrideRaw || {};
  preCheck(rootDir);
  try {
    const credentials = JSON.parse(new Buffer(process.env.GCLOUD_STACKDRIVER_CREDENTIALS, 'base64').toString());
    const options = { credentials };
    require('@google/cloud-trace').start(Object.assign({
      enhancedDatabaseReporting: true,
      ignoreUrls: [ /\/~*health/ ],
    }, options, optionsOverride));
  } catch (e) {
    throw new Error(`Error while loading gcloud/trace agent: ${e.message}`);
  }
}

function debug(rootDir, optionsOverrideRaw) {
  const optionsOverride = optionsOverrideRaw || {};
  if (process.env.GCLOUD_STACKDRIVER_CREDENTIALS && process.env.GCLOUD_PROJECT) {
    try {
      const packageJson = getPackageJson(rootDir);
      const credentials = JSON.parse(new Buffer(process.env.GCLOUD_STACKDRIVER_CREDENTIALS, 'base64').toString());
      const options = {
        credentials,
        workingDirectory: rootDir,
        appPathRelativeToRepository: rootDir,
        description: packageJson.description,
        serviceContext: {
          service: packageJson.name,
          version: packageJson.version,
        },
      };
      require('@google/cloud-debug').start(Object.assign(options, optionsOverride));
    } catch (e) {
      console.error(`Error while loading gcloud/debug agent: ${e.message}`);
    }
  }
}
