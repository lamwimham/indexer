import type { PrismaClient } from '@prisma/client';

/**
 * 区块检查点仓库（用于重组检测）
 */
export class BlockCheckpointRepository {
  constructor(private db: PrismaClient) {}

  /**
   * 保存区块检查点
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
   * 获取指定区块的检查点
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
   * 获取最新的检查点
   */
  async getLatest(chainId: number) {
    return this.db.blockCheckpoint.findFirst({
      where: { chainId },
      orderBy: { blockNumber: 'desc' },
    });
  }

  /**
   * 删除指定范围内的检查点（重组后）
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
   * 获取指定范围内的检查点
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