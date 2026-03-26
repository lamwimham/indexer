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
 * 应用程序主入口
 */
async function main() {
  // 加载配置
  const config = loadConfig();

  // 创建日志器
  const logger = createLogger(config.server.logLevel, 'indexer');

  logger.info(
    {
      port: config.server.port,
      chainId: config.chains[0].id,
      contracts: config.contracts.length,
    },
    'Starting Web3 Indexer'
  );

  // 初始化数据库
  const db = getDb(logger);

  // 初始化仓库
  const syncStateRepo = new SyncStateRepository(db);
  const eventRepo = new EventRepository(db);
  const transferRepo = new TransferEventRepository(db);

  // 初始化 ERC20 事件处理器
  const erc20Processor = new ERC20EventProcessor(db, logger);

  // 创建同步器并配置事件处理器
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

  // 启动 REST API 服务器
  const fastify = await startApiServer({
    port: config.server.port,
    logger,
    synchronizer,
    eventRepo,
    transferRepo,
    syncStateRepo,
  });

  // 设置 GraphQL 端点
  const apolloServer = createGraphQLServer(db, logger, synchronizer);

  // 启动 Apollo 服务器
  await apolloServer.start();

  // 动态导入 HeaderMap
  const { HeaderMap } = await import('@apollo/server');

  // 将 GraphQL 中间件应用到 Fastify
  fastify.post('/graphql', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = createGraphQLContext(db, logger, synchronizer);

    const body = request.body as Record<string, unknown>;

    // 将请求头转换为 Apollo 的 HeaderMap
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
      // 处理分块响应
      let response = '';
      for await (const chunk of result.body.asyncIterator) {
        response += chunk;
      }
      return response;
    }
  });

  // GraphQL Playground（仅开发环境）
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

  // 所有路由添加完成后启动服务器
  await fastify.listen({ port: config.server.port, host: '0.0.0.0' });
  logger.info({ port: config.server.port }, 'REST API server started');

  // 优雅关闭
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

  // 启动同步器
  logger.info('Starting synchronizer...');
  await synchronizer.start();
}

// 运行主函数
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});