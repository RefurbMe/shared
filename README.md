# RefurbMe Shared utils

Set of modules designed for Microservice architecture.

We recommend to fork this, instead of importing this module (it's subject to change anytime)




## @refurbme/shared/lib/service_loader

Start all services (sequentially) with graceful exit handler.

### Full Example:

```js
const serviceLoader = require('@refurbme/shared/lib/service_loader');

return serviceLoader()
.ping([
  config.apiUrlHost,
  config.redisHost,
  config.amqpHost,
])
.cache(config.redisUrl)
.publisher(config.amqUrl, ['exchange-name1', 'exchange-name1'])
.then(() => {
  /* Some logic here */
  return Promise.resolve(true);
})
.db({
  pgUrl: config.pgUrl,
  pgDatabase: config.pgDatabase,
})
.express(() => require('./express_app.js'), config.httpPort)
.done();
```

### Available functions chains:

- *ping(hostList, [options])*: Check if hostnames are alive
  - `hostList` (array of host to ping) host format: `hostname:port`
  - `options.failureMax` (integer, how many attempts should we try before we exit the process, default: 5)
  - `options.frequency` (integer, how many milliseconds should wait before checking again hostnames, default: 30000)
- *db([options])*: Initiate database, checks if database is alive and destroy knex on exit
  - `options.pgUrl` (string, postgres url, default: set in `./lib/db/config.js`)
  - `options.pgDatabase` (string, database to query, default: postgres)
  - `options.failureMax` (integer, how many attempts should we try before we exit the process, default: 5)
  - `options.frequency` (integer, how many milliseconds should wait before checking again the database, default: 30000)
- *cache(redisUrl)*: Start cache for `@refurbme/shared/lib/cache`
  - `redisUrl` (string, redis url)
- *publisher(amqUrl, publisherExchanges)*: Connect to RabbitMQ and assert exchanges for `@refurbme/shared/lib/publisher`, and close it when exit
  - `amqUrl` (string, amq url)
  - `publisherExchanges` (array, list of exchanges to assert)
- *coworkers(amqUrl, coworkersApp)*: Connect to RabbitMQ using coworkers, and close it when exit
  - `amqUrl` (string, amq url)
  - `coworkersApp` (function that returns coworkers app, https://github.com/tjmehta/coworkers)
- *express(expressApp, port)*: Start express HTTP server, and close it when exit
  - `expressApp` (function that returns express app, https://github.com/expressjs/express) - We advice you to use the require inside this function.
  - `port` (integer, HTTP port)
- *then(customPromise)*: Run a custom process on the process
  - `customPromise` (function that returns a Promise)
- *done([callback])*: Add this at the end of the chain to start the service. it can take a callback function as parameter that executes when everything is loaded.




## @refurbme/shared/lib/gcloud

Monitoring using Google Stackdriver: Debug, Trace, Errors.

### Full Example:

```js
const gcloud = require('@refurbme/shared/lib/gcloud');

gcloud.init({
  rootDir: process.cwd(),
  trace: {
    enabled: true,
    ignoreUrls: [/^\/assets/, /\/~*health/],
  },
  debug: {
    enabled: true,
  },
  error: {
    enabled: true,
  },
});
```

### Available methods:

- *init(options)*: Initiate gcloud (see options below)
- *reportError()*: Report an error to gcloud-errors, error must be an Error object
- *expressMiddleWare()*: gcloud-errors express middleware
- *startSpan()*: gcloud-trace startSpan (see [trace](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/) documentation)
- *endSpan()*: gcloud-trace endSpan (see [trace](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/) documentation)
- *runInSpan()*: gcloud-trace runInSpan (see [trace](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/) documentation)
- *runInRootSpan()*: gcloud-trace runInRootSpan (see [trace](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/) documentation)

### Available options:

- *rootDir*: string (required), root directory of the project
- *credentials*: object (optional), gcloud credentials (default: base64decode(GCLOUD_STACKDRIVER_CREDENTIALS))
- *trace*: object, options to override: https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/
- *debug*: object, options to override: https://github.com/GoogleCloudPlatform/cloud-debug-nodejs/
- *error*: object, options to override: https://github.com/GoogleCloudPlatform/cloud-errors-nodejs/

### Required environment variables:

- *GCLOUD_STACKDRIVER_CREDENTIALS*: string, base64 of the gcloud json key
- *GCLOUD_PROJECT*: gcloud project name




## @refurbme/shared/lib/logger

Log data on the console (using winston), and report errors to gcloud/error if enabled

### Full Example:

```js
const logger = require('@refurbme/shared/lib/logger');

logger.debug('bonjour');
logger.info('hello');
logger.error(new Error('Something broke'));

// You can use middlewares for express

// Request logs
app.use(logger.requestLogger);

// Error logs
if (logger.gcloudErrorsMiddleWare) {
  app.use(logger.gcloudErrorsMiddleWare);
}
app.use(logger.errorLogger);
```

### Exported methods:
- requestLogger: Express middleware to log requests
- errorLogger: Express middleware to log errors
- gcloudErrorsMiddleWare: Express middleware to report express errors to gcloud
- error
- warn
- info
- log
- verbose
- debug
- silly




## @refurbme/shared/lib/db

Connect to a Postgres database using [knex](http://knexjs.org/).

Check section `@refurbme/shared/lib/service_loader` for details to initiate the database

### Full Example:

```js
const serviceLoader = require('@refurbme/shared/lib/service_loader');
const dbLoader = require('@refurbme/shared/lib/db');

serviceLoader()
.db({
  pgUrl: 'postgres://root:@localhost',
  pgDatabase: 'postgres',
})
.done(() => {
  db.raw('SELECT 1;')
  .then((data) => {
    const db = dbLoader.getKnexObject();
    console.log(data);
  });
});

```

### Available methods:

- *init(pgUrl, pgDatabase)*: Initiate database
- *getKnexObject()*: get knex object

### Available tasks

- Create database: `DB_NAME=demo node ./lib/db/tasks/createdb.js`
- Drop database: `DB_NAME=demo node ./lib/db/tasks/dropdb.js`
- Migrate: `DB_NAME=demo node ./lib/db/tasks/migrate.js`

### Used environment variables

- POSTGRES_PORT_5432_TCP_ADDR: Postgres hostname
- POSTGRES_PORT_5432_TCP_PORT: Postgres port
- POSTGRES_ENV_POSTGRES_USER: Postgres username
- POSTGRES_ENV_POSTGRES_PASSWORD: Postgres password
- DB_NAME: Postgres database
