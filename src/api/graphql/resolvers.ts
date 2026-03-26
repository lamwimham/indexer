import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type { Synchronizer } from '../../sync/index.js';
import {
  EventRepository,
  TransferEventRepository,
  SyncStateRepository,
} from '../../storage/index.js';

/**
 * Context passed to resolvers
 */
export interface GraphQLContext {
  db: PrismaClient;
  logger: Logger;
  synchronizer: Synchronizer;
  eventRepo: EventRepository;
  transferRepo: TransferEventRepository;
  syncStateRepo: SyncStateRepository;
}

/**
 * GraphQL Resolvers
 */
export const resolvers = {
  // ============================================
  // Scalar Resolvers
  // ============================================

  DateTime: {
    __serialize: (value: Date) => value.toISOString(),
    __parseValue: (value: string) => new Date(value),
    __parseLiteral: (ast: { value: string }) => new Date(ast.value),
  },

  JSON: {
    __serialize: (value: unknown) => value,
    __parseValue: (value: unknown) => value,
    __parseLiteral: (ast: { value: unknown }) => ast.value,
  },

  // ============================================
  // Query Resolvers
  // ============================================

  Query: {
    syncStatus: async (_: unknown, __: unknown, context: GraphQLContext) => {
      const status = await context.synchronizer.getSyncStatus();
      return status.map((s) => ({
        chainId: s.chainId,
        contractAddress: s.contractAddress,
        contractName: s.contractName,
        lastSyncedBlock: s.lastSyncedBlock.toString(),
        isSyncing: s.isSyncing,
        latestBlock: s.latestBlock.toString(),
        blocksBehind: s.blocksBehind.toString(),
      }));
    },

    syncMetrics: async (_: unknown, __: unknown, context: GraphQLContext) => {
      const metrics = context.synchronizer.getMetrics();
      return metrics.map((m) => ({
        chainId: m.chainId,
        contractAddress: m.contractAddress,
        currentBlock: m.currentBlock.toString(),
        latestBlock: m.latestBlock.toString(),
        blocksBehind: m.blocksBehind.toString(),
        eventsProcessed: m.eventsProcessed,
        errors: m.errors,
        lastSyncTime: m.lastSyncTime.toISOString(),
      }));
    },

    syncStates: async (_: unknown, __: unknown, context: GraphQLContext) => {
      return context.syncStateRepo.getAll();
    },

    contract: async (
      _: unknown,
      args: { chainId: number; address: string },
      context: GraphQLContext
    ) => {
      const syncState = await context.syncStateRepo.get(
        args.chainId,
        args.address as `0x${string}`
      );

      if (!syncState) {
        return null;
      }

      return {
        address: syncState.contractAddress,
        name: syncState.contractName,
        chainId: syncState.chainId,
        syncState,
      };
    },

    contracts: async (
      _: unknown,
      args: { chainId?: number },
      context: GraphQLContext
    ) => {
      const states = await context.syncStateRepo.getAll();
      const filtered = args.chainId
        ? states.filter((s) => s.chainId === args.chainId)
        : states;

      return filtered.map((s) => ({
        address: s.contractAddress,
        name: s.contractName,
        chainId: s.chainId,
        syncState: s,
      }));
    },

    events: async (
      _: unknown,
      args: {
        filter?: {
          chainId?: number;
          contractAddress?: string;
          eventName?: string;
          fromBlock?: string;
          toBlock?: string;
        };
        limit?: number;
        offset?: number;
        orderBy?: 'blockNumber' | 'blockTimestamp';
        orderDirection?: 'asc' | 'desc';
      },
      context: GraphQLContext
    ) => {
      const events = await context.eventRepo.query({
        chainId: args.filter?.chainId,
        contractAddress: args.filter?.contractAddress as `0x${string}`,
        eventName: args.filter?.eventName,
        fromBlock: args.filter?.fromBlock ? BigInt(args.filter.fromBlock) : undefined,
        toBlock: args.filter?.toBlock ? BigInt(args.filter.toBlock) : undefined,
        limit: args.limit ?? 100,
        offset: args.offset ?? 0,
        orderBy: args.orderBy ?? 'blockNumber',
        orderDirection: args.orderDirection ?? 'desc',
      });

      return events.map((e) => ({
        ...e,
        args: JSON.parse(e.args),
      }));
    },

    eventCount: async (
      _: unknown,
      args: {
        filter?: {
          chainId?: number;
          contractAddress?: string;
          eventName?: string;
        };
      },
      context: GraphQLContext
    ) => {
      return context.eventRepo.count({
        chainId: args.filter?.chainId,
        contractAddress: args.filter?.contractAddress as `0x${string}`,
        eventName: args.filter?.eventName,
      });
    },

    transfers: async (
      _: unknown,
      args: {
        filter?: {
          chainId?: number;
          contractAddress?: string;
          from?: string;
          to?: string;
          fromBlock?: string;
          toBlock?: string;
        };
        limit?: number;
        offset?: number;
        orderBy?: 'blockNumber' | 'blockTimestamp';
        orderDirection?: 'asc' | 'desc';
      },
      context: GraphQLContext
    ) => {
      const transfers = await context.transferRepo.query({
        chainId: args.filter?.chainId,
        contractAddress: args.filter?.contractAddress as `0x${string}`,
        from: args.filter?.from as `0x${string}`,
        to: args.filter?.to as `0x${string}`,
        fromBlock: args.filter?.fromBlock ? BigInt(args.filter.fromBlock) : undefined,
        toBlock: args.filter?.toBlock ? BigInt(args.filter.toBlock) : undefined,
        limit: args.limit ?? 100,
        offset: args.offset ?? 0,
        orderBy: args.orderBy ?? 'blockNumber',
        orderDirection: args.orderDirection ?? 'desc',
      });

      return transfers.map((t) => ({
        ...t,
        // blockNumber and value are already strings from database
      }));
    },

    transferCount: async (
      _: unknown,
      args: {
        filter?: {
          chainId?: number;
          contractAddress?: string;
          from?: string;
          to?: string;
        };
      },
      context: GraphQLContext
    ) => {
      return context.transferRepo.count({
        chainId: args.filter?.chainId,
        contractAddress: args.filter?.contractAddress as `0x${string}`,
        from: args.filter?.from as `0x${string}`,
        to: args.filter?.to as `0x${string}`,
      });
    },

    address: async (
      _: unknown,
      args: { chainId: number; address: string },
      _context: GraphQLContext
    ) => {
      return {
        address: args.address,
        chainId: args.chainId,
      };
    },
  },

  // ============================================
  // Type Resolvers
  // ============================================

  Contract: {
    syncState: async (parent: { chainId: number; address: string }, _: unknown, context: GraphQLContext) => {
      return context.syncStateRepo.get(parent.chainId, parent.address as `0x${string}`);
    },

    events: async (
      parent: { chainId: number; address: string },
      args: {
        eventName?: string;
        fromBlock?: string;
        toBlock?: string;
        limit?: number;
        offset?: number;
        orderBy?: 'blockNumber' | 'blockTimestamp';
        orderDirection?: 'asc' | 'desc';
      },
      context: GraphQLContext
    ) => {
      const events = await context.eventRepo.query({
        chainId: parent.chainId,
        contractAddress: parent.address as `0x${string}`,
        eventName: args.eventName,
        fromBlock: args.fromBlock ? BigInt(args.fromBlock) : undefined,
        toBlock: args.toBlock ? BigInt(args.toBlock) : undefined,
        limit: args.limit ?? 100,
        offset: args.offset ?? 0,
        orderBy: args.orderBy ?? 'blockNumber',
        orderDirection: args.orderDirection ?? 'desc',
      });

      return events.map((e) => ({
        ...e,
        args: JSON.parse(e.args),
      }));
    },

    transfers: async (
      parent: { chainId: number; address: string },
      args: {
        from?: string;
        to?: string;
        fromBlock?: string;
        toBlock?: string;
        limit?: number;
        offset?: number;
      },
      context: GraphQLContext
    ) => {
      const transfers = await context.transferRepo.query({
        chainId: parent.chainId,
        contractAddress: parent.address as `0x${string}`,
        from: args.from as `0x${string}`,
        to: args.to as `0x${string}`,
        fromBlock: args.fromBlock ? BigInt(args.fromBlock) : undefined,
        toBlock: args.toBlock ? BigInt(args.toBlock) : undefined,
        limit: args.limit ?? 100,
        offset: args.offset ?? 0,
      });

      return transfers.map((t) => ({
        ...t,
        // blockNumber and value are already strings from database
      }));
    },

    approvals: async (
      parent: { chainId: number; address: string },
      args: {
        owner?: string;
        spender?: string;
        fromBlock?: string;
        toBlock?: string;
        limit?: number;
        offset?: number;
      },
      context: GraphQLContext
    ) => {
      const approvals = await context.db.approvalEvent.findMany({
        where: {
          chainId: parent.chainId,
          contractAddress: parent.address.toLowerCase(),
          removed: false,
          ...(args.owner && { owner: args.owner.toLowerCase() }),
          ...(args.spender && { spender: args.spender.toLowerCase() }),
          ...(args.fromBlock && { blockNumber: { gte: args.fromBlock } }),
          ...(args.toBlock && { blockNumber: { lte: args.toBlock } }),
        },
        take: args.limit ?? 100,
        skip: args.offset ?? 0,
        orderBy: { blockNumber: 'desc' },
      });

      return approvals.map((a) => ({
        ...a,
        // blockNumber and value are already strings from database
      }));
    },

    eventCount: async (
      parent: { chainId: number; address: string },
      args: { eventName?: string },
      context: GraphQLContext
    ) => {
      return context.eventRepo.count({
        chainId: parent.chainId,
        contractAddress: parent.address as `0x${string}`,
        eventName: args.eventName,
      });
    },

    transferCount: async (
      parent: { chainId: number; address: string },
      args: { from?: string; to?: string },
      context: GraphQLContext
    ) => {
      return context.transferRepo.count({
        chainId: parent.chainId,
        contractAddress: parent.address as `0x${string}`,
        from: args.from as `0x${string}`,
        to: args.to as `0x${string}`,
      });
    },
  },

  Address: {
    transfers: async (
      parent: { chainId: number; address: string },
      args: {
        contractAddress?: string;
        direction?: 'in' | 'out' | 'all';
        limit?: number;
      },
      context: GraphQLContext
    ) => {
      const addr = parent.address.toLowerCase();
      const where: Record<string, unknown> = {
        chainId: parent.chainId,
        removed: false,
      };

      if (args.contractAddress) {
        where.contractAddress = args.contractAddress.toLowerCase();
      }

      if (args.direction === 'in') {
        where.to = addr;
      } else if (args.direction === 'out') {
        where.from = addr;
      } else {
        where.OR = [{ from: addr }, { to: addr }];
      }

      const transfers = await context.db.transferEvent.findMany({
        where,
        take: args.limit ?? 100,
        orderBy: { blockNumber: 'desc' },
      });

      return transfers.map((t) => ({
        ...t,
        // blockNumber and value are already strings from database
      }));
    },

    transferCount: async (
      parent: { chainId: number; address: string },
      args: { contractAddress?: string },
      context: GraphQLContext
    ) => {
      const addr = parent.address.toLowerCase();
      const where: Record<string, unknown> = {
        chainId: parent.chainId,
        removed: false,
        OR: [{ from: addr }, { to: addr }],
      };

      if (args.contractAddress) {
        where.contractAddress = args.contractAddress.toLowerCase();
      }

      return context.db.transferEvent.count({ where });
    },
  },
};