import type { Log, Block } from 'viem';
import type { RpcClient } from './rpc-client.js';
import type { Logger } from '../utils/logger.js';
import { withRetry, isRetryableError } from '../utils/retry.js';

/**
 * 获取的区块数据及其日志
 */
export interface FetchedBlock {
  block: Block;
  logs: Log[];
}

/**
 * 区块获取器，支持批处理和重试
 */
export class BlockFetcher {
  private rpcClient: RpcClient;
  private logger: Logger;
  private maxConcurrentRequests: number;

  constructor(
    rpcClient: RpcClient,
    logger: Logger,
    maxConcurrentRequests: number = 5
  ) {
    this.rpcClient = rpcClient;
    this.logger = logger;
    this.maxConcurrentRequests = maxConcurrentRequests;
  }

  /**
   * 获取单个区块及其日志
   */
  async fetchBlock(blockNumber: bigint): Promise<FetchedBlock> {
    return withRetry(
      async () => {
        const [block, logs] = await Promise.all([
          this.rpcClient.getBlock(blockNumber),
          this.rpcClient.getLogs({
            fromBlock: blockNumber,
            toBlock: blockNumber,
          }),
        ]);

        return { block, logs };
      },
      {
        maxRetries: 3,
        initialDelay: 1000,
        shouldRetry: isRetryableError,
        logger: this.logger,
      }
    );
  }

  /**
   * 获取一个区块范围及其日志
   */
  async fetchBlockRange(
    fromBlock: bigint,
    toBlock: bigint,
    contractAddresses?: `0x${string}`[]
  ): Promise<FetchedBlock[]> {
    const blockCount = Number(toBlock - fromBlock) + 1;
    this.logger.debug(
      { fromBlock: fromBlock.toString(), toBlock: toBlock.toString(), blockCount },
      'Fetching block range'
    );

    // 一次性获取整个范围的日志（更高效）
    const logs = await withRetry(
      () =>
        this.rpcClient.getLogs({
          fromBlock,
          toBlock,
          address: contractAddresses as `0x${string}` | `0x${string}`[] | undefined,
        }),
      {
        maxRetries: 3,
        initialDelay: 1000,
        shouldRetry: isRetryableError,
        logger: this.logger,
      }
    );

    // 获取区块头（不含交易）以获取时间戳
    const blockNumbers = Array.from(
      { length: blockCount },
      (_, i) => fromBlock + BigInt(i)
    );

    // 分批获取区块以避免压垮RPC
    const blocks: Block[] = [];
    for (let i = 0; i < blockNumbers.length; i += this.maxConcurrentRequests) {
      const batch = blockNumbers.slice(i, i + this.maxConcurrentRequests);
      const batchBlocks = await Promise.all(
        batch.map((bn) =>
          withRetry(
            () => this.rpcClient.getBlock(bn),
            {
              maxRetries: 3,
              initialDelay: 1000,
              shouldRetry: isRetryableError,
              logger: this.logger,
            }
          )
        )
      );
      blocks.push(...batchBlocks);
    }

    // 按区块号对日志进行分组
    const logsByBlock = new Map<bigint, Log[]>();
    for (const log of logs) {
      const blockNum = log.blockNumber;
      if (!logsByBlock.has(blockNum)) {
        logsByBlock.set(blockNum, []);
      }
      logsByBlock.get(blockNum)!.push(log);
    }

    // 将区块与其日志合并
    return blocks.map((block) => ({
      block,
      logs: logsByBlock.get(block.number!) ?? [],
    }));
  }

  /**
   * 获取带确认数的最新区块号
   */
  async getLatestBlockWithConfirmations(confirmations: number): Promise<bigint> {
    const latestBlock = await this.rpcClient.getLatestBlockNumber();
    return latestBlock - BigInt(confirmations);
  }

  /**
   * 检查链重组
   */
  async checkReorg(blockNumber: bigint, expectedHash: string): Promise<boolean> {
    try {
      const block = await this.rpcClient.getBlock(blockNumber);
      return block.hash !== expectedHash;
    } catch (error) {
      this.logger.error(
        { error, blockNumber: blockNumber.toString() },
        'Error checking reorg'
      );
      return false;
    }
  }

  /**
   * Find the common ancestor after a reorg
   */
  async findCommonAncestor(
    fromBlock: bigint,
    knownHashes: Map<bigint, string>
  ): Promise<bigint | null> {
    let currentBlock = fromBlock;

    while (currentBlock >= 0n) {
      const expectedHash = knownHashes.get(currentBlock);
      if (!expectedHash) {
        // No known hash for this block, can't verify
        return currentBlock;
      }

      const isReorged = await this.checkReorg(currentBlock, expectedHash);
      if (!isReorged) {
        this.logger.info(
          { blockNumber: currentBlock.toString() },
          'Found common ancestor after reorg'
        );
        return currentBlock;
      }

      currentBlock -= 1n;

      // Safety limit
      if (fromBlock - currentBlock > 100n) {
        this.logger.warn('Reorg depth exceeds 100 blocks, stopping search');
        return currentBlock;
      }
    }

    return null;
  }
}