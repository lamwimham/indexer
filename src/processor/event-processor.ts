import { decodeEventLog, keccak256, toHex, type Abi, type Address } from 'viem';
import type { Logger } from '../utils/logger.js';
import type { EventHandler, HandlerContext } from '../types/index.js';

/**
 * 带有处理器的事件定义
 */
export interface EventDefinition {
  /** 事件签名（例如："Transfer(address,address,uint256)"） */
  signature: string;
  /** 事件 ABI 项 */
  abi: Abi[number];
  /** 处理器函数 */
  handler: EventHandler;
}

/**
 * 事件处理器，用于解码和分发事件
 */
export class EventProcessor {
  private eventDefinitions: Map<string, EventDefinition> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'event-processor' });
  }

  /**
   * 注册事件处理器
   */
  registerEvent(definition: EventDefinition): void {
    // 对签名进行哈希以获取 topic[0] 值
    const signatureHash = keccak256(toHex(definition.signature));
    this.eventDefinitions.set(signatureHash, definition);
    this.logger.debug(
      { signature: definition.signature, hash: signatureHash },
      'Event registered'
    );
  }

  /**
   * 注册多个事件
   */
  registerEvents(definitions: EventDefinition[]): void {
    for (const def of definitions) {
      this.registerEvent(def);
    }
  }

  /**
   * 获取已注册的事件签名
   */
  getRegisteredEvents(): string[] {
    return Array.from(this.eventDefinitions.keys());
  }

  /**
   * 处理日志条目
   */
  async processLog(
    log: {
      address: string;
      topics: string[];
      data: string;
      transactionHash: string;
      transactionIndex: number;
      logIndex: number;
    },
    context: {
      chainId: number;
      contractAddress: Address;
      contractName: string;
      blockNumber: bigint;
      blockTimestamp: Date;
    },
    dbContext: HandlerContext
  ): Promise<{
    eventName: string;
    args: Record<string, unknown>;
  } | null> {
    // 从第一个 topic 获取事件签名
    const eventSignature = log.topics[0];
    if (!eventSignature) {
      return null;
    }

    // 查找匹配的事件定义
    const definition = this.eventDefinitions.get(eventSignature);
    if (!definition) {
      this.logger.trace(
        { signature: eventSignature },
        'No handler for event signature'
      );
      return null;
    }

    try {
      // 解码事件日志
      const decoded = decodeEventLog({
        abi: [definition.abi],
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });

      const eventName = decoded.eventName;
      const args = decoded.args as Record<string, unknown>;

      this.logger.debug(
        {
          eventName,
          contractAddress: context.contractAddress,
          blockNumber: context.blockNumber.toString(),
          txHash: log.transactionHash,
        },
        'Processing event'
      );

      // 调用处理器
      await definition.handler(
        {
          args,
          blockNumber: context.blockNumber,
          blockTimestamp: context.blockTimestamp,
          transactionHash: log.transactionHash as Address,
          logIndex: log.logIndex,
          chainId: context.chainId,
          contractAddress: context.contractAddress,
          contractName: context.contractName,
        },
        dbContext
      );

      return { eventName, args };
    } catch (error) {
      this.logger.error(
        { error, signature: eventSignature, log },
        'Failed to decode or process event'
      );
      throw error;
    }
  }

  /**
   * 处理多个日志
   */
  async processLogs(
    logs: Array<{
      address: string;
      topics: string[];
      data: string;
      transactionHash: string;
      transactionIndex: number;
      logIndex: number;
    }>,
    context: {
      chainId: number;
      contractAddress: Address;
      contractName: string;
      blockNumber: bigint;
      blockTimestamp: Date;
    },
    dbContext: HandlerContext
  ): Promise<Array<{
    eventName: string;
    args: Record<string, unknown>;
  }>> {
    const results: Array<{
      eventName: string;
      args: Record<string, unknown>;
    }> = [];

    for (const log of logs) {
      const result = await this.processLog(log, context, dbContext);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }
}

/**
 * 从 ABI 事件创建事件签名
 */
export function createEventSignature(abiEvent: Abi[number]): string {
  if (abiEvent.type !== 'event') {
    throw new Error('ABI item is not an event');
  }

  const inputs = (abiEvent.inputs ?? [])
    .map((input) => {
      if (typeof input.type === 'string') {
        return input.type;
      }
      return 'unknown';
    })
    .join(',');

  return `${abiEvent.name}(${inputs})`;
}