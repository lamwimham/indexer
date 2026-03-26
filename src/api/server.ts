import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { Logger } from 'pino';
import type { Synchronizer } from '../sync/index.js';
import type { EventRepository, TransferEventRepository, SyncStateRepository } from '../storage/index.js';
import { checkDbHealth } from '../storage/index.js';
import { getMetrics } from '../monitoring/index.js';

/**
 * API server options
 */
export interface ApiServerOptions {
  port: number;
  logger: Logger;
  synchronizer: Synchronizer;
  eventRepo: EventRepository;
  transferRepo: TransferEventRepository;
  syncStateRepo: SyncStateRepository;
}

/**
 * Create and configure Fastify server
 */
export async function createApiServer(options: ApiServerOptions) {
  const { synchronizer, eventRepo, transferRepo, syncStateRepo } = options;

  const fastify = Fastify({
    logger: false, // Use our own logger
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  // ============================================
  // Health Check Routes
  // ============================================

  fastify.get('/health', async (_request, reply) => {
    const dbHealthy = await checkDbHealth();

    if (!dbHealthy) {
      reply.code(503);
      return { status: 'unhealthy', database: 'disconnected' };
    }

    return { status: 'healthy', timestamp: new Date().toISOString() };
  });

  fastify.get('/ready', async (_request, reply) => {
    const dbHealthy = await checkDbHealth();

    if (!dbHealthy) {
      reply.code(503);
      return { ready: false, reason: 'database unavailable' };
    }

    return { ready: true };
  });

  // ============================================
  // Prometheus Metrics Route
  // ============================================

  fastify.get('/metrics', async (_request, reply) => {
    const metrics = await getMetrics();
    reply.type('text/plain; version=0.0.4; charset=utf-8');
    return metrics;
  });

  // ============================================
  // Sync Status Routes
  // ============================================

  fastify.get('/api/v1/sync/status', async () => {
    const status = await synchronizer.getSyncStatus();
    return {
      success: true,
      data: status.map((s) => ({
        chainId: s.chainId,
        contractAddress: s.contractAddress,
        contractName: s.contractName,
        lastSyncedBlock: s.lastSyncedBlock.toString(),
        isSyncing: s.isSyncing,
        latestBlock: s.latestBlock.toString(),
        blocksBehind: s.blocksBehind.toString(),
      })),
    };
  });

  fastify.get('/api/v1/sync/metrics', async () => {
    const metrics = synchronizer.getMetrics();
    return {
      success: true,
      data: metrics.map((m) => ({
        chainId: m.chainId,
        contractAddress: m.contractAddress,
        currentBlock: m.currentBlock.toString(),
        latestBlock: m.latestBlock.toString(),
        blocksBehind: m.blocksBehind.toString(),
        eventsProcessed: m.eventsProcessed,
        errors: m.errors,
        lastSyncTime: m.lastSyncTime.toISOString(),
      })),
    };
  });

  // ============================================
  // Events Routes
  // ============================================

  fastify.get('/api/v1/events', async (request, _reply) => {
    const query = request.query as Record<string, string>;

    const events = await eventRepo.query({
      chainId: query.chainId ? parseInt(query.chainId, 10) : undefined,
      contractAddress: query.contractAddress as `0x${string}`,
      eventName: query.eventName,
      fromBlock: query.fromBlock ? BigInt(query.fromBlock) : undefined,
      toBlock: query.toBlock ? BigInt(query.toBlock) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : 100,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
      orderBy: (query.orderBy as 'blockNumber' | 'blockTimestamp') ?? 'blockNumber',
      orderDirection: (query.orderDirection as 'asc' | 'desc') ?? 'desc',
    });

    type Event = {
      id: string;
      chainId: number;
      contractAddress: string;
      contractName: string;
      eventName: string;
      blockNumber: string;
      blockTimestamp: Date;
      txHash: string;
      logIndex: number;
      args: string;
    };

    return {
      success: true,
      data: events.map((e: Event) => ({
        id: e.id,
        chainId: e.chainId,
        contractAddress: e.contractAddress,
        contractName: e.contractName,
        eventName: e.eventName,
        blockNumber: e.blockNumber,
        blockTimestamp: e.blockTimestamp.toISOString(),
        txHash: e.txHash,
        logIndex: e.logIndex,
        args: JSON.parse(e.args),
      })),
    };
  });

  fastify.get('/api/v1/events/count', async (request, _reply) => {
    const query = request.query as Record<string, string>;

    const count = await eventRepo.count({
      chainId: query.chainId ? parseInt(query.chainId, 10) : undefined,
      contractAddress: query.contractAddress as `0x${string}`,
      eventName: query.eventName,
    });

    return { success: true, data: { count } };
  });

  fastify.get('/api/v1/events/names', async (request, reply) => {
    const query = request.query as Record<string, string>;

    if (!query.chainId || !query.contractAddress) {
      reply.code(400);
      return { success: false, error: 'chainId and contractAddress are required' };
    }

    const names = await eventRepo.getEventNames(
      parseInt(query.chainId, 10),
      query.contractAddress as `0x${string}`
    );

    return { success: true, data: names };
  });

  // ============================================
  // Transfer Events Routes
  // ============================================

  fastify.get('/api/v1/transfers', async (request, _reply) => {
    const query = request.query as Record<string, string>;

    const transfers = await transferRepo.query({
      chainId: query.chainId ? parseInt(query.chainId, 10) : undefined,
      contractAddress: query.contractAddress as `0x${string}`,
      from: query.from as `0x${string}`,
      to: query.to as `0x${string}`,
      fromBlock: query.fromBlock ? BigInt(query.fromBlock) : undefined,
      toBlock: query.toBlock ? BigInt(query.toBlock) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : 100,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
      orderBy: (query.orderBy as 'blockNumber' | 'blockTimestamp' | 'value') ?? 'blockNumber',
      orderDirection: (query.orderDirection as 'asc' | 'desc') ?? 'desc',
    });

    return {
      success: true,
      data: transfers.map((t) => ({
        id: t.id,
        chainId: t.chainId,
        contractAddress: t.contractAddress,
        tokenName: t.tokenName,
        tokenSymbol: t.tokenSymbol,
        from: t.from,
        to: t.to,
        value: t.value.toString(),
        valueFormatted: t.valueFormatted,
        decimals: t.decimals,
        blockNumber: t.blockNumber.toString(),
        blockTimestamp: t.blockTimestamp.toISOString(),
        txHash: t.txHash,
        logIndex: t.logIndex,
      })),
    };
  });

  fastify.get('/api/v1/transfers/count', async (request, _reply) => {
    const query = request.query as Record<string, string>;

    const count = await transferRepo.count({
      chainId: query.chainId ? parseInt(query.chainId, 10) : undefined,
      contractAddress: query.contractAddress as `0x${string}`,
      from: query.from as `0x${string}`,
      to: query.to as `0x${string}`,
    });

    return { success: true, data: { count } };
  });

  fastify.get('/api/v1/transfers/address/:address', async (request, _reply) => {
    const params = request.params as { address: string };
    const query = request.query as Record<string, string>;

    const transfers = await transferRepo.getBalanceChanges(
      query.chainId ? parseInt(query.chainId, 10) : 1,
      params.address as `0x${string}`,
      query.contractAddress as `0x${string}`
    );

    return {
      success: true,
      data: transfers.map((t) => ({
        id: t.id,
        contractAddress: t.contractAddress,
        tokenName: t.tokenName,
        tokenSymbol: t.tokenSymbol,
        from: t.from,
        to: t.to,
        value: t.value.toString(),
        valueFormatted: t.valueFormatted,
        direction: t.from.toLowerCase() === params.address.toLowerCase() ? 'out' : 'in',
        blockNumber: t.blockNumber.toString(),
        blockTimestamp: t.blockTimestamp.toISOString(),
        txHash: t.txHash,
      })),
    };
  });

  // ============================================
  // Sync States Routes
  // ============================================

  fastify.get('/api/v1/sync-states', async () => {
    const states = await syncStateRepo.getAll();

    return {
      success: true,
      data: states.map((s: {
        id: string;
        chainId: number;
        contractAddress: string;
        contractName: string;
        lastSyncedBlock: string;
        lastSyncedAt: Date;
        isSyncing: boolean;
        lastError: string | null;
      }) => ({
        id: s.id,
        chainId: s.chainId,
        contractAddress: s.contractAddress,
        contractName: s.contractName,
        lastSyncedBlock: s.lastSyncedBlock,
        lastSyncedAt: s.lastSyncedAt.toISOString(),
        isSyncing: s.isSyncing,
        lastError: s.lastError,
      })),
    };
  });

  return fastify;
}

/**
 * Start the API server
 */
export async function startApiServer(options: ApiServerOptions): Promise<ReturnType<typeof Fastify>> {
  const { port, logger } = options;

  const fastify = await createApiServer(options);

  // Note: Don't call listen() here - let the caller add routes first
  // The caller should call fastify.listen({ port, host: '0.0.0.0' }) after adding all routes
  logger.info({ port }, 'REST API server created');

  return fastify;
}