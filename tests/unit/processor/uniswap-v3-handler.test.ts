import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UniswapV3EventProcessor, UNISWAP_V3_POOL_ABI, createEventSignature } from '../../../src/processor/index.js';
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
  swapEvent: {
    upsert: vi.fn().mockResolvedValue({}),
  },
  event: {
    upsert: vi.fn().mockResolvedValue({}),
  },
} as unknown as PrismaClient;

describe('UniswapV3EventProcessor', () => {
  let processor: UniswapV3EventProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new UniswapV3EventProcessor(mockDb, mockLogger);
  });

  describe('ABI 定义', () => {
    it('应该包含 Swap 事件', () => {
      const swapEvent = UNISWAP_V3_POOL_ABI.find(e => e.type === 'event' && e.name === 'Swap');
      expect(swapEvent).toBeDefined();
      expect(swapEvent?.inputs).toHaveLength(7);
    });

    it('应该包含 Mint 事件', () => {
      const mintEvent = UNISWAP_V3_POOL_ABI.find(e => e.type === 'event' && e.name === 'Mint');
      expect(mintEvent).toBeDefined();
      expect(mintEvent?.inputs).toHaveLength(7);
    });

    it('应该包含 Burn 事件', () => {
      const burnEvent = UNISWAP_V3_POOL_ABI.find(e => e.type === 'event' && e.name === 'Burn');
      expect(burnEvent).toBeDefined();
      expect(burnEvent?.inputs).toHaveLength(6);
    });

    it('应该包含 Collect 事件', () => {
      const collectEvent = UNISWAP_V3_POOL_ABI.find(e => e.type === 'event' && e.name === 'Collect');
      expect(collectEvent).toBeDefined();
      expect(collectEvent?.inputs).toHaveLength(6);
    });

    it('Swap 事件签名应该正确', () => {
      const swapEvent = UNISWAP_V3_POOL_ABI.find(e => e.type === 'event' && e.name === 'Swap')!;
      const signature = createEventSignature(swapEvent);
      expect(signature).toBe('Swap(address,address,int256,int256,uint256,uint128,int24)');
    });

    it('Mint 事件签名应该正确', () => {
      const mintEvent = UNISWAP_V3_POOL_ABI.find(e => e.type === 'event' && e.name === 'Mint')!;
      const signature = createEventSignature(mintEvent);
      expect(signature).toBe('Mint(address,address,int24,int24,uint128,uint256,uint256)');
    });

    it('Burn 事件签名应该正确', () => {
      const burnEvent = UNISWAP_V3_POOL_ABI.find(e => e.type === 'event' && e.name === 'Burn')!;
      const signature = createEventSignature(burnEvent);
      expect(signature).toBe('Burn(address,int24,int24,uint128,uint256,uint256)');
    });

    it('Collect 事件签名应该正确', () => {
      const collectEvent = UNISWAP_V3_POOL_ABI.find(e => e.type === 'event' && e.name === 'Collect')!;
      const signature = createEventSignature(collectEvent);
      expect(signature).toBe('Collect(address,address,int24,int24,uint256,uint256)');
    });
  });

  describe('事件注册', () => {
    it('应该注册 4 个事件', () => {
      const registeredEvents = processor.getRegisteredEvents();
      expect(registeredEvents.length).toBe(4);
    });

    it('应该注册正确的 Swap 事件哈希', () => {
      // Swap(address,address,int256,int256,uint256,uint128,int24) 的 keccak256 哈希
      const swapHash = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
      const registeredEvents = processor.getRegisteredEvents();
      expect(registeredEvents).toContain(swapHash);
    });

    it('应该注册正确的 Mint 事件哈希', () => {
      // Mint(address,address,int24,int24,uint128,uint256,uint256) 的 keccak256 哈希
      const mintHash = '0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0f47';
      const registeredEvents = processor.getRegisteredEvents();
      expect(registeredEvents).toContain(mintHash);
    });

    it('应该注册正确的 Burn 事件哈希', () => {
      // Burn(address,int24,int24,uint128,uint256,uint256) 的 keccak256 哈希
      const burnHash = '0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c';
      const registeredEvents = processor.getRegisteredEvents();
      expect(registeredEvents).toContain(burnHash);
    });

    it('应该注册正确的 Collect 事件哈希', () => {
      // Collect(address,address,int24,int24,uint256,uint256) 的 keccak256 哈希
      const collectHash = '0x70935338e69775456a85ddef226c395fb668b63fa0115f5f20610b388e6ca9c0';
      const registeredEvents = processor.getRegisteredEvents();
      expect(registeredEvents).toContain(collectHash);
    });
  });

  describe('处理 Swap 事件', () => {
    it('应该正确处理 Swap 事件', async () => {
      // Swap(address,address,int256,int256,uint256,uint128,int24) 的 keccak256 哈希
      const swapTopic = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
      const sender = '0x0000000000000000000000001111111111111111111111111111111111111111';
      const recipient = '0x0000000000000000000000002222222222222222222222222222222222222222';

      // 编码数据：amount0, amount1, sqrtPriceX96, liquidity, tick
      // 简化测试，使用空数据
      const data = '0x' + '00'.repeat(160); // 5 * 32 bytes

      await processor.processLog(
        {
          address: '0xPool',
          topics: [swapTopic, sender, recipient],
          data: data,
          transactionHash: '0xabc123',
          transactionIndex: 0,
          logIndex: 0,
        },
        {
          chainId: 1,
          contractAddress: '0xPool',
          contractName: 'USDC_WETH_3000',
          blockNumber: 100n,
          blockTimestamp: new Date('2024-01-01'),
        },
        { db: mockDb, logger: mockLogger }
      );

      // 验证 swapEvent.upsert 被调用
      expect(mockDb.swapEvent.upsert).toHaveBeenCalled();

      // 验证 event.upsert 被调用
      expect(mockDb.event.upsert).toHaveBeenCalled();

      // 验证事件名称
      const eventUpsertCall = mockDb.event.upsert.mock.calls[0][0];
      expect(eventUpsertCall.create.eventName).toBe('Swap');
    });

    it('应该正确存储 Swap 事件数据', async () => {
      const swapTopic = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
      const sender = '0x0000000000000000000000001111111111111111111111111111111111111111';
      const recipient = '0x0000000000000000000000002222222222222222222222222222222222222222';
      const data = '0x' + '00'.repeat(160);

      await processor.processLog(
        {
          address: '0xPool',
          topics: [swapTopic, sender, recipient],
          data: data,
          transactionHash: '0xabc123',
          transactionIndex: 0,
          logIndex: 0,
        },
        {
          chainId: 1,
          contractAddress: '0xPool',
          contractName: 'USDC_WETH_3000',
          blockNumber: 100n,
          blockTimestamp: new Date('2024-01-01'),
        },
        { db: mockDb, logger: mockLogger }
      );

      const swapUpsertCall = mockDb.swapEvent.upsert.mock.calls[0][0];
      expect(swapUpsertCall.create.chainId).toBe(1);
      expect(swapUpsertCall.create.poolName).toBe('USDC_WETH_3000');
      expect(swapUpsertCall.create.txHash).toBe('0xabc123');
    });
  });

  describe('处理 Mint 事件', () => {
    it('应该正确处理 Mint 事件', async () => {
      // Mint(address,address,int24,int24,uint128,uint256,uint256) 的 keccak256 哈希
      const mintTopic = '0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0f47';
      const owner = '0x0000000000000000000000001111111111111111111111111111111111111111';
      const tickLower = '0x000000000000000000000000000000000000000000000000000000000000c350'; // -10000
      const tickUpper = '0x0000000000000000000000000000000000000000000000000000000000007530'; // 30000

      const data = '0x' + '00'.repeat(160); // 5 * 32 bytes

      await processor.processLog(
        {
          address: '0xPool',
          topics: [mintTopic, owner, tickLower, tickUpper],
          data: data,
          transactionHash: '0xabc123',
          transactionIndex: 0,
          logIndex: 0,
        },
        {
          chainId: 1,
          contractAddress: '0xPool',
          contractName: 'USDC_WETH_3000',
          blockNumber: 100n,
          blockTimestamp: new Date('2024-01-01'),
        },
        { db: mockDb, logger: mockLogger }
      );

      // 验证 event.upsert 被调用
      expect(mockDb.event.upsert).toHaveBeenCalled();

      const eventUpsertCall = mockDb.event.upsert.mock.calls[0][0];
      expect(eventUpsertCall.create.eventName).toBe('Mint');
    });
  });

  describe('处理 Burn 事件', () => {
    it('应该正确处理 Burn 事件', async () => {
      // Burn(address,int24,int24,uint128,uint256,uint256) 的 keccak256 哈希
      const burnTopic = '0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c';
      const owner = '0x0000000000000000000000001111111111111111111111111111111111111111';
      const tickLower = '0x000000000000000000000000000000000000000000000000000000000000c350';
      const tickUpper = '0x0000000000000000000000000000000000000000000000000000000000007530';

      const data = '0x' + '00'.repeat(128); // 4 * 32 bytes

      await processor.processLog(
        {
          address: '0xPool',
          topics: [burnTopic, owner, tickLower, tickUpper],
          data: data,
          transactionHash: '0xabc123',
          transactionIndex: 0,
          logIndex: 0,
        },
        {
          chainId: 1,
          contractAddress: '0xPool',
          contractName: 'USDC_WETH_3000',
          blockNumber: 100n,
          blockTimestamp: new Date('2024-01-01'),
        },
        { db: mockDb, logger: mockLogger }
      );

      expect(mockDb.event.upsert).toHaveBeenCalled();

      const eventUpsertCall = mockDb.event.upsert.mock.calls[0][0];
      expect(eventUpsertCall.create.eventName).toBe('Burn');
    });
  });

  describe('处理 Collect 事件', () => {
    it('应该正确处理 Collect 事件', async () => {
      // Collect(address,address,int24,int24,uint256,uint256) 的 keccak256 哈希
      const collectTopic = '0x70935338e69775456a85ddef226c395fb668b63fa0115f5f20610b388e6ca9c0';
      const owner = '0x0000000000000000000000001111111111111111111111111111111111111111';
      const tickLower = '0x000000000000000000000000000000000000000000000000000000000000c350';
      const tickUpper = '0x0000000000000000000000000000000000000000000000000000000000007530';

      const data = '0x' + '00'.repeat(128); // 4 * 32 bytes

      await processor.processLog(
        {
          address: '0xPool',
          topics: [collectTopic, owner, tickLower, tickUpper],
          data: data,
          transactionHash: '0xabc123',
          transactionIndex: 0,
          logIndex: 0,
        },
        {
          chainId: 1,
          contractAddress: '0xPool',
          contractName: 'USDC_WETH_3000',
          blockNumber: 100n,
          blockTimestamp: new Date('2024-01-01'),
        },
        { db: mockDb, logger: mockLogger }
      );

      expect(mockDb.event.upsert).toHaveBeenCalled();

      const eventUpsertCall = mockDb.event.upsert.mock.calls[0][0];
      expect(eventUpsertCall.create.eventName).toBe('Collect');
    });
  });

  describe('不处理其他事件', () => {
    it('对于未注册的事件应该返回 null', async () => {
      // Transfer 事件的 topic（不应该被 Uniswap V3 处理器处理）
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

      const result = await processor.processLog(
        {
          address: '0xToken',
          topics: [transferTopic],
          data: '0x',
          transactionHash: '0xabc123',
          transactionIndex: 0,
          logIndex: 0,
        },
        {
          chainId: 1,
          contractAddress: '0xToken',
          contractName: 'USDC',
          blockNumber: 100n,
          blockTimestamp: new Date('2024-01-01'),
        },
        { db: mockDb, logger: mockLogger }
      );

      expect(result).toBeNull();
    });
  });
});