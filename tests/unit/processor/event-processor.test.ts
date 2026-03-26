import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventProcessor, createEventSignature } from '../../../src/processor/event-processor.js';
import type { Abi } from 'viem';
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

// 测试用 ABI
const TEST_ABI: Abi = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Approval',
    inputs: [
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: true, name: 'spender', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
  },
];

describe('EventProcessor', () => {
  let processor: EventProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new EventProcessor(mockLogger);
  });

  describe('createEventSignature', () => {
    it('should create correct signature for Transfer event', () => {
      const transferEvent = TEST_ABI.find(e => e.type === 'event' && e.name === 'Transfer')!;
      const signature = createEventSignature(transferEvent);
      expect(signature).toBe('Transfer(address,address,uint256)');
    });

    it('should create correct signature for Approval event', () => {
      const approvalEvent = TEST_ABI.find(e => e.type === 'event' && e.name === 'Approval')!;
      const signature = createEventSignature(approvalEvent);
      expect(signature).toBe('Approval(address,address,uint256)');
    });

    it('should throw for non-event ABI item', () => {
      const nonEvent = { type: 'function', name: 'transfer' } as Abi[number];
      expect(() => createEventSignature(nonEvent)).toThrow('ABI item is not an event');
    });
  });

  describe('registerEvent', () => {
    it('should register an event handler', () => {
      const handler = vi.fn();
      const transferEvent = TEST_ABI.find(e => e.type === 'event' && e.name === 'Transfer')!;
      
      processor.registerEvent({
        signature: 'Transfer(address,address,uint256)',
        abi: transferEvent,
        handler,
      });

      const registered = processor.getRegisteredEvents();
      expect(registered.length).toBe(1);
    });

    it('should register multiple events', () => {
      const handler = vi.fn();
      const transferEvent = TEST_ABI.find(e => e.type === 'event' && e.name === 'Transfer')!;
      const approvalEvent = TEST_ABI.find(e => e.type === 'event' && e.name === 'Approval')!;

      processor.registerEvents([
        { signature: 'Transfer(address,address,uint256)', abi: transferEvent, handler },
        { signature: 'Approval(address,address,uint256)', abi: approvalEvent, handler },
      ]);

      expect(processor.getRegisteredEvents().length).toBe(2);
    });
  });

  describe('processLog', () => {
    it('should return null for log without topics', async () => {
      const result = await processor.processLog(
        { address: '0x1234', topics: [], data: '0x', transactionHash: '0xabc', transactionIndex: 0, logIndex: 0 },
        { chainId: 1, contractAddress: '0x1234', contractName: 'Test', blockNumber: 1n, blockTimestamp: new Date() },
        { db: {} as any, logger: mockLogger }
      );
      expect(result).toBeNull();
    });

    it('should return null for unregistered event signature', async () => {
      // "Transfer(address,address,uint256)" 的 keccak256 哈希
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      
      const result = await processor.processLog(
        { address: '0x1234', topics: [transferTopic], data: '0x', transactionHash: '0xabc', transactionIndex: 0, logIndex: 0 },
        { chainId: 1, contractAddress: '0x1234', contractName: 'Test', blockNumber: 1n, blockTimestamp: new Date() },
        { db: {} as any, logger: mockLogger }
      );
      expect(result).toBeNull();
    });

    it('should process registered Transfer event', async () => {
      const handler = vi.fn();
      const transferEvent = TEST_ABI.find(e => e.type === 'event' && e.name === 'Transfer')!;
      
      processor.registerEvent({
        signature: 'Transfer(address,address,uint256)',
        abi: transferEvent,
        handler,
      });

      // "Transfer(address,address,uint256)" 的 keccak256 哈希
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const from = '0x0000000000000000000000001111111111111111111111111111111111111111';
      const to = '0x0000000000000000000000002222222222222222222222222222222222222222';
      const value = '0x00000000000000000000000000000000000000000000000000000000000003e8'; // 1000

      const result = await processor.processLog(
        {
          address: '0x1234',
          topics: [transferTopic, from, to],
          data: value,
          transactionHash: '0xabc',
          transactionIndex: 0,
          logIndex: 0,
        },
        { chainId: 1, contractAddress: '0x1234', contractName: 'Test', blockNumber: 1n, blockTimestamp: new Date() },
        { db: {} as any, logger: mockLogger }
      );

      expect(result).not.toBeNull();
      expect(result?.eventName).toBe('Transfer');
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('processLogs', () => {
    it('should process multiple logs', async () => {
      const handler = vi.fn();
      const transferEvent = TEST_ABI.find(e => e.type === 'event' && e.name === 'Transfer')!;
      
      processor.registerEvent({
        signature: 'Transfer(address,address,uint256)',
        abi: transferEvent,
        handler,
      });

      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const from = '0x0000000000000000000000001111111111111111111111111111111111111111';
      const to = '0x0000000000000000000000002222222222222222222222222222222222222222';
      // 正确编码的 uint256 值（每个 32 字节）
      const value1 = '0x00000000000000000000000000000000000000000000000000000000000003e8'; // 1000
      const value2 = '0x00000000000000000000000000000000000000000000000000000000000007d0'; // 2000

      const results = await processor.processLogs(
        [
          { address: '0x1234', topics: [transferTopic, from, to], data: value1, transactionHash: '0xabc1', transactionIndex: 0, logIndex: 0 },
          { address: '0x1234', topics: [transferTopic, from, to], data: value2, transactionHash: '0xabc2', transactionIndex: 0, logIndex: 0 },
        ],
        { chainId: 1, contractAddress: '0x1234', contractName: 'Test', blockNumber: 1n, blockTimestamp: new Date() },
        { db: {} as any, logger: mockLogger }
      );

      expect(results.length).toBe(2);
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});