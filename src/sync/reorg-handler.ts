import type { Logger } from '../utils/logger.js';
import type { BlockCheckpointRepository, EventRepository, TransferEventRepository } from '../storage/index.js';
import type { RpcClient } from './rpc-client.js';

/**
 * Reorg handler for detecting and handling chain reorganizations
 */
export class ReorgHandler {
  private rpcClient: RpcClient;
  private checkpointRepo: BlockCheckpointRepository;
  private eventRepo: EventRepository;
  private transferRepo: TransferEventRepository | null;
  private logger: Logger;
  private confirmations: number;

  constructor(
    rpcClient: RpcClient,
    checkpointRepo: BlockCheckpointRepository,
    eventRepo: EventRepository,
    transferRepo: TransferEventRepository | null,
    logger: Logger,
    confirmations: number = 12
  ) {
    this.rpcClient = rpcClient;
    this.checkpointRepo = checkpointRepo;
    this.eventRepo = eventRepo;
    this.transferRepo = transferRepo;
    this.logger = logger;
    this.confirmations = confirmations;
  }

  /**
   * Check for reorg by comparing stored checkpoints with current chain
   */
  async detectReorg(chainId: number): Promise<{
    hasReorg: boolean;
    reorgDepth: number;
    lastValidBlock: bigint | null;
  }> {
    const latestCheckpoint = await this.checkpointRepo.getLatest(chainId);

    if (!latestCheckpoint) {
      return { hasReorg: false, reorgDepth: 0, lastValidBlock: null };
    }

    // Check the last few checkpoints for reorg
    const checkDepth = Math.min(this.confirmations, 50);
    const latestBlockNumber = BigInt(latestCheckpoint.blockNumber);
    const startBlock = latestBlockNumber - BigInt(checkDepth);

    const checkpoints = await this.checkpointRepo.getRange(
      chainId,
      startBlock,
      latestBlockNumber
    );

    for (const checkpoint of checkpoints) {
      const checkpointBlockNumber = BigInt(checkpoint.blockNumber);
      const currentBlock = await this.rpcClient.getBlock(checkpointBlockNumber);

      if (currentBlock.hash !== checkpoint.blockHash) {
        this.logger.warn(
          {
            blockNumber: checkpoint.blockNumber,
            expectedHash: checkpoint.blockHash,
            actualHash: currentBlock.hash,
          },
          'Reorg detected'
        );

        // Find the last valid block
        const lastValid = await this.findLastValidBlock(chainId, checkpointBlockNumber);

        return {
          hasReorg: true,
          reorgDepth: Number(latestBlockNumber - (lastValid ?? 0n)),
          lastValidBlock: lastValid,
        };
      }
    }

    return { hasReorg: false, reorgDepth: 0, lastValidBlock: null };
  }

  /**
   * Find the last valid block before reorg
   */
  private async findLastValidBlock(
    chainId: number,
    fromInvalidBlock: bigint
  ): Promise<bigint | null> {
    let currentBlock = fromInvalidBlock - 1n;
    const maxDepth = 100n;

    while (currentBlock >= 0n && fromInvalidBlock - currentBlock <= maxDepth) {
      const checkpoint = await this.checkpointRepo.get(chainId, currentBlock);

      if (!checkpoint) {
        currentBlock -= 1n;
        continue;
      }

      const actualBlock = await this.rpcClient.getBlock(currentBlock);

      if (actualBlock.hash === checkpoint.blockHash) {
        return currentBlock;
      }

      currentBlock -= 1n;
    }

    return null;
  }

  /**
   * Handle reorg by rolling back data
   */
  async handleReorg(
    chainId: number,
    fromBlock: bigint
  ): Promise<void> {
    this.logger.info(
      { chainId, fromBlock: fromBlock.toString() },
      'Handling reorg - rolling back data'
    );

    // Get the latest checkpoint to determine the extent of rollback
    const latestCheckpoint = await this.checkpointRepo.getLatest(chainId);
    if (!latestCheckpoint) {
      this.logger.warn('No checkpoints found, nothing to roll back');
      return;
    }

    const toBlock = BigInt(latestCheckpoint.blockNumber);

    if (toBlock < fromBlock) {
      this.logger.warn('No data to roll back');
      return;
    }

    // Delete events in the reorged range
    await this.eventRepo.deleteByBlockRange(chainId, fromBlock, toBlock);

    // Delete transfer events if repository exists
    if (this.transferRepo) {
      await this.transferRepo.deleteByBlockRange(chainId, fromBlock, toBlock);
    }

    // Delete checkpoints in the reorged range
    await this.checkpointRepo.deleteRange(chainId, fromBlock, toBlock);

    this.logger.info(
      {
        chainId,
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
      },
      'Reorg handling complete - data rolled back'
    );
  }

  /**
   * Save block checkpoint for reorg detection
   */
  async saveCheckpoint(
    chainId: number,
    blockNumber: bigint,
    blockHash: string,
    timestamp: Date
  ): Promise<void> {
    await this.checkpointRepo.save(chainId, blockNumber, blockHash, timestamp);
  }
}