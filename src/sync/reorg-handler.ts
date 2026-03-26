import type { Logger } from '../utils/logger.js';
import type { BlockCheckpointRepository, EventRepository, TransferEventRepository } from '../storage/index.js';
import type { RpcClient } from './rpc-client.js';

/**
 * 重组处理器，用于检测和处理链重组
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
   * 通过比较存储的检查点与当前链来检测重组
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

    // 检查最近的几个检查点是否有重组
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

        // 查找最后一个有效区块
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
   * 查找重组前的最后一个有效区块
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
   * 通过回滚数据来处理重组
   */
  async handleReorg(
    chainId: number,
    fromBlock: bigint
  ): Promise<void> {
    this.logger.info(
      { chainId, fromBlock: fromBlock.toString() },
      'Handling reorg - rolling back data'
    );

    // 获取最新检查点以确定回滚范围
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

    // 删除重组范围内的事件
    await this.eventRepo.deleteByBlockRange(chainId, fromBlock, toBlock);

    // 如果存在转账事件仓库，则删除转账事件
    if (this.transferRepo) {
      await this.transferRepo.deleteByBlockRange(chainId, fromBlock, toBlock);
    }

    // 删除重组范围内的检查点
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
   * 保存区块检查点用于重组检测
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