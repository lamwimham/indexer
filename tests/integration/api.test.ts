import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApiServer } from '../../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import type { Synchronizer } from '../../src/sync/index.js';
import type { EventRepository, TransferEventRepository, SyncStateRepository } from '../../src/storage/index.js';
import type { Logger } from '../../src/utils/logger.js';

// 在导入服务器之前模拟 checkDbHealth
vi.mock('../../src/storage/index.js', () => ({
  checkDbHealth: vi.fn().mockResolvedValue(true),
  SyncStateRepository: vi.fn(),
  EventRepository: vi.fn(),
  BlockCheckpointRepository: vi.fn(),
  TransferEventRepository: vi.fn(),
}));

// 模拟日志器
const mockLogger = {
  child: vi.fn().mockReturnThis(),
  debug: vi.fn(),
  trace: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

describe('API Integration Tests', () => {
  let fastify: FastifyInstance;
  let mockSynchronizer: Synchronizer;
  let mockEventRepo: EventRepository;
  let mockTransferRepo: TransferEventRepository;
  let mockSyncStateRepo: SyncStateRepository;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockSynchronizer = {
      getSyncStatus: vi.fn().mockResolvedValue([
        {
          chainId: 1,
          contractAddress: '0x1234',
          contractName: 'TestToken',
          lastSyncedBlock: 1000n,
          isSyncing: false,
          latestBlock: 2000n,
          blocksBehind: 1000n,
        },
      ]),
      getMetrics: vi.fn().mockReturnValue([
        {
          chainId: 1,
          contractAddress: '0x1234',
          currentBlock: 1000n,
          latestBlock: 2000n,
          blocksBehind: 1000n,
          eventsProcessed: 100,
          errors: 0,
          lastSyncTime: new Date(),
          syncSpeed: 10,
        },
      ]),
      stop: vi.fn(),
    } as unknown as Synchronizer;

    mockEventRepo = {
      query: vi.fn().mockResolvedValue([
        {
          id: 'event-1',
          chainId: 1,
          contractAddress: '0x1234',
          contractName: 'TestToken',
          eventName: 'Transfer',
          blockNumber: '100',  // 字符串，非 bigint
          blockTimestamp: new Date(),
          txHash: '0xabc',
          logIndex: 0,
          args: JSON.stringify({ from: '0x1111', to: '0x2222', value: '1000' }),
        },
      ]),
      count: vi.fn().mockResolvedValue(100),
      getEventNames: vi.fn().mockResolvedValue(['Transfer', 'Approval']),
    } as unknown as EventRepository;

    mockTransferRepo = {
      query: vi.fn().mockResolvedValue([
        {
          id: 'transfer-1',
          chainId: 1,
          contractAddress: '0x1234',
          tokenName: 'TestToken',
          tokenSymbol: 'TT',
          from: '0x1111',
          to: '0x2222',
          value: '1000',  // 字符串，非 bigint
          valueFormatted: 0.001,
          decimals: 18,
          blockNumber: '100',  // 字符串，非 bigint
          blockTimestamp: new Date(),
          txHash: '0xabc',
          logIndex: 0,
        },
      ]),
      count: vi.fn().mockResolvedValue(50),
      getBalanceChanges: vi.fn().mockResolvedValue([]),
    } as unknown as TransferEventRepository;

    mockSyncStateRepo = {
      getAll: vi.fn().mockResolvedValue([
        {
          id: 'sync-1',
          chainId: 1,
          contractAddress: '0x1234',
          contractName: 'TestToken',
          lastSyncedBlock: '1000',  // 字符串，非 bigint
          lastSyncedAt: new Date(),
          isSyncing: false,
          lastError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
      get: vi.fn().mockResolvedValue(null),
    } as unknown as SyncStateRepository;

    fastify = await createApiServer({
      port: 3000,
      logger: mockLogger,
      synchronizer: mockSynchronizer,
      eventRepo: mockEventRepo,
      transferRepo: mockTransferRepo,
      syncStateRepo: mockSyncStateRepo,
    });
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('Health Endpoints', () => {
    it('GET /health should return healthy status', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
    });

    it('GET /ready should return ready status', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ready).toBe(true);
    });
  });

  describe('Sync Status Endpoints', () => {
    it('GET /api/v1/sync/status should return sync status', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/sync/status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].contractName).toBe('TestToken');
    });

    it('GET /api/v1/sync/metrics should return metrics', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/sync/metrics',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data[0].eventsProcessed).toBe(100);
    });
  });

  describe('Events Endpoints', () => {
    it('GET /api/v1/events should return events', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/events',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
    });

    it('GET /api/v1/events/count should return count', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/events/count',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.count).toBe(100);
    });

    it('GET /api/v1/events/names should return event names', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/events/names?chainId=1&contractAddress=0x1234',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toContain('Transfer');
    });

    it('GET /api/v1/events/names should require chainId and contractAddress', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/events/names',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Transfers Endpoints', () => {
    it('GET /api/v1/transfers should return transfers', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/transfers',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
    });

    it('GET /api/v1/transfers/count should return count', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/transfers/count',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.count).toBe(50);
    });

    it('GET /api/v1/transfers/address/:address should return address transfers', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/transfers/address/0x1111',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('Sync States Endpoints', () => {
    it('GET /api/v1/sync-states should return sync states', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/sync-states',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
    });
  });
});