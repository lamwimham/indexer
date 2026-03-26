import type { PrismaClient } from '@prisma/client';
import type { Address } from 'viem';

/**
 * 事件存储仓库
 */
export class EventRepository {
  constructor(private db: PrismaClient) {}

  /**
   * 批量插入事件
   */
  async insertBatch(events: Array<{
    chainId: number;
    contractAddress: Address;
    contractName: string;
    eventName: string;
    blockNumber: bigint;
    blockTimestamp: Date;
    txHash: Address;
    txIndex: number;
    logIndex: number;
    args: Record<string, unknown>;
    rawData: string;
  }>) {
    if (events.length === 0) return;

    return this.db.event.createMany({
      data: events.map((e) => ({
        chainId: e.chainId,
        contractAddress: e.contractAddress.toLowerCase(),
        contractName: e.contractName,
        eventName: e.eventName,
        blockNumber: e.blockNumber.toString(),
        blockTimestamp: e.blockTimestamp,
        txHash: e.txHash.toLowerCase(),
        txIndex: e.txIndex,
        logIndex: e.logIndex,
        args: JSON.stringify(e.args),
        rawData: e.rawData,
      })),
    });
  }

  /**
   * 标记事件为已移除（用于重组处理）
   */
  async markAsRemoved(
    chainId: number,
    fromBlock: bigint,
    toBlock: bigint
  ) {
    return this.db.event.updateMany({
      where: {
        chainId,
        blockNumber: { gte: fromBlock.toString(), lte: toBlock.toString() },
      },
      data: { removed: true },
    });
  }

  /**
   * 删除指定区块范围内的事件（用于重组的硬删除）
   */
  async deleteByBlockRange(
    chainId: number,
    fromBlock: bigint,
    toBlock: bigint
  ) {
    return this.db.event.deleteMany({
      where: {
        chainId,
        blockNumber: { gte: fromBlock.toString(), lte: toBlock.toString() },
      },
    });
  }

  /**
   * 根据条件查询事件
   */
  async query(filters: {
    chainId?: number;
    contractAddress?: Address;
    eventName?: string;
    fromBlock?: bigint;
    toBlock?: bigint;
    limit?: number;
    offset?: number;
    orderBy?: 'blockNumber' | 'blockTimestamp';
    orderDirection?: 'asc' | 'desc';
  }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { removed: false };

    if (filters.chainId !== undefined) {
      where.chainId = filters.chainId;
    }
    if (filters.contractAddress) {
      where.contractAddress = filters.contractAddress.toLowerCase();
    }
    if (filters.eventName) {
      where.eventName = filters.eventName;
    }
    if (filters.fromBlock !== undefined || filters.toBlock !== undefined) {
      where.blockNumber = {};
      if (filters.fromBlock !== undefined) {
        where.blockNumber.gte = filters.fromBlock.toString();
      }
      if (filters.toBlock !== undefined) {
        where.blockNumber.lte = filters.toBlock.toString();
      }
    }

    return this.db.event.findMany({
      where,
      take: filters.limit ?? 100,
      skip: filters.offset ?? 0,
      orderBy: {
        [filters.orderBy ?? 'blockNumber']: filters.orderDirection ?? 'desc',
      },
    });
  }

  /**
   * 根据条件统计事件数量
   */
  async count(filters: {
    chainId?: number;
    contractAddress?: Address;
    eventName?: string;
  }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { removed: false };

    if (filters.chainId !== undefined) {
      where.chainId = filters.chainId;
    }
    if (filters.contractAddress) {
      where.contractAddress = filters.contractAddress.toLowerCase();
    }
    if (filters.eventName) {
      where.eventName = filters.eventName;
    }

    return this.db.event.count({ where });
  }

  /**
   * 获取合约的唯一事件名称列表
   */
  async getEventNames(chainId: number, contractAddress: Address) {
    const result = await this.db.event.findMany({
      where: {
        chainId,
        contractAddress: contractAddress.toLowerCase(),
        removed: false,
      },
      select: { eventName: true },
      distinct: ['eventName'],
    });
    return result.map((r) => r.eventName);
  }
}