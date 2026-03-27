import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReorgHandler } from '../../../src/sync/reorg-handler.js';
import type { RpcClient } from '../../../src/sync/rpc-client.js';
import type { BlockCheckpointRepository, EventRepository, TransferEventRepository } from '../../../src/storage/index.js';
import type { Logger } from '../../../src/utils/logger.js';

// 模拟日志器
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
    it('当没有检查点时应该返回无重组', async () => {
      (mockCheckpointRepo.getLatest as vi.Mock).mockResolvedValue(null);

      const result = await handler.detectReorg(1);

      expect(result).toEqual({ hasReorg: false, reorgDepth: 0, lastValidBlock: null });
    });

    it('当所有检查点匹配时应该返回无重组', async () => {
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

    it('当检查点哈希不同时应该检测到重组', async () => {
      (mockCheckpointRepo.getLatest as vi.Mock).mockResolvedValue({
        chainId: 1,
        blockNumber: 100n,
        blockHash: '0xabc',
      });

      (mockCheckpointRepo.getRange as vi.Mock).mockResolvedValue([
        { chainId: 1, blockNumber: 95n, blockHash: '0xhash95' },
        { chainId: 1, blockNumber: 100n, blockHash: '0xhash100' },
      ]);

      // 区块 95 匹配，区块 100 不匹配
      (mockRpcClient.getBlock as vi.Mock)
        .mockResolvedValueOnce({ hash: '0xhash95' })  // 区块 95 匹配
        .mockResolvedValueOnce({ hash: '0xdifferent' }); // 区块 100 不同 - 发生重组！

      // 用于 findLastValidBlock
      (mockCheckpointRepo.get as vi.Mock).mockResolvedValue({
        chainId: 1,
        blockNumber: 99n,
        blockHash: '0xhash99',
      });
      (mockRpcClient.getBlock as vi.Mock)
        .mockResolvedValueOnce({ hash: '0xhash99' }); // 区块 99 匹配

      const result = await handler.detectReorg(1);

      expect(result.hasReorg).toBe(true);
    });
  });

  describe('handleReorg', () => {
    it('当没有检查点时不应该执行任何操作', async () => {
      (mockCheckpointRepo.getLatest as vi.Mock).mockResolvedValue(null);

      await handler.handleReorg(1, 100n);

      expect(mockEventRepo.deleteByBlockRange).not.toHaveBeenCalled();
    });

    it('应该删除重组范围内的事件和检查点', async () => {
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

    it('当 toBlock < fromBlock 时不应该执行任何操作', async () => {
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
    it('应该将检查点保存到仓库', async () => {
      await handler.saveCheckpoint(1, 100n, '0xabc', new Date());

      expect(mockCheckpointRepo.save).toHaveBeenCalledWith(1, 100n, '0xabc', expect.any(Date));
    });
  });
});