import type { EventProcessor } from './event-processor.js';
import type { Logger } from '../utils/logger.js';

/**
 * 处理器注册表
 * 根据合约名称或地址选择合适的处理器
 */
export class ProcessorRegistry {
  private processors: Map<string, EventProcessor> = new Map();
  private defaultProcessors: EventProcessor[] = [];
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'processor-registry' });
  }

  /**
   * 注册处理器
   * @param key 合约名称或地址
   * @param processor 处理器实例
   */
  register(key: string, processor: EventProcessor): void {
    const normalizedKey = key.toLowerCase();
    this.processors.set(normalizedKey, processor);
    this.logger.debug({ key: normalizedKey }, 'Processor registered');
  }

  /**
   * 注册默认处理器（处理所有合约）
   * @param processor 处理器实例
   */
  registerDefault(processor: EventProcessor): void {
    this.defaultProcessors.push(processor);
    this.logger.debug('Default processor registered');
  }

  /**
   * 获取处理器列表
   * @param contractName 合约名称
   * @param contractAddress 合约地址
   * @returns 匹配的处理器列表
   */
  getProcessors(contractName: string, contractAddress: string): EventProcessor[] {
    const processors: EventProcessor[] = [];

    // 按名称查找
    const byName = this.processors.get(contractName.toLowerCase());
    if (byName) {
      processors.push(byName);
    }

    // 按地址查找
    const byAddress = this.processors.get(contractAddress.toLowerCase());
    if (byAddress && !processors.includes(byAddress)) {
      processors.push(byAddress);
    }

    // 添加默认处理器（去重）
    for (const defaultProcessor of this.defaultProcessors) {
      if (!processors.includes(defaultProcessor)) {
        processors.push(defaultProcessor);
      }
    }

    return processors;
  }

  /**
   * 检查是否有处理器
   */
  hasProcessors(): boolean {
    return this.processors.size > 0 || this.defaultProcessors.length > 0;
  }

  /**
   * 获取所有已注册的键
   */
  getRegisteredKeys(): string[] {
    return Array.from(this.processors.keys());
  }

  /**
   * 清除所有处理器
   */
  clear(): void {
    this.processors.clear();
    this.defaultProcessors = [];
    this.logger.debug('All processors cleared');
  }
}