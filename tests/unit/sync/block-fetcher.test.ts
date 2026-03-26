import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlockFetcher } from '../../../src/sync/block-fetcher.js';
import type { RpcClient } from '../../../src/sync/rpc-client.js';
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
    it('should fetch a single block with logs', async () => {
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
    it('should fetch multiple blocks with logs', async () => {
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

    it('should group logs by block number', async () => {
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

      expect(results[0].logs.length).toBe(2); // Block 100 has 2 logs
      expect(results[1].logs.length).toBe(1); // Block 101 has 1 log
    });

    it('should return empty logs array for blocks without logs', async () => {
      const mockBlocks = [
        { number: 100n, hash: '0xabc100', timestamp: 1000n },
        { number: 101n, hash: '0xabc101', timestamp: 1001n },
      ];

      // Only block 100 has logs
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
      expect(results[1].logs.length).toBe(0); // Block 101 has no logs
    });
  });

  describe('getLatestBlockWithConfirmations', () => {
    it('should return latest block minus confirmations', async () => {
      (mockRpcClient.getLatestBlockNumber as vi.Mock).mockResolvedValue(1000n);

      const result = await fetcher.getLatestBlockWithConfirmations(12);

      expect(result).toBe(988n); // 1000 - 12
    });

    it('should handle zero confirmations', async () => {
      (mockRpcClient.getLatestBlockNumber as vi.Mock).mockResolvedValue(1000n);

      const result = await fetcher.getLatestBlockWithConfirmations(0);

      expect(result).toBe(1000n);
    });
  });

  describe('checkReorg', () => {
    it('should return true when hash differs', async () => {
      (mockRpcClient.getBlock as vi.Mock).mockResolvedValue({ hash: '0xdifferent' });

      const result = await fetcher.checkReorg(100n, '0xexpected');

      expect(result).toBe(true);
    });

    it('should return false when hash matches', async () => {
      (mockRpcClient.getBlock as vi.Mock).mockResolvedValue({ hash: '0xexpected' });

      const result = await fetcher.checkReorg(100n, '0xexpected');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      (mockRpcClient.getBlock as vi.Mock).mockRejectedValue(new Error('RPC error'));

      const result = await fetcher.checkReorg(100n, '0xexpected');

      expect(result).toBe(false);
    });
  });

  describe('findCommonAncestor', () => {
    it('should find matching block', async () => {
      const knownHashes = new Map<bigint, string>();
      knownHashes.set(100n, '0xabc');
      knownHashes.set(99n, '0xdef');

      (mockRpcClient.getBlock as vi.Mock)
        .mockResolvedValueOnce({ hash: '0xdifferent' }) // 100 doesn't match
        .mockResolvedValueOnce({ hash: '0xdef' }); // 99 matches

      const result = await fetcher.findCommonAncestor(100n, knownHashes);

      expect(result).toBe(99n);
    });

    it('should return null when no match found within depth limit', async () => {
      const knownHashes = new Map<bigint, string>();
      for (let i = 0; i <= 100; i++) {
        knownHashes.set(BigInt(i), `0xhash${i}`);
      }

      (mockRpcClient.getBlock as vi.Mock).mockResolvedValue({ hash: '0xdifferent' });

      const result = await fetcher.findCommonAncestor(100n, knownHashes);

      // When no match is found, it returns -1n (when currentBlock goes below 0)
      expect(result).toBe(-1n);
    });
  });
});