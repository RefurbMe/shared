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
.knex(knexObject)
.express(expressApp, config.httpPort)
.done();
```

### Available functions chains:

- *ping(hostList, options)*: Check if hostnames are alive
  - `hostList` (array of hostnames to ping)
  - `options.failureMax` (integer, how many attempts should we try before we exit the process, default: 5)
  - `options.frequency` (integer, how many milliseconds should wait before checking again hostnames, default: 30000)
- *knex(knexObject, options)*: Check if database is alive, and destroy knex on exit
  - `knexObject` (object: http://knexjs.org/#Installation-node)
  - `options.failureMax` (integer, how many attempts should we try before we exit the process, default: 5)
  - `options.frequency` (integer, how many milliseconds should wait before checking again the database, default: 30000)
- *cache(redisUrl)*: Start cache for `@refurbme/shared/lib/cache`
  - `redisUrl` (string, redis url)
- *publisher(amqUrl, publisherExchanges)*: Connect to RabbitMQ and assert exchanges for `@refurbme/shared/lib/publisher`, and close it when exit
  - `amqUrl` (string, amq url)
  - `publisherExchanges` (array, list of exchanges to assert)
- *coworkers(amqUrl, coworkersApp)*: Connect to RabbitMQ using coworkers, and close it when exit
  - `amqUrl` (string, amq url)
  - `coworkersApp` (object, https://github.com/tjmehta/coworkers)
- *express(expressApp, port)*: Start express HTTP server, and close it when exit
  - `expressApp` (object, https://github.com/expressjs/express)
  - `port` (integer, HTTP port)
- *then(customPromise)*: Run a custom process on the process
  - `customPromise` (function that returns a Promise)
- *done()*: Add this at the end of the chain to start the service.


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
- requestLogger
- errorLogger
- gcloudErrorsMiddleWare
- error
- warn
- info
- log
- verbose
- debug
- silly
