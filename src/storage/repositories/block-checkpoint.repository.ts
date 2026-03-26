import type { PrismaClient } from '@prisma/client';

/**
 * Repository for block checkpoints (reorg detection)
 */
export class BlockCheckpointRepository {
  constructor(private db: PrismaClient) {}

  /**
   * Save a block checkpoint
   */
  async save(
    chainId: number,
    blockNumber: bigint,
    blockHash: string,
    timestamp: Date
  ) {
    return this.db.blockCheckpoint.upsert({
      where: {
        chainId_blockNumber: {
          chainId,
          blockNumber: blockNumber.toString(),
        },
      },
      update: {
        blockHash,
        timestamp,
      },
      create: {
        chainId,
        blockNumber: blockNumber.toString(),
        blockHash,
        timestamp,
      },
    });
  }

  /**
   * Get checkpoint for a block
   */
  async get(chainId: number, blockNumber: bigint) {
    return this.db.blockCheckpoint.findUnique({
      where: {
        chainId_blockNumber: {
          chainId,
          blockNumber: blockNumber.toString(),
        },
      },
    });
  }

  /**
   * Get latest checkpoint
   */
  async getLatest(chainId: number) {
    return this.db.blockCheckpoint.findFirst({
      where: { chainId },
      orderBy: { blockNumber: 'desc' },
    });
  }

  /**
   * Delete checkpoints in range (after reorg)
   */
  async deleteRange(chainId: number, fromBlock: bigint, toBlock: bigint) {
    return this.db.blockCheckpoint.deleteMany({
      where: {
        chainId,
        blockNumber: { gte: fromBlock.toString(), lte: toBlock.toString() },
      },
    });
  }

  /**
   * Get checkpoints in range
   */
  async getRange(chainId: number, fromBlock: bigint, toBlock: bigint) {
    return this.db.blockCheckpoint.findMany({
      where: {
        chainId,
        blockNumber: { gte: fromBlock.toString(), lte: toBlock.toString() },
      },
      orderBy: { blockNumber: 'asc' },
    });
  }
}