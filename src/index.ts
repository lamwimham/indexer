import 'dotenv/config';
import { loadConfig } from './config/index.js';
import { createLogger } from './utils/logger.js';
import { getDb, disconnectDb, SyncStateRepository, EventRepository, TransferEventRepository } from './storage/index.js';
import { Synchronizer } from './sync/index.js';
import { ERC20EventProcessor } from './processor/index.js';
import { startApiServer } from './api/index.js';
import { createGraphQLServer, createGraphQLContext } from './api/graphql/index.js';
import type { Address } from 'viem';
import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Main application entry point
 */
async function main() {
  // Load configuration
  const config = loadConfig();

  // Create logger
  const logger = createLogger(config.server.logLevel, 'indexer');

  logger.info(
    {
      port: config.server.port,
      chainId: config.chains[0].id,
      contracts: config.contracts.length,
    },
    'Starting Web3 Indexer'
  );

  // Initialize database
  const db = getDb(logger);

  // Initialize repositories
  const syncStateRepo = new SyncStateRepository(db);
  const eventRepo = new EventRepository(db);
  const transferRepo = new TransferEventRepository(db);

  // Initialize ERC20 event processor
  const erc20Processor = new ERC20EventProcessor(db, logger);

  // Create synchronizer with event processor
  const synchronizer = new Synchronizer(
    config,
    db,
    logger,
    async ({ chainId, contractAddress, contractName, blockNumber, blockTimestamp, logs, db, logger }) => {
      const dbContext = { db, logger };

      for (const log of logs) {
        await erc20Processor.processLog(
          {
            address: log.address,
            topics: log.topics,
            data: log.data,
            transactionHash: log.transactionHash,
            transactionIndex: log.transactionIndex,
            logIndex: log.logIndex,
          },
          {
            chainId,
            contractAddress: contractAddress as Address,
            contractName,
            blockNumber,
            blockTimestamp,
          },
          dbContext
        );
      }
    }
  );

  // Start REST API server
  const fastify = await startApiServer({
    port: config.server.port,
    logger,
    synchronizer,
    eventRepo,
    transferRepo,
    syncStateRepo,
  });

  // Setup GraphQL endpoint
  const apolloServer = createGraphQLServer(db, logger, synchronizer);

  // Start Apollo Server
  await apolloServer.start();

  // Import HeaderMap dynamically
  const { HeaderMap } = await import('@apollo/server');

  // Apply GraphQL middleware to Fastify
  fastify.post('/graphql', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = createGraphQLContext(db, logger, synchronizer);

    const body = request.body as Record<string, unknown>;
    
    // Convert headers to HeaderMap for Apollo
    const headersMap = new HeaderMap();
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') {
        headersMap.set(key, value);
      } else if (Array.isArray(value)) {
        headersMap.set(key, value[0]);
      }
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await apolloServer.executeHTTPGraphQLRequest({
      httpGraphQLRequest: {
        method: request.method,
        headers: headersMap as any,
        body: body,
        search: '',
      },
      context: () => Promise.resolve(context),
    });

    if (result.headers) {
      for (const [key, value] of result.headers) {
        reply.header(key, value);
      }
    }

    reply.code(result.status || 200);

    if (result.body.kind === 'complete') {
      return result.body.string;
    } else {
      // Handle chunked responses
      let response = '';
      for await (const chunk of result.body.asyncIterator) {
        response += chunk;
      }
      return response;
    }
  });

  // GraphQL Playground (development only)
  if (config.server.nodeEnv === 'development') {
    fastify.get('/graphql', async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.type('text/html');
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>GraphQL Playground</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/graphql-playground-react/build/static/css/index.css" />
  <script src="https://cdn.jsdelivr.net/npm/graphql-playground-react/build/static/js/middleware.js"></script>
</head>
<body>
  <div id="root"></div>
  <script>
    window.addEventListener('load', function (event) {
      GraphQLPlayground.init(document.getElementById('root'), {
        endpoint: '/graphql'
      })
    })
  </script>
</body>
</html>
      `;
    });
  }

  // Now start the server after all routes are added
  await fastify.listen({ port: config.server.port, host: '0.0.0.0' });
  logger.info({ port: config.server.port }, 'REST API server started');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');

    synchronizer.stop();

    await fastify.close();
    await disconnectDb();

    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start synchronizer
  logger.info('Starting synchronizer...');
  await synchronizer.start();
}

// Run main
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});