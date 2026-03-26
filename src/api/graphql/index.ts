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

// Re-export for convenience
export { typeDefs, resolvers, GraphQLContext };

/**
 * Create Apollo Server instance
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
 * Create context for GraphQL resolvers
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