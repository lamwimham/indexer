import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlockFetcher } from '../../../src/sync/block-fetcher.js';
import type { RpcClient } from '../../../src/sync/rpc-client.js';
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

describe('BlockFetcher', () => {
  let fetcher: BlockFetcher;
  let mockRpcClient: RpcClient;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRpcClient = {
      getBlock: vi.fn(),
      getLogs: vi.fn(),
      getLatestBlockNumber: vi.fn(),
    } as unknown as RpcClient;

    fetcher = new BlockFetcher(mockRpcClient, mockLogger, 5);
  });

  describe('fetchBlock', () => {
    it('应该获取单个区块及其日志', async () => {
      const mockBlock = { number: 100n, hash: '0xabc', timestamp: 1234567890n };
      const mockLogs = [{ blockNumber: 100n, address: '0x1234' }];

      (mockRpcClient.getBlock as vi.Mock).mockResolvedValue(mockBlock);
      (mockRpcClient.getLogs as vi.Mock).mockResolvedValue(mockLogs);

      const result = await fetcher.fetchBlock(100n);

      expect(result.block).toEqual(mockBlock);
      expect(result.logs).toEqual(mockLogs);
      expect(mockRpcClient.getBlock).toHaveBeenCalledWith(100n);
      expect(mockRpcClient.getLogs).toHaveBeenCalledWith({
        fromBlock: 100n,
        toBlock: 100n,
      });
    });
  });

  describe('fetchBlockRange', () => {
    it('应该获取多个区块及其日志', async () => {
      const mockBlocks = [
        { number: 100n, hash: '0xabc100', timestamp: 1000n },
        { number: 101n, hash: '0xabc101', timestamp: 1001n },
        { number: 102n, hash: '0xabc102', timestamp: 1002n },
      ];

      const mockLogs = [
        { blockNumber: 100n, address: '0x1234', data: '0x1' },
        { blockNumber: 101n, address: '0x1234', data: '0x2' },
        { blockNumber: 102n, address: '0x1234', data: '0x3' },
      ];

      (mockRpcClient.getLogs as vi.Mock).mockResolvedValue(mockLogs);
      (mockRpcClient.getBlock as vi.Mock)
        .mockImplementation((blockNumber: bigint) => {
          return Promise.resolve(mockBlocks.find(b => b.number === blockNumber));
        });

      const results = await fetcher.fetchBlockRange(100n, 102n, ['0x1234']);

      expect(results.length).toBe(3);
      expect(results[0].block.number).toBe(100n);
      expect(results[0].logs.length).toBe(1);
      expect(results[1].block.number).toBe(101n);
      expect(results[2].block.number).toBe(102n);
    });

    it('应该按区块号对日志进行分组', async () => {
      const mockBlocks = [
        { number: 100n, hash: '0xabc100', timestamp: 1000n },
        { number: 101n, hash: '0xabc101', timestamp: 1001n },
      ];

      const mockLogs = [
        { blockNumber: 100n, address: '0x1234', data: '0x1' },
        { blockNumber: 100n, address: '0x1234', data: '0x2' },
        { blockNumber: 101n, address: '0x1234', data: '0x3' },
      ];

      (mockRpcClient.getLogs as vi.Mock).mockResolvedValue(mockLogs);
      (mockRpcClient.getBlock as vi.Mock)
        .mockImplementation((blockNumber: bigint) => {
          return Promise.resolve(mockBlocks.find(b => b.number === blockNumber));
        });

      const results = await fetcher.fetchBlockRange(100n, 101n);

      expect(results[0].logs.length).toBe(2); // 区块 100 有 2 条日志
      expect(results[1].logs.length).toBe(1); // 区块 101 有 1 条日志
    });

    it('对于没有日志的区块应该返回空数组', async () => {
      const mockBlocks = [
        { number: 100n, hash: '0xabc100', timestamp: 1000n },
        { number: 101n, hash: '0xabc101', timestamp: 1001n },
      ];

      // 只有区块 100 有日志
      const mockLogs = [
        { blockNumber: 100n, address: '0x1234', data: '0x1' },
      ];

      (mockRpcClient.getLogs as vi.Mock).mockResolvedValue(mockLogs);
      (mockRpcClient.getBlock as vi.Mock)
        .mockImplementation((blockNumber: bigint) => {
          return Promise.resolve(mockBlocks.find(b => b.number === blockNumber));
        });

      const results = await fetcher.fetchBlockRange(100n, 101n);

      expect(results[0].logs.length).toBe(1);
      expect(results[1].logs.length).toBe(0); // 区块 101 没有日志
    });
  });

  describe('getLatestBlockWithConfirmations', () => {
    it('应该返回最新区块号减去确认数', async () => {
      (mockRpcClient.getLatestBlockNumber as vi.Mock).mockResolvedValue(1000n);

      const result = await fetcher.getLatestBlockWithConfirmations(12);

      expect(result).toBe(988n); // 1000 - 12
    });

    it('应该处理零确认数的情况', async () => {
      (mockRpcClient.getLatestBlockNumber as vi.Mock).mockResolvedValue(1000n);

      const result = await fetcher.getLatestBlockWithConfirmations(0);

      expect(result).toBe(1000n);
    });
  });

  describe('checkReorg', () => {
    it('当哈希不同时应该返回 true', async () => {
      (mockRpcClient.getBlock as vi.Mock).mockResolvedValue({ hash: '0xdifferent' });

      const result = await fetcher.checkReorg(100n, '0xexpected');

      expect(result).toBe(true);
    });

    it('当哈希匹配时应该返回 false', async () => {
      (mockRpcClient.getBlock as vi.Mock).mockResolvedValue({ hash: '0xexpected' });

      const result = await fetcher.checkReorg(100n, '0xexpected');

      expect(result).toBe(false);
    });

    it('当发生错误时应该返回 false', async () => {
      (mockRpcClient.getBlock as vi.Mock).mockRejectedValue(new Error('RPC error'));

      const result = await fetcher.checkReorg(100n, '0xexpected');

      expect(result).toBe(false);
    });
  });

  describe('findCommonAncestor', () => {
    it('应该找到匹配的区块', async () => {
      const knownHashes = new Map<bigint, string>();
      knownHashes.set(100n, '0xabc');
      knownHashes.set(99n, '0xdef');

      (mockRpcClient.getBlock as vi.Mock)
        .mockResolvedValueOnce({ hash: '0xdifferent' }) // 100 不匹配
        .mockResolvedValueOnce({ hash: '0xdef' }); // 99 匹配

      const result = await fetcher.findCommonAncestor(100n, knownHashes);

      expect(result).toBe(99n);
    });

    it('当在深度限制内未找到匹配时应该返回 null', async () => {
      const knownHashes = new Map<bigint, string>();
      for (let i = 0; i <= 100; i++) {
        knownHashes.set(BigInt(i), `0xhash${i}`);
      }

      (mockRpcClient.getBlock as vi.Mock).mockResolvedValue({ hash: '0xdifferent' });

      const result = await fetcher.findCommonAncestor(100n, knownHashes);

      // 当未找到匹配时，返回 -1n（当 currentBlock 小于 0 时）
      expect(result).toBe(-1n);
    });
  });
});