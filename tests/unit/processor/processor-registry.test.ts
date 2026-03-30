import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessorRegistry } from '../../../src/processor/processor-registry.js';
import { EventProcessor } from '../../../src/processor/event-processor.js';
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

// 模拟处理器
const createMockProcessor = (): EventProcessor => {
  return {
    getRegisteredEvents: vi.fn().mockReturnValue([]),
    processLog: vi.fn(),
    processLogs: vi.fn(),
    registerEvent: vi.fn(),
    registerEvents: vi.fn(),
  } as unknown as EventProcessor;
};

describe('ProcessorRegistry', () => {
  let registry: ProcessorRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ProcessorRegistry(mockLogger);
  });

  describe('register', () => {
    it('应该注册处理器', () => {
      const processor = createMockProcessor();
      registry.register('USDC', processor);

      const keys = registry.getRegisteredKeys();
      expect(keys).toContain('usdc');
    });

    it('键应该不区分大小写', () => {
      const processor = createMockProcessor();
      registry.register('USDC', processor);

      const keys = registry.getRegisteredKeys();
      expect(keys).toContain('usdc');
    });
  });

  describe('registerDefault', () => {
    it('应该注册默认处理器', () => {
      const processor = createMockProcessor();
      registry.registerDefault(processor);

      expect(registry.hasProcessors()).toBe(true);
    });
  });

  describe('getProcessors', () => {
    it('应该返回按名称匹配的处理器', () => {
      const erc20Processor = createMockProcessor();
      const uniswapProcessor = createMockProcessor();

      registry.register('USDC', erc20Processor);
      registry.register('Pool_USDC_WETH', uniswapProcessor);

      const processors = registry.getProcessors('USDC', '0x123');
      expect(processors).toContain(erc20Processor);
      expect(processors).not.toContain(uniswapProcessor);
    });

    it('应该返回按地址匹配的处理器', () => {
      const erc20Processor = createMockProcessor();
      const uniswapProcessor = createMockProcessor();

      registry.register('USDC', erc20Processor);
      registry.register('0xABC', uniswapProcessor);

      const processors = registry.getProcessors('Unknown', '0xABC');
      expect(processors).toContain(uniswapProcessor);
    });

    it('应该返回默认处理器', () => {
      const defaultProcessor = createMockProcessor();
      registry.registerDefault(defaultProcessor);

      const processors = registry.getProcessors('Unknown', '0xUnknown');
      expect(processors).toContain(defaultProcessor);
    });

    it('应该去重处理器', () => {
      const processor = createMockProcessor();
      registry.register('USDC', processor);
      registry.register('0xABC', processor);
      registry.registerDefault(processor);

      const processors = registry.getProcessors('USDC', '0xABC');
      expect(processors.length).toBe(1);
      expect(processors[0]).toBe(processor);
    });

    it('应该返回名称和地址匹配的处理器', () => {
      const processor1 = createMockProcessor();
      const processor2 = createMockProcessor();

      registry.register('USDC', processor1);
      registry.register('0xABC', processor2);

      const processors = registry.getProcessors('USDC', '0xABC');
      expect(processors).toContain(processor1);
      expect(processors).toContain(processor2);
    });

    it('名称匹配应该不区分大小写', () => {
      const processor = createMockProcessor();
      registry.register('USDC', processor);

      const processors = registry.getProcessors('usdc', '0x123');
      expect(processors).toContain(processor);
    });

    it('地址匹配应该不区分大小写', () => {
      const processor = createMockProcessor();
      registry.register('0xABCDEF', processor);

      const processors = registry.getProcessors('Unknown', '0xabcdef');
      expect(processors).toContain(processor);
    });
  });

  describe('hasProcessors', () => {
    it('没有处理器时应该返回 false', () => {
      expect(registry.hasProcessors()).toBe(false);
    });

    it('有注册处理器时应该返回 true', () => {
      const processor = createMockProcessor();
      registry.register('USDC', processor);

      expect(registry.hasProcessors()).toBe(true);
    });

    it('有默认处理器时应该返回 true', () => {
      const processor = createMockProcessor();
      registry.registerDefault(processor);

      expect(registry.hasProcessors()).toBe(true);
    });
  });

  describe('getRegisteredKeys', () => {
    it('应该返回所有已注册的键', () => {
      const processor = createMockProcessor();
      registry.register('USDC', processor);
      registry.register('WETH', processor);
      registry.register('0xABC', processor);

      const keys = registry.getRegisteredKeys();
      expect(keys.length).toBe(3);
      expect(keys).toContain('usdc');
      expect(keys).toContain('weth');
      expect(keys).toContain('0xabc');
    });

    it('默认处理器不应该出现在键列表中', () => {
      const processor = createMockProcessor();
      registry.registerDefault(processor);

      const keys = registry.getRegisteredKeys();
      expect(keys.length).toBe(0);
    });
  });

  describe('clear', () => {
    it('应该清除所有处理器', () => {
      const processor = createMockProcessor();
      registry.register('USDC', processor);
      registry.registerDefault(processor);

      registry.clear();

      expect(registry.hasProcessors()).toBe(false);
      expect(registry.getRegisteredKeys().length).toBe(0);
    });
  });

  describe('实际使用场景', () => {
    it('Pool 合约应该使用 Uniswap V3 处理器', () => {
      const erc20Processor = createMockProcessor();
      const uniswapProcessor = createMockProcessor();

      registry.registerDefault(erc20Processor);
      registry.register('Pool_USDC_WETH_3000', uniswapProcessor);

      const processors = registry.getProcessors('Pool_USDC_WETH_3000', '0xPool');
      expect(processors).toContain(uniswapProcessor);
      expect(processors).toContain(erc20Processor); // 默认处理器也应该被包含
    });

    it('普通代币合约应该只使用 ERC20 处理器', () => {
      const erc20Processor = createMockProcessor();
      const uniswapProcessor = createMockProcessor();

      registry.registerDefault(erc20Processor);
      registry.register('Pool_USDC_WETH_3000', uniswapProcessor);

      const processors = registry.getProcessors('USDC', '0xUSDC');
      expect(processors).toContain(erc20Processor);
      expect(processors).not.toContain(uniswapProcessor);
    });
  });
});