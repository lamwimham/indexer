import { decodeEventLog, keccak256, toHex, type Abi, type Address } from 'viem';
import type { Logger } from '../utils/logger.js';
import type { EventHandler, HandlerContext } from '../types/index.js';

/**
 * Event definition with handler
 */
export interface EventDefinition {
  /** Event signature (e.g., "Transfer(address,address,uint256)") */
  signature: string;
  /** Event ABI item */
  abi: Abi[number];
  /** Handler function */
  handler: EventHandler;
}

/**
 * Event processor for decoding and dispatching events
 */
export class EventProcessor {
  private eventDefinitions: Map<string, EventDefinition> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'event-processor' });
  }

  /**
   * Register an event handler
   */
  registerEvent(definition: EventDefinition): void {
    // Hash the signature to get the topic[0] value
    const signatureHash = keccak256(toHex(definition.signature));
    this.eventDefinitions.set(signatureHash, definition);
    this.logger.debug(
      { signature: definition.signature, hash: signatureHash },
      'Event registered'
    );
  }

  /**
   * Register multiple events
   */
  registerEvents(definitions: EventDefinition[]): void {
    for (const def of definitions) {
      this.registerEvent(def);
    }
  }

  /**
   * Get registered event signatures
   */
  getRegisteredEvents(): string[] {
    return Array.from(this.eventDefinitions.keys());
  }

  /**
   * Process a log entry
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
    // Get event signature from first topic
    const eventSignature = log.topics[0];
    if (!eventSignature) {
      return null;
    }

    // Find matching event definition
    const definition = this.eventDefinitions.get(eventSignature);
    if (!definition) {
      this.logger.trace(
        { signature: eventSignature },
        'No handler for event signature'
      );
      return null;
    }

    try {
      // Decode the event log
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

      // Call the handler
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
   * Process multiple logs
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
 * Create event signature from ABI event
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