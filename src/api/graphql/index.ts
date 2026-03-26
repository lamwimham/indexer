import { ApolloServer } from '@apollo/server';
import type { Logger } from 'pino';
import type { PrismaClient } from '@prisma/client';
import type { Synchronizer } from '../../sync/index.js';
import {
  EventRepository,
  TransferEventRepository,
  SyncStateRepository,
} from '../../storage/index.js';
import { typeDefs } from './schema.js';
import { resolvers, type GraphQLContext } from './resolvers.js';

// 为方便使用而重新导出
export { typeDefs, resolvers, GraphQLContext };

/**
 * 创建 Apollo Server 实例
 */
export function createGraphQLServer(
  _db: PrismaClient,
  _logger: Logger,
  _synchronizer: Synchronizer
): ApolloServer<GraphQLContext> {
  const server = new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers,
    introspection: true,
  });

  return server;
}

/**
 * 为 GraphQL 解析器创建上下文
 */
export function createGraphQLContext(
  db: PrismaClient,
  logger: Logger,
  synchronizer: Synchronizer
): GraphQLContext {
  return {
    db,
    logger,
    synchronizer,
    eventRepo: new EventRepository(db),
    transferRepo: new TransferEventRepository(db),
    syncStateRepo: new SyncStateRepository(db),
  };
}