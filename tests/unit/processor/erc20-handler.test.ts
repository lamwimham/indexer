import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ERC20EventProcessor, ERC20_ABI, createEventSignature } from '../../../src/processor/index.js';
import type { Logger } from '../../../src/utils/logger.js';
import type { PrismaClient } from '@prisma/client';

// 模拟日志器
const mockLogger = {
  child: vi.fn().mockReturnThis(),
  debug: vi.fn(),
  trace: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

// 模拟数据库
const mockDb = {
  transferEvent: {
    upsert: vi.fn().mockResolvedValue({}),
  },
  approvalEvent: {
    upsert: vi.fn().mockResolvedValue({}),
  },
  event: {
    upsert: vi.fn().mockResolvedValue({}),
  },
} as unknown as PrismaClient;

describe('ERC20EventProcessor', () => {
  let processor: ERC20EventProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new ERC20EventProcessor(mockDb, mockLogger);
  });

  describe('ABI 定义', () => {
    it('应该包含 Transfer 事件', () => {
      const transferEvent = ERC20_ABI.find(e => e.type === 'event' && e.name === 'Transfer');
      expect(transferEvent).toBeDefined();
      expect(transferEvent?.inputs).toHaveLength(3);
    });

    it('应该包含 Approval 事件', () => {
      const approvalEvent = ERC20_ABI.find(e => e.type === 'event' && e.name === 'Approval');
      expect(approvalEvent).toBeDefined();
      expect(approvalEvent?.inputs).toHaveLength(3);
    });

    it('Transfer 事件签名应该正确', () => {
      const transferEvent = ERC20_ABI.find(e => e.type === 'event' && e.name === 'Transfer')!;
      const signature = createEventSignature(transferEvent);
      expect(signature).toBe('Transfer(address,address,uint256)');
    });

    it('Approval 事件签名应该正确', () => {
      const approvalEvent = ERC20_ABI.find(e => e.type === 'event' && e.name === 'Approval')!;
      const signature = createEventSignature(approvalEvent);
      expect(signature).toBe('Approval(address,address,uint256)');
    });
  });

  describe('事件注册', () => {
    it('应该注册 Transfer 和 Approval 事件', () => {
      const registeredEvents = processor.getRegisteredEvents();
      expect(registeredEvents.length).toBe(2);
    });

    it('应该注册正确的 Transfer 事件哈希', () => {
      // Transfer(address,address,uint256) 的 keccak256 哈希
      const transferHash = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const registeredEvents = processor.getRegisteredEvents();
      expect(registeredEvents).toContain(transferHash);
    });

    it('应该注册正确的 Approval 事件哈希', () => {
      // Approval(address,address,uint256) 的 keccak256 哈希
      const approvalHash = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';
      const registeredEvents = processor.getRegisteredEvents();
      expect(registeredEvents).toContain(approvalHash);
    });
  });

  describe('代币元数据管理', () => {
    it('应该能设置代币元数据', () => {
      processor.setTokenMetadata('0xABCDEF', {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
      });

      const metadata = processor.getTokenMetadata('0xABCDEF');
      expect(metadata.name).toBe('Test Token');
      expect(metadata.symbol).toBe('TEST');
      expect(metadata.decimals).toBe(18);
    });

    it('地址应该不区分大小写', () => {
      processor.setTokenMetadata('0xABCDEF', { name: 'Test' });

      const metadata1 = processor.getTokenMetadata('0xabcdef');
      const metadata2 = processor.getTokenMetadata('0xABCDEF');

      expect(metadata1.name).toBe('Test');
      expect(metadata2.name).toBe('Test');
    });

    it('未设置的地址应该返回空对象', () => {
      const metadata = processor.getTokenMetadata('0xUNKNOWN');
      expect(metadata).toEqual({});
    });
  });

  describe('处理 Transfer 事件', () => {
    it('应该正确处理 Transfer 事件', async () => {
      // Transfer(address,address,uint256) 的 keccak256 哈希
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const from = '0x0000000000000000000000001111111111111111111111111111111111111111';
      const to = '0x0000000000000000000000002222222222222222222222222222222222222222';
      const value = '0x00000000000000000000000000000000000000000000000000000000000003e8'; // 1000

      await processor.processLog(
        {
          address: '0xContract',
          topics: [transferTopic, from, to],
          data: value,
          transactionHash: '0xabc123',
          transactionIndex: 0,
          logIndex: 0,
        },
        {
          chainId: 1,
          contractAddress: '0xContract',
          contractName: 'TestToken',
          blockNumber: 100n,
          blockTimestamp: new Date('2024-01-01'),
        },
        { db: mockDb, logger: mockLogger }
      );

      // 验证 transferEvent.upsert 被调用
      expect(mockDb.transferEvent.upsert).toHaveBeenCalled();

      // 验证 event.upsert 被调用
      expect(mockDb.event.upsert).toHaveBeenCalled();
    });

    it('应该使用代币元数据格式化数值', async () => {
      processor.setTokenMetadata('0xContract', {
        name: 'USDC',
        symbol: 'USDC',
        decimals: 6,
      });

      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const from = '0x0000000000000000000000001111111111111111111111111111111111111111';
      const to = '0x0000000000000000000000002222222222222222222222222222222222222222';
      const value = '0x000000000000000000000000000000000000000000000000000000000000f4240'; // 1000000 (1 USDC)

      await processor.processLog(
        {
          address: '0xContract',
          topics: [transferTopic, from, to],
          data: value,
          transactionHash: '0xabc123',
          transactionIndex: 0,
          logIndex: 0,
        },
        {
          chainId: 1,
          contractAddress: '0xContract',
          contractName: 'USDC',
          blockNumber: 100n,
          blockTimestamp: new Date('2024-01-01'),
        },
        { db: mockDb, logger: mockLogger }
      );

      // 验证 transferEvent.upsert 被调用
      const upsertCall = mockDb.transferEvent.upsert.mock.calls[0][0];
      expect(upsertCall.create.tokenName).toBe('USDC');
      expect(upsertCall.create.tokenSymbol).toBe('USDC');
      expect(upsertCall.create.decimals).toBe(6);
      expect(upsertCall.create.valueFormatted).toBe(1); // 1000000 / 10^6 = 1
    });
  });

  describe('处理 Approval 事件', () => {
    it('应该正确处理 Approval 事件', async () => {
      // Approval(address,address,uint256) 的 keccak256 哈希
      const approvalTopic = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';
      const owner = '0x0000000000000000000000001111111111111111111111111111111111111111';
      const spender = '0x0000000000000000000000002222222222222222222222222222222222222222';
      const value = '0x00000000000000000000000000000000000000000000000000000000000003e8'; // 1000

      await processor.processLog(
        {
          address: '0xContract',
          topics: [approvalTopic, owner, spender],
          data: value,
          transactionHash: '0xabc123',
          transactionIndex: 0,
          logIndex: 0,
        },
        {
          chainId: 1,
          contractAddress: '0xContract',
          contractName: 'TestToken',
          blockNumber: 100n,
          blockTimestamp: new Date('2024-01-01'),
        },
        { db: mockDb, logger: mockLogger }
      );

      // 验证 approvalEvent.upsert 被调用
      expect(mockDb.approvalEvent.upsert).toHaveBeenCalled();

      // 验证 event.upsert 被调用
      expect(mockDb.event.upsert).toHaveBeenCalled();
    });
  });

  describe('不处理其他事件', () => {
    it('对于未注册的事件应该返回 null', async () => {
      // Swap 事件的 topic（不应该被 ERC20 处理器处理）
      const swapTopic = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';

      const result = await processor.processLog(
        {
          address: '0xPool',
          topics: [swapTopic],
          data: '0x',
          transactionHash: '0xabc123',
          transactionIndex: 0,
          logIndex: 0,
        },
        {
          chainId: 1,
          contractAddress: '0xPool',
          contractName: 'Pool',
          blockNumber: 100n,
          blockTimestamp: new Date('2024-01-01'),
        },
        { db: mockDb, logger: mockLogger }
      );

      expect(result).toBeNull();
    });
  });
});