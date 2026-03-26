import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReorgHandler } from '../../../src/sync/reorg-handler.js';
import type { RpcClient } from '../../../src/sync/rpc-client.js';
import type { BlockCheckpointRepository, EventRepository, TransferEventRepository } from '../../../src/storage/index.js';
import type { Logger } from '../../../src/utils/logger.js';

// Mock logger
const mockLogger = {
  child: vi.fn().mockReturnThis(),
  debug: vi.fn(),
  trace: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

describe('ReorgHandler', () => {
  let handler: ReorgHandler;
  let mockRpcClient: RpcClient;
  let mockCheckpointRepo: BlockCheckpointRepository;
  let mockEventRepo: EventRepository;
  let mockTransferRepo: TransferEventRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRpcClient = {
      getBlock: vi.fn(),
      getLatestBlockNumber: vi.fn(),
    } as unknown as RpcClient;

    mockCheckpointRepo = {
      getLatest: vi.fn(),
      getRange: vi.fn(),
      get: vi.fn(),
      save: vi.fn(),
      deleteRange: vi.fn(),
    } as unknown as BlockCheckpointRepository;

    mockEventRepo = {
      deleteByBlockRange: vi.fn(),
    } as unknown as EventRepository;

    mockTransferRepo = {
      deleteByBlockRange: vi.fn(),
    } as unknown as TransferEventRepository;

    handler = new ReorgHandler(
      mockRpcClient,
      mockCheckpointRepo,
      mockEventRepo,
      mockTransferRepo,
      mockLogger,
      12
    );
  });

  describe('detectReorg', () => {
    it('should return no reorg when no checkpoints exist', async () => {
      (mockCheckpointRepo.getLatest as vi.Mock).mockResolvedValue(null);

      const result = await handler.detectReorg(1);

      expect(result).toEqual({ hasReorg: false, reorgDepth: 0, lastValidBlock: null });
    });

    it('should return no reorg when all checkpoints match', async () => {
      (mockCheckpointRepo.getLatest as vi.Mock).mockResolvedValue({
        chainId: 1,
        blockNumber: 100n,
        blockHash: '0xabc',
      });

      (mockCheckpointRepo.getRange as vi.Mock).mockResolvedValue([
        { chainId: 1, blockNumber: 90n, blockHash: '0xhash90' },
        { chainId: 1, blockNumber: 100n, blockHash: '0xhash100' },
      ]);

      (mockRpcClient.getBlock as vi.Mock)
        .mockResolvedValueOnce({ hash: '0xhash90' })
        .mockResolvedValueOnce({ hash: '0xhash100' });

      const result = await handler.detectReorg(1);

      expect(result.hasReorg).toBe(false);
    });

    it('should detect reorg when checkpoint hash differs', async () => {
      (mockCheckpointRepo.getLatest as vi.Mock).mockResolvedValue({
        chainId: 1,
        blockNumber: 100n,
        blockHash: '0xabc',
      });

      (mockCheckpointRepo.getRange as vi.Mock).mockResolvedValue([
        { chainId: 1, blockNumber: 95n, blockHash: '0xhash95' },
        { chainId: 1, blockNumber: 100n, blockHash: '0xhash100' },
      ]);

      // Block 95 matches, block 100 doesn't
      (mockRpcClient.getBlock as vi.Mock)
        .mockResolvedValueOnce({ hash: '0xhash95' })  // Block 95 matches
        .mockResolvedValueOnce({ hash: '0xdifferent' }); // Block 100 differs - reorg!

      // For findLastValidBlock
      (mockCheckpointRepo.get as vi.Mock).mockResolvedValue({
        chainId: 1,
        blockNumber: 99n,
        blockHash: '0xhash99',
      });
      (mockRpcClient.getBlock as vi.Mock)
        .mockResolvedValueOnce({ hash: '0xhash99' }); // Block 99 matches

      const result = await handler.detectReorg(1);

      expect(result.hasReorg).toBe(true);
    });
  });

  describe('handleReorg', () => {
    it('should do nothing when no checkpoints exist', async () => {
      (mockCheckpointRepo.getLatest as vi.Mock).mockResolvedValue(null);

      await handler.handleReorg(1, 100n);

      expect(mockEventRepo.deleteByBlockRange).not.toHaveBeenCalled();
    });

    it('should delete events and checkpoints in reorg range', async () => {
      (mockCheckpointRepo.getLatest as vi.Mock).mockResolvedValue({
        chainId: 1,
        blockNumber: 110n,
        blockHash: '0xabc',
      });

      await handler.handleReorg(1, 100n);

      expect(mockEventRepo.deleteByBlockRange).toHaveBeenCalledWith(1, 100n, 110n);
      expect(mockTransferRepo.deleteByBlockRange).toHaveBeenCalledWith(1, 100n, 110n);
      expect(mockCheckpointRepo.deleteRange).toHaveBeenCalledWith(1, 100n, 110n);
    });

    it('should do nothing when toBlock < fromBlock', async () => {
      (mockCheckpointRepo.getLatest as vi.Mock).mockResolvedValue({
        chainId: 1,
        blockNumber: 90n,
        blockHash: '0xabc',
      });

      await handler.handleReorg(1, 100n);

      expect(mockEventRepo.deleteByBlockRange).not.toHaveBeenCalled();
    });
  });

  describe('saveCheckpoint', () => {
    it('should save checkpoint to repository', async () => {
      await handler.saveCheckpoint(1, 100n, '0xabc', new Date());

      expect(mockCheckpointRepo.save).toHaveBeenCalledWith(1, 100n, '0xabc', expect.any(Date));
    });
  });
});